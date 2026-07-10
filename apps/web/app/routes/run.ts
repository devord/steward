import { parseRoutinesFile, slugSchema } from "@bulletin/schema"
import { data } from "react-router"
import { z } from "zod"

import { resolveDataRepo, resolveTeamRepo } from "../lib/dashboard.server.ts"
import {
  dispatchWorkflow,
  getFile,
  getLastCommitDate,
  GitHubError,
  listWorkflowRuns,
} from "../lib/github.server.ts"
import { requireAuth } from "../lib/session.server.ts"

/**
 * "Run now" (ADR-0012): dispatch the data repo's run-routine workflow and poll
 * its status. The action fires the dispatch; the loader resolves the run it
 * kicked off (workflow_dispatch returns no run id) so the button can show
 * running → done/failed. The repo is always derived from the session scope,
 * never from client input, exactly like sync.ts.
 */
const WORKFLOW_FILE = "run-routine.yml"
/** The workflow lives on the data repo's default branch. */
const WORKFLOW_REF = "main"
const COOLDOWN_MS = 5 * 60 * 1000
/** Our clock vs GitHub's `created_at`; widen the "is this my run" window. */
const CLOCK_SKEW_MS = 30_000

function resolveRepo(
  scope: "personal" | "team",
  auth: { login: string; dataRepo?: string },
): string | null {
  return scope === "team"
    ? resolveTeamRepo()
    : resolveDataRepo(auth.login, auth.dataRepo)
}

const triggerSchema = z.object({
  scope: z.enum(["personal", "team"]),
  slug: slugSchema,
})

export async function action({ request }: { request: Request }) {
  const auth = await requireAuth(request)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw data({ error: "invalid JSON" }, { status: 400 })
  }
  const parsed = triggerSchema.safeParse(body)
  if (!parsed.success) {
    throw data({ error: "invalid payload" }, { status: 400 })
  }
  const { scope, slug } = parsed.data

  const repo = resolveRepo(scope, auth)
  if (!repo) {
    throw data({ error: "team repo not configured" }, { status: 400 })
  }

  // Authoritative gate (the UI hides the button, but a crafted request or a
  // hand-fired dispatch must still be checked): manualRun on, routine exists
  // and is enabled. The workflow re-checks the credential + cooldown itself.
  const routinesRaw = await getFile(auth.token, repo, "data/routines.yaml")
  const config = routinesRaw
    ? parseRoutinesFile(routinesRaw.text)
    : { routines: [], manualRun: false }
  if (!config.manualRun) {
    return data(
      { ok: false as const, error: "disabled" as const },
      { status: 403 },
    )
  }
  const routine = config.routines.find((r) => r.slug === slug)
  if (!routine) {
    return data(
      { ok: false as const, error: "unknown" as const },
      { status: 404 },
    )
  }
  if (!routine.enabled) {
    return data(
      { ok: false as const, error: "routineDisabled" as const },
      { status: 409 },
    )
  }

  // Cooldown: the last publish commit of this widget is the timestamp (ADR-0002),
  // so no extra state. Give the client the remaining seconds to show.
  const lastRunAt = await getLastCommitDate(
    auth.token,
    repo,
    `w/${slug}/index.html`,
    "artifacts",
  )
  if (lastRunAt) {
    const elapsed = Date.now() - Date.parse(lastRunAt)
    if (elapsed < COOLDOWN_MS) {
      return data(
        {
          ok: false as const,
          error: "cooldown" as const,
          retryAfterSec: Math.ceil((COOLDOWN_MS - elapsed) / 1000),
        },
        { status: 429 },
      )
    }
  }

  try {
    await dispatchWorkflow(auth.token, repo, WORKFLOW_FILE, WORKFLOW_REF, {
      slug,
    })
  } catch (error) {
    if (error instanceof GitHubError) {
      // 404 → the workflow isn't on the default branch (repo predates ADR-0012).
      const missing = error.status === 404
      return data(
        { ok: false as const, error: missing ? "noWorkflow" : "dispatch" },
        { status: missing ? 404 : 502 },
      )
    }
    throw error
  }

  return { ok: true as const, dispatchedAt: Date.now() }
}

const statusSchema = z.object({
  scope: z.enum(["personal", "team"]),
  slug: slugSchema,
  /** Epoch ms the dispatch returned; runs older than this aren't ours. */
  since: z.coerce.number().nonnegative(),
})

export async function loader({ request }: { request: Request }) {
  const auth = await requireAuth(request)

  const url = new URL(request.url)
  const parsed = statusSchema.safeParse({
    scope: url.searchParams.get("scope"),
    slug: url.searchParams.get("slug"),
    since: url.searchParams.get("since") ?? "0",
  })
  if (!parsed.success) {
    throw data({ error: "invalid query" }, { status: 400 })
  }
  const { scope, slug, since } = parsed.data

  const repo = resolveRepo(scope, auth)
  if (!repo) {
    throw data({ error: "team repo not configured" }, { status: 400 })
  }

  // Scope the query to runs since the dispatch (minus skew) so a busy
  // workflow's other-slug dispatches can't bury this run past the first page.
  const runs = await listWorkflowRuns(auth.token, repo, WORKFLOW_FILE, {
    createdSince: new Date(since - CLOCK_SKEW_MS).toISOString(),
  })
  // The run-name carries the slug; the created_at window rejects an older run
  // for the same slug. Runs come newest-first, so the first match is ours.
  const runName = `run-routine ${slug}`
  const mine = runs.find(
    (run) =>
      run.name === runName &&
      Date.parse(run.created_at) >= since - CLOCK_SKEW_MS,
  )

  return {
    run: mine
      ? { status: mine.status, conclusion: mine.conclusion, url: mine.html_url }
      : null,
  }
}
