import type { Routine } from "@bulletin/schema"
import { isManual, routineHost } from "@bulletin/schema"

import type { ArtifactInfo } from "./dashboard.server.ts"
import { cronIntervalMs } from "./time.ts"

/**
 * Where a routine sits between "added" and "showing a live widget" — derived,
 * never stored. The tile renders setup guidance from it (ADR-0016), so a new
 * user isn't left staring at an empty cell with no idea what to run.
 *
 * The chain: draft (added, not committed) → committed but not enacted
 * (needs-trigger for a manual cloud routine without its API trigger, or
 * awaiting-first-run otherwise) → running (a fire is in flight) → live (has an
 * artifact), possibly stale. `disabled`/`unreachable` are orthogonal terminal
 * states.
 */
export type WidgetStatus =
  | { kind: "draft" }
  | { kind: "disabled" }
  | { kind: "unreachable" }
  | { kind: "needs-trigger" }
  | { kind: "ready-manual" }
  | { kind: "awaiting-first-run" }
  | { kind: "running"; firedAt: number }
  | { kind: "live"; stale: boolean }

export interface StatusContext {
  /** Is the routine on the server (synced), not just in the local draft? */
  committed: boolean
  /** Does data/triggers/<slug>.json exist? undefined → couldn't tell (a local
      routine, or a fetch that flapped) — never treated as "missing". */
  hasTrigger: boolean | undefined
  artifact: ArtifactInfo | undefined
  /** When the client fired a run that hasn't published yet, else null. */
  pendingFiredAt: number | null
  now: number
}

/** Overdue by more than one full interval → the schedule missed a run. Manual
    routines and never-run ones are never stale (ADR-0016). */
export function isStale(
  routine: Routine,
  lastRunAt: string | null,
  now: number,
): boolean {
  if (routine.schedule == null || lastRunAt == null) return false
  const interval = cronIntervalMs(routine.schedule)
  return interval != null && now - Date.parse(lastRunAt) > 2 * interval
}

export function widgetStatus(
  routine: Routine,
  ctx: StatusContext,
): WidgetStatus {
  // A fire in flight wins: show activity even over an existing artifact.
  if (ctx.pendingFiredAt != null) {
    return { kind: "running", firedAt: ctx.pendingFiredAt }
  }
  if (ctx.artifact?.html != null) {
    return {
      kind: "live",
      stale: isStale(routine, ctx.artifact.lastRunAt, ctx.now),
    }
  }
  if (!ctx.committed) return { kind: "draft" }
  if (!routine.enabled) return { kind: "disabled" }
  if (ctx.artifact?.unreachable) return { kind: "unreachable" }
  if (routineHost(routine) === "cloud" && isManual(routine)) {
    // A manual cloud routine's update button only works once its API trigger
    // exists; until then, point at the command that creates it.
    if (ctx.hasTrigger === false) return { kind: "needs-trigger" }
    if (ctx.hasTrigger === true) return { kind: "ready-manual" }
  }
  return { kind: "awaiting-first-run" }
}

/** Terminal steps to activate a routine that isn't live yet, host-specific.
    `enact` runs routines:sync (creates the cloud routine / API trigger /
    launchd plist); `runOnce` runs a local routine on demand. */
export function setupCommands(routine: Routine): {
  enact: string | null
  runOnce: string | null
} {
  const local = routineHost(routine) === "local"
  return {
    // Manual local routines have nothing to enact — you just run them.
    enact: local && isManual(routine) ? null : "pnpm routines:sync --apply",
    runOnce: local ? `pnpm routine ${routine.slug}` : null,
  }
}
