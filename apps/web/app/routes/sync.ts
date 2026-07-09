import { data } from "react-router"
import { z } from "zod"

import { resolveDataRepo } from "../lib/dashboard.server.ts"
import {
  createBranch,
  createPullRequest,
  getFile,
  GitHubError,
  putFile,
} from "../lib/github.server.ts"
import { requireAuth } from "../lib/session.server.ts"

/**
 * Persist a draft (ADR-0003): direct commit to main (default) or a
 * `dash/config-<timestamp>` branch plus PR. The client sends the serialized
 * YAML it previewed in the Sync panel together with the base blob SHAs the
 * draft was made against; a moved SHA is a conflict, never overwritten.
 */
const fileChangeSchema = z.object({
  yaml: z.string().min(1),
  /** Blob SHA the draft was loaded against; null → file didn't exist. */
  baseSha: z.string().nullable(),
})

const payloadSchema = z.object({
  intent: z.enum(["commit", "pr"]),
  routines: fileChangeSchema.optional(),
  dashboard: fileChangeSchema.optional(),
})

const PATHS = {
  routines: "data/routines.yaml",
  dashboard: "data/dashboard.yaml",
} as const

export async function action({ request }: { request: Request }) {
  const auth = await requireAuth(request)
  const dataRepo = resolveDataRepo(auth.login, auth.dataRepo)

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

  const changes = (["routines", "dashboard"] as const).flatMap((kind) => {
    const change = payload[kind]
    return change ? [{ kind, path: PATHS[kind], ...change }] : []
  })
  if (changes.length === 0) {
    throw data({ error: "empty sync" }, { status: 400 })
  }

  // Stale-base check against the repo's current state (ADR-0003). The same
  // read yields the current blob SHA needed for the update commit.
  const conflicts: string[] = []
  const currentShas = new Map<string, string | undefined>()
  await Promise.all(
    changes.map(async (change) => {
      const current = await getFile(auth.token, dataRepo, change.path, "main")
      currentShas.set(change.kind, current?.sha)
      if ((current?.sha ?? null) !== change.baseSha) {
        conflicts.push(change.kind)
      }
    }),
  )
  if (conflicts.length > 0) {
    return data({ ok: false as const, conflicts }, { status: 409 })
  }

  let branch = "main"
  if (payload.intent === "pr") {
    branch = `dash/config-${Date.now()}`
    await createBranch(auth.token, dataRepo, branch, "main")
  }

  // Sequential: two files → two commits; parallel PUTs to one branch race
  // on the head and GitHub rejects the loser.
  for (const change of changes) {
    try {
      await putFile(auth.token, dataRepo, change.path, {
        content: change.yaml,
        message: `config: update ${change.kind} via bulletin`,
        branch,
        sha: currentShas.get(change.kind),
      })
    } catch (error) {
      // The PUT checks the expected sha atomically; the pre-check above
      // reads through the contents API, which can lag a just-made commit.
      // Translate GitHub's own conflict into the same 409 the pre-check
      // produces instead of surfacing a 500.
      if (error instanceof GitHubError && error.status === 409) {
        return data(
          { ok: false as const, conflicts: [change.kind] },
          { status: 409 },
        )
      }
      throw error
    }
  }

  if (payload.intent === "pr") {
    const pull = await createPullRequest(auth.token, dataRepo, {
      title: "Bulletin config update",
      head: branch,
      base: "main",
      body: "Config edits made in the Bulletin dashboard.",
    })
    return { ok: true as const, prUrl: pull.html_url }
  }
  return { ok: true as const }
}
