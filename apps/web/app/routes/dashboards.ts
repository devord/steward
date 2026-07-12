import {
  dashboardFileSchema,
  dashboardPath,
  serializeDashboardFile,
  slugSchema,
} from "@bulletin/schema"
import { data } from "react-router"
import { z } from "zod"

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
    name: z.string().min(1).optional(),
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
    const empty = serializeDashboardFile(
      dashboardFileSchema.parse({
        ...(payload.name ? { name: payload.name } : {}),
        grid: {},
        widgets: [],
      }),
    )
    try {
      // No sha → create-only; GitHub 422s if the file already exists.
      await putFile(auth.token, repo, path, {
        content: empty,
        message: `config: create dashboard ${payload.slug} via bulletin`,
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
      message: `config: delete dashboard ${payload.slug} via bulletin`,
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
  return { ok: true as const, slug: payload.slug }
}
