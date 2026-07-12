import type { Routine } from "@steward/schema"
import { isManual, routineHost } from "@steward/schema"

import type { ArtifactInfo } from "./dashboard.server.ts"
import { cronIntervalMs } from "./time.ts"

/**
 * Where a routine sits between "added" and "showing a live widget" — derived,
 * never stored. The tile renders setup guidance from it (ADR-0016), so a new
 * user isn't left staring at an empty cell with no idea what to run.
 *
 * The chain: draft (added, not committed) → committed but not enacted
 * (needs-trigger for a manual cloud routine without its API trigger, or
 * awaiting-first-run otherwise) → ready (the API trigger exists, so the tile
 * can offer a real run-now button: ready-manual, or ready-scheduled for a
 * cron routine that hasn't had its first run) → running (a fire is in
 * flight) → live (has an artifact), possibly stale. `disabled`/`unreachable`
 * are orthogonal terminal states.
 */
export type WidgetStatus =
  | { kind: "draft" }
  | { kind: "disabled" }
  | { kind: "unreachable" }
  | { kind: "needs-trigger" }
  | { kind: "ready-manual" }
  | { kind: "ready-scheduled" }
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
  // Truthy, not just non-null: widget-card renders the iframe on `html ? …`,
  // so an empty-string body must fall through to the empty-state guidance here
  // too (else the tile would claim "live" yet show setup instructions).
  if (ctx.artifact?.html) {
    return {
      kind: "live",
      stale: isStale(routine, ctx.artifact.lastRunAt, ctx.now),
    }
  }
  if (!ctx.committed) return { kind: "draft" }
  if (!routine.enabled) return { kind: "disabled" }
  if (ctx.artifact?.unreachable) return { kind: "unreachable" }
  if (routineHost(routine) === "cloud") {
    if (isManual(routine)) {
      // A manual cloud routine's update button only works once its API
      // trigger exists; until then, point at the command that creates it.
      if (ctx.hasTrigger === false) return { kind: "needs-trigger" }
      if (ctx.hasTrigger === true) return { kind: "ready-manual" }
    } else if (ctx.hasTrigger === true) {
      // A scheduled routine with its trigger can fire right now — offer the
      // first run instead of leaving the user waiting on the cron. Without a
      // trigger it still runs on schedule, so that stays awaiting-first-run.
      return { kind: "ready-scheduled" }
    }
  }
  return { kind: "awaiting-first-run" }
}

/** Terminal steps to activate a routine that isn't live yet, host-specific.
    `enact` runs routines:sync (creates the cloud routine / API trigger /
    launchd plist); `runOnce` runs a local routine on demand; `trigger` mints
    a cloud routine's on-demand API trigger (ADR-0016) — the only path for
    scheduled ones, whose enactment never asks for a token. */
export function setupCommands(
  routine: Routine,
  dataRepo?: string,
): {
  enact: string | null
  runOnce: string | null
  trigger: string | null
} {
  const local = routineHost(routine) === "local"
  // Runs from the steward checkout (ADR-0014), which has no data/ dir. With
  // the repo slug known, --repo makes the line copy-pasteable — the script
  // maintains its own clone under ~/.cache/steward/. Standalone renders
  // don't know the slug and fall back to a --file placeholder.
  const target =
    dataRepo != null
      ? `--repo ${dataRepo}`
      : "--file <path-to-data-repo>/data/routines.yaml"
  return {
    // Manual local routines have nothing to enact — you just run them.
    enact:
      local && isManual(routine)
        ? null
        : `pnpm routines:sync --apply ${target}`,
    runOnce: local ? `pnpm routine ${routine.slug}` : null,
    trigger: local ? null : `pnpm routine:trigger ${routine.slug} ${target}`,
  }
}
