import {
  dashboardFileSchema,
  dashboardPath,
  parseDashboardFile,
  SECTION_NAME_MAX,
  serializeDashboardFile,
  slugSchema,
} from "@steward/schema"
import { data } from "react-router"
import { z } from "zod"

import { invalidateSidebarCache } from "../lib/dashboard.server.ts"
import { DEFAULT_DASHBOARD } from "../lib/repos.ts"
import { requireDataRepo } from "../lib/repos.server.ts"
import {
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
