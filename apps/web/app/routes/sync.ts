import { dashboardPath, slugSchema } from "@bulletin/schema"
import { data } from "react-router"
import { z } from "zod"

import { requireDataRepo } from "../lib/repos.server.ts"
import { performSync } from "../lib/sync.server.ts"
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
  /** Which data repo the sync targets — gated by requireDataRepo (ADR-0023). */
  repo: z.string(),
  /** Slug-validated so a crafted payload can't path-traverse the repo. */
  dashboardSlug: slugSchema,
  routines: fileChangeSchema.optional(),
  dashboard: fileChangeSchema.optional(),
})

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

  const { full: dataRepo } = await requireDataRepo(
    auth.token,
    auth.login,
    payload.repo,
    auth.dataRepo,
  )

  const paths = {
    routines: "data/routines.yaml",
    dashboard: dashboardPath(payload.dashboardSlug),
  } as const

  const changes = (["routines", "dashboard"] as const).flatMap((kind) => {
    const change = payload[kind]
    return change ? [{ kind, path: paths[kind], ...change }] : []
  })
  if (changes.length === 0) {
    throw data({ error: "empty sync" }, { status: 400 })
  }

  const outcome = await performSync(auth.token, dataRepo, {
    intent: payload.intent,
    changes,
  })
  if (!outcome.ok) {
    // A moved base — the client re-applies onto the fresh base and re-reviews.
    // `committed` names any files a partial (raced) commit did land so a retry
    // doesn't false-conflict on them.
    return data(
      {
        ok: false as const,
        conflicts: outcome.conflicts,
        committed: outcome.committed,
      },
      { status: 409 },
    )
  }
  if ("prUrl" in outcome) {
    return { ok: true as const, prUrl: outcome.prUrl }
  }
  // The authoritative new base SHAs, so the client carries its base forward
  // without waiting on the contents API to catch up (ADR-0003).
  return { ok: true as const, newShas: outcome.newShas }
}
