import { cronIntervalMs } from "./time.ts"

/**
 * One publish receipt: a commit touching `w/<slug>/index.html` on the
 * artifacts branch. Every run ends in exactly one such commit (ADR-0002/0026),
 * so the path's history *is* the run history — no parallel run log to keep
 * honest. Failed runs never publish, so they leave no receipt; session-level
 * detail lives on the routine's claude.ai page (ADR-0033).
 */
export interface RunReceipt {
  sha: string
  /** The commit on GitHub — where the receipt's diff can be inspected. */
  htmlUrl: string
  /** ISO commit date — when the run published. */
  at: string
  /** Commit author name; runners name it freely, so display-only. */
  author: string | null
}

/**
 * How a run sits against its routine's schedule. `first` — the routine's
 * actual first run (never claimed on a capped listing, where the oldest
 * fetched receipt is merely the oldest fetched). `late` — more than twice
 * the cron interval after the previous run, the same threshold isStale
 * judges the pool's freshness by (routine-status.ts): at least one
 * scheduled fire in between never published. null — nothing to judge
 * against (manual, an unreadable cron, or the truncated oldest row). A gap
 * *shorter* than the interval is just a manual run between scheduled ones
 * — healthy, so still on-schedule.
 */
export type RunCadence = "first" | "on-schedule" | "late" | null

export interface RunView extends RunReceipt {
  /** ms since the previous (older) receipt; null for the oldest. Clamped to
      ≥ 0 — the commits API orders by history, not timestamp, so rebase or
      clock skew must never surface as a negative duration. */
  gapMs: number | null
  cadence: RunCadence
}

/** Judge each receipt (newest-first, as the commits API lists them) against
    the routine's schedule. Pure — the server loader fetches, this derives. */
export function deriveRuns(
  receipts: RunReceipt[],
  schedule: string | null | undefined,
  /** The fetch hit its page limit — older receipts exist beyond the list. */
  capped = false,
): RunView[] {
  const interval = schedule != null ? cronIntervalMs(schedule) : null
  return receipts.map((receipt, index) => {
    const older = receipts[index + 1]
    if (!older) {
      return { ...receipt, gapMs: null, cadence: capped ? null : "first" }
    }
    const gapMs = Math.max(0, Date.parse(receipt.at) - Date.parse(older.at))
    const cadence =
      interval == null ? null : gapMs > 2 * interval ? "late" : "on-schedule"
    return { ...receipt, gapMs, cadence }
  })
}
