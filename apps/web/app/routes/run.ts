import {
  parseRoutinesFile,
  routineHost,
  slugSchema,
  triggerFileSchema,
  triggerPath,
} from "@bulletin/schema"
import { data } from "react-router"
import { z } from "zod"

import { resolveDataRepo, resolveTeamRepo } from "../lib/dashboard.server.ts"
import { getFile } from "../lib/github.server.ts"
import { fireRoutine, RoutineFireError } from "../lib/routines-fire.server.ts"
import { requireAuth } from "../lib/session.server.ts"

/**
 * The Update button, server side (ADR-0016): fire a cloud routine's API
 * trigger on behalf of the clicking user. Authorization is the trigger
 * file read itself — it happens with the clicker's GitHub token, so
 * exactly the set who can read the data repo can fire, and the server
 * holds no secret. The run executes as the runner, with the runner's
 * connectors; the fire body records who asked.
 */
const payloadSchema = z.object({
  scope: z.enum(["personal", "team"]),
  slug: slugSchema,
})

export type RunResult =
  | { ok: true }
  | { ok: false; error: "no-trigger" | "fire-failed" }

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
  const { scope, slug } = parsed.data

  const dataRepo =
    scope === "team"
      ? resolveTeamRepo()
      : resolveDataRepo(auth.login, auth.dataRepo)
  if (!dataRepo) {
    throw data({ error: "team repo not configured" }, { status: 400 })
  }

  // Only runner-owned cloud routines carry a trigger; the client offers a
  // copy-command fallback for local ones, so reject a crafted local fire.
  const routinesRaw = await getFile(
    auth.token,
    dataRepo,
    "data/routines.yaml",
    "main",
  )
  const routine = routinesRaw
    ? parseRoutinesFile(routinesRaw.text).routines.find(
        (entry) => entry.slug === slug,
      )
    : undefined
  if (!routine || routineHost(routine) !== "cloud") {
    throw data({ error: "not a cloud routine" }, { status: 400 })
  }

  const triggerRaw = await getFile(
    auth.token,
    dataRepo,
    triggerPath(slug),
    "main",
  )
  if (!triggerRaw) {
    return { ok: false, error: "no-trigger" } satisfies RunResult
  }
  const trigger = triggerFileSchema.safeParse(JSON.parse(triggerRaw.text))
  if (!trigger.success) {
    return { ok: false, error: "no-trigger" } satisfies RunResult
  }

  try {
    await fireRoutine({ ...trigger.data, requestedBy: auth.login })
  } catch (error) {
    if (error instanceof RoutineFireError) {
      return { ok: false, error: "fire-failed" } satisfies RunResult
    }
    throw error
  }
  return { ok: true } satisfies RunResult
}
