import {
  CATEGORY_NAME_MAX,
  dashboardFileSchema,
  dashboardPath,
  parseDashboardFile,
  parseRepoFile,
  REPO_FILE_PATH,
  SECTION_NAME_MAX,
  serializeDashboardFile,
  serializeRepoFile,
  slugSchema,
} from "@steward/schema"
import { data } from "react-router"
import { z } from "zod"

import {
  invalidateSidebarCache,
  listDashboards,
} from "../lib/dashboard.server.ts"
import { DEFAULT_DASHBOARD } from "../lib/repos.ts"
import { requireDataRepo } from "../lib/repos.server.ts"
import { reorderAfterSectionEdit } from "../lib/sidebar-sections.ts"
import {
  commitFiles,
  deleteFile,
  getFile,
  GitHubError,
  putFile,
} from "../lib/github.server.ts"
import { requireAuth } from "../lib/session.server.ts"

/**
 * Dashboard lifecycle (ADR-0010). Unlike widget edits, creating or deleting
 * a dashboard commits directly — the layout file must exist server-side
 * before its route can render, so there is nothing to draft.
 */
const payloadSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("create"),
    /** Which data repo — gated by requireDataRepo (ADR-0023). */
    repo: z.string(),
    slug: slugSchema,
    /** Optional section to file the new board under (ADR-0039). Empty (after
        trim) → the repo's unlabeled lead section. */
    section: z.string().max(SECTION_NAME_MAX).optional(),
  }),
  z.object({
    intent: z.literal("edit"),
    repo: z.string(),
    slug: slugSchema,
    /** New section (the board's `section`). Empty (after trim) clears it — the
        board falls back to its repo's unlabeled lead section. The slug itself
        is immutable: it's the filename and the URL. */
    section: z.string().max(SECTION_NAME_MAX),
  }),
  z.object({
    intent: z.literal("delete"),
    repo: z.string(),
    slug: slugSchema,
  }),
  z.object({
    intent: z.literal("renameSection"),
    /** Which data repo — gated by requireDataRepo (ADR-0023). */
    repo: z.string(),
    /** The section being renamed and its new name — both non-blank (the rail
        only offers the menu on a real, named section). Every board filed under
        `from` moves to `to`; if `to` already exists they merge (ADR-0039). */
    from: z.string().min(1).max(SECTION_NAME_MAX),
    to: z.string().min(1).max(SECTION_NAME_MAX),
  }),
  z.object({
    intent: z.literal("deleteSection"),
    repo: z.string(),
    /** The section to dissolve: its boards fall back to the repo's unlabeled
        lead section (the boards themselves are untouched). */
    section: z.string().min(1).max(SECTION_NAME_MAX),
  }),
  z.object({
    intent: z.literal("reorderCategories"),
    repo: z.string(),
    /** The repo's whole band order (ADR-0044) — every category its routines
        use, in render order, replacing `categories:` wholesale. Sent whole
        rather than as a move because the list only carries the names it
        states: nudging one band has to write the rest down too, or the
        unlisted ones would jump (see `moveCategory`). Membership isn't here
        at all — that rides on each routine, through the board's draft. */
    categories: z.array(z.string().min(1).max(CATEGORY_NAME_MAX)),
  }),
])

export async function action({ request }: { request: Request }) {
  const auth = await requireAuth(request)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw data({ error: "invalid JSON" }, { status: 400 })
  }
  const parsed = payloadSchema.safeParse(body)
  if (!parsed.success) {
    throw data({ error: "invalid payload" }, { status: 400 })
  }
  const payload = parsed.data

  const dataRepo = await requireDataRepo(
    auth.token,
    auth.login,
    payload.repo,
    auth.dataRepo,
  )
  const repo = dataRepo.full

  // Band order (ADR-0044) is the one repo-level write that isn't about boards
  // at all: `categories:` in data/repo.yaml, committed directly like the
  // section order beside it. Band *membership* is a routine field and goes
  // through the board's draft (ADR-0003) — only the sequence lands here.
  if (payload.intent === "reorderCategories") {
    // Trim and dedupe: two spellings differing only in whitespace would render
    // as one band but list as two, and a repeated name makes orderCategories
    // emit nothing for the second (delete() consumes it) — a silent hole in
    // the order the user just set.
    const next = [
      ...new Set(payload.categories.map((name) => name.trim()).filter(Boolean)),
    ]
    try {
      const raw = await getFile(auth.token, repo, REPO_FILE_PATH, "main")
      // A repo.yaml that exists but doesn't parse is refused, not overwritten.
      // Every reader already degrades to "no order authored" on a malformed
      // file, so rewriting it here would silently drop whatever else the
      // author had in there (a `name:`, a `sections:` list) to fix a band
      // order. The section path never faces this — it only writes when the
      // parsed order actually changed, which a null parse can't do.
      let repoFile
      if (raw) {
        try {
          repoFile = parseRepoFile(raw.text)
        } catch {
          return data(
            { ok: false as const, error: "malformed" },
            { status: 422 },
          )
        }
      }
      const { categories: _drop, ...rest } = repoFile ?? {}
      await putFile(auth.token, repo, REPO_FILE_PATH, {
        content: serializeRepoFile(
          next.length ? { ...rest, categories: next } : rest,
        ),
        message: `config: reorder bands via steward`,
        branch: "main",
        // No sha creates the file; GitHub 422s a stale one, which the catch
        // below translates into the conflict the caller retries from.
        ...(raw ? { sha: raw.sha } : {}),
      })
    } catch (error) {
      if (
        error instanceof GitHubError &&
        (error.status === 409 || error.status === 422)
      ) {
        return data({ ok: false as const, error: "conflict" }, { status: 409 })
      }
      if (
        error instanceof GitHubError &&
        (error.status === 403 || error.status === 404)
      ) {
        return data({ ok: false as const, error: "denied" }, { status: 403 })
      }
      throw error
    }
    return { ok: true as const }
  }

  // Section rename/delete (ADR-0039) is a batch: a section isn't a record, just
  // a free-text `section` shared across boards, so editing it rewrites that
  // field on every board filed under it — plus the repo's `sections` order —
  // in one atomic commit (commitFiles). Handled here, ahead of the slug-based
  // paths, since these intents name a section, not a board.
  if (
    payload.intent === "renameSection" ||
    payload.intent === "deleteSection"
  ) {
    const from =
      payload.intent === "renameSection"
        ? payload.from.trim()
        : payload.section.trim()
    // null → delete: matching boards fall back to the unlabeled lead section.
    const to = payload.intent === "renameSection" ? payload.to.trim() : null
    if (!from || (payload.intent === "renameSection" && !to)) {
      return data({ ok: false as const, error: "invalid" }, { status: 400 })
    }
    // Renaming a section to its own name changes nothing — skip the reads and
    // the empty commit.
    if (to === from) return { ok: true as const }

    try {
      const slugs = (await listDashboards(auth.token, repo)) ?? []
      // Read every board so we can find the ones under `from`. A real read
      // failure (5xx/403/401) throws and is translated below — never a silent
      // half-rename; a 404 (file vanished) or a malformed layout is skipped
      // (it isn't safely rewritable, and the rail already treats it as
      // ungrouped).
      const boards = await Promise.all(
        slugs.map(async (slug) => {
          const raw = await getFile(
            auth.token,
            repo,
            dashboardPath(slug),
            "main",
          )
          if (!raw) return null
          try {
            return { slug, file: parseDashboardFile(raw.text) }
          } catch {
            return null
          }
        }),
      )

      const files: { path: string; content: string }[] = []
      for (const board of boards) {
        if (!board || board.file.section !== from) continue
        const { section: _was, ...rest } = board.file
        files.push({
          path: dashboardPath(board.slug),
          content: serializeDashboardFile(to ? { ...rest, section: to } : rest),
        })
      }

      // The `sections` order half: rename maps `from`→`to` in place (merging if
      // `to` is already listed), delete drops it. Best-effort on repo.yaml — a
      // malformed one is treated as no order, never a failed rename.
      const repoRaw = await getFile(auth.token, repo, REPO_FILE_PATH, "main")
      let repoFile
      try {
        repoFile = repoRaw ? parseRepoFile(repoRaw.text) : null
      } catch {
        repoFile = null
      }
      const order = repoFile?.sections ?? []
      const nextOrder = reorderAfterSectionEdit(
        order,
        to ? { rename: { from, to } } : { remove: from },
      )
      if (nextOrder.join("\0") !== order.join("\0")) {
        const { sections: _drop, ...restRepo } = repoFile ?? {}
        files.push({
          path: REPO_FILE_PATH,
          content: serializeRepoFile(
            nextOrder.length ? { ...restRepo, sections: nextOrder } : restRepo,
          ),
        })
      }

      // Nothing filed under the section and no order entry — a no-op (the
      // section was already gone). Refresh the rail and report success so the
      // dialog closes cleanly.
      if (files.length > 0) {
        await commitFiles(auth.token, repo, {
          branch: "main",
          message: to
            ? `config: rename section ${from} → ${to} via steward`
            : `config: remove section ${from} via steward`,
          files,
        })
      }
    } catch (error) {
      // Someone else pushed between the head read and the ref update — the
      // commit is no longer a fast-forward: a conflict, retry (mirrors the
      // single-file sha check).
      if (
        error instanceof GitHubError &&
        (error.status === 409 || error.status === 422)
      ) {
        return data({ ok: false as const, error: "conflict" }, { status: 409 })
      }
      // Read-only collaborator on a shared repo: a clean "denied".
      if (
        error instanceof GitHubError &&
        (error.status === 403 || error.status === 404)
      ) {
        return data({ ok: false as const, error: "denied" }, { status: 403 })
      }
      throw error
    }
    // The rail groups boards by section — drop its cache so the change shows on
    // the very next load.
    invalidateSidebarCache(auth.token)
    return { ok: true as const }
  }

  const path = dashboardPath(payload.slug)

  if (payload.intent === "create") {
    const section = payload.section?.trim()
    const empty = serializeDashboardFile(
      dashboardFileSchema.parse({
        ...(section ? { section } : {}),
        grid: {},
        widgets: [],
      }),
    )
    try {
      // No sha → create-only; GitHub 422s if the file already exists.
      await putFile(auth.token, repo, path, {
        content: empty,
        message: `config: create dashboard ${payload.slug} via steward`,
        branch: "main",
      })
    } catch (error) {
      if (error instanceof GitHubError && error.status === 422) {
        return data({ ok: false as const, error: "exists" }, { status: 409 })
      }
      // A read-only collaborator can reach a shared repo but not write it —
      // GitHub answers 403 (or 404 on some private repos). Surface it as a
      // clean "denied", not a 500 crash page.
      if (
        error instanceof GitHubError &&
        (error.status === 403 || error.status === 404)
      ) {
        return data({ ok: false as const, error: "denied" }, { status: 403 })
      }
      throw error
    }
    // The rail lists boards from the SWR cache (ADR-0030) — drop it so the
    // new board shows on the very next load.
    invalidateSidebarCache(auth.token)
    return { ok: true as const, slug: payload.slug }
  }

  if (payload.intent === "edit") {
    // Editing sets the board's section — a direct commit like the rest of the
    // lifecycle (ADR-0010). Any open draft on this board sees the base move and
    // resolves through the sync conflict path (ADR-0003).
    const current = await getFile(auth.token, repo, path, "main")
    if (!current) {
      return data({ ok: false as const, error: "missing" }, { status: 404 })
    }
    const { section: prevSection, ...file } = parseDashboardFile(current.text)
    // A blank value clears the section; drop the key when empty so an unset
    // section never serializes as `section: ""`.
    const section = payload.section.trim() || undefined
    const next = serializeDashboardFile({
      ...file,
      ...(section ? { section } : {}),
    })
    // Name the commit for what actually changed — git is visible here
    // (principle 3): "move" when the section changed, "edit" otherwise.
    const sectionChanged = (section ?? "") !== (prevSection ?? "")
    const verb = sectionChanged ? "move" : "edit"
    try {
      await putFile(auth.token, repo, path, {
        content: next,
        message: `config: ${verb} dashboard ${payload.slug} via steward`,
        branch: "main",
        sha: current.sha,
      })
    } catch (error) {
      // Stale sha — the file moved between the read and the PUT: a conflict,
      // not a 500, mirroring delete below.
      if (
        error instanceof GitHubError &&
        (error.status === 409 || error.status === 422)
      ) {
        return data({ ok: false as const, error: "conflict" }, { status: 409 })
      }
      // Read-only collaborator on a shared repo: a clean "denied".
      if (error instanceof GitHubError && error.status === 403) {
        return data({ ok: false as const, error: "denied" }, { status: 403 })
      }
      throw error
    }
    // The rail groups boards by section — drop its cache so the moved board
    // shows under its new section on the very next load.
    invalidateSidebarCache(auth.token)
    return { ok: true as const, slug: payload.slug }
  }

  // delete — routines are untouched: widgets reference routines, not the
  // other way around, so a routine keeps running for other dashboards.
  // Every repo's `main` is its default board (it backs `/` for the home
  // repo, and is the /r/:owner/:repo landing for every other) — protect it
  // in ALL repos, so a collaborator can't delete another user's default.
  if (payload.slug === DEFAULT_DASHBOARD) {
    throw data(
      { error: "cannot delete the default dashboard" },
      { status: 400 },
    )
  }
  const current = await getFile(auth.token, repo, path, "main")
  if (!current) {
    return data({ ok: false as const, error: "missing" }, { status: 404 })
  }
  try {
    await deleteFile(auth.token, repo, path, {
      message: `config: delete dashboard ${payload.slug} via steward`,
      sha: current.sha,
      branch: "main",
    })
  } catch (error) {
    // The file moved between the read above and the DELETE (another editor
    // synced): GitHub rejects the stale sha — surface a conflict, not a 500,
    // mirroring the sync route's translation (ADR-0003).
    if (
      error instanceof GitHubError &&
      (error.status === 409 || error.status === 422)
    ) {
      return data({ ok: false as const, error: "conflict" }, { status: 409 })
    }
    // Read-only collaborator on a shared repo: a clean "denied", not a 500.
    if (error instanceof GitHubError && error.status === 403) {
      return data({ ok: false as const, error: "denied" }, { status: 403 })
    }
    throw error
  }
  // Same as create: the rail must drop the board on the very next load.
  invalidateSidebarCache(auth.token)
  return { ok: true as const, slug: payload.slug }
}
