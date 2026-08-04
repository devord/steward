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
  /** What the run spent, off the receipt's own commit message. null for
      every receipt published before routines wrote the trailers, and for
      any run that couldn't price itself — a run that published without
      saying what it cost is still a run (see parseRunCost). */
  cost: RunCost | null
}

/**
 * A run's spend, as the publish commit reported it (`publish-widget`). The
 * receipt is the only record a run leaves (ADR-0026) and the session that
 * knows lives on claude.ai, which the app can't read (ADR-0016) — so this
 * is the whole of what the app can know about cost.
 */
export interface RunCost {
  /** Total tokens across every model the run used, all cache tiers. */
  tokens: number
  /**
   * Dollars, **imputed at API list prices** — cloud runs bill against the
   * runner's subscription (ADR-0012), so nobody was charged this. It also
   * undercounts: the sum is taken before the publish turns it pays for.
   * Render it as an approximation, never as a bill. null when the run used
   * a model the summing script had no rate for, in which case `tokens`
   * still stands — a token count is true regardless of pricing.
   */
  usd: number | null
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

// The trailers `publish-widget` writes on the publish commit. Anchored to
// column 1 so a slug or an instruction quoting them in the subject can't be
// read as a cost.
const RUN_TOKENS = /^Run-Tokens: (\d+)$/m
const RUN_COST_USD = /^Run-Cost-USD: (\d+(?:\.\d+)?)$/m

/**
 * The cost trailers off a publish commit's message, or null when it carries
 * none — which is the common case and not a failure: every receipt published
 * before this shipped predates the trailers, and a run whose transcript was
 * unreadable publishes without them by design.
 *
 * Tokens are the anchor: a message with a price but no token count is
 * malformed, so it reads as no cost at all rather than as a bare dollar
 * figure with nothing to check it against.
 */
export function parseRunCost(
  message: string | null | undefined,
): RunCost | null {
  if (!message) return null
  const tokens = RUN_TOKENS.exec(message)
  if (!tokens) return null
  const usd = RUN_COST_USD.exec(message)
  return { tokens: Number(tokens[1]), usd: usd ? Number(usd[1]) : null }
}

/** What the listed runs cost together, and how many of them that covers —
    a mixed list (old receipts, unpriced models) must show its own reach
    rather than pass a partial sum off as the total. */
export function totalRunCost(runs: RunView[]): {
  usd: number
  priced: number
  runs: number
} {
  let usd = 0
  let priced = 0
  for (const run of runs) {
    if (run.cost?.usd == null) continue
    usd += run.cost.usd
    priced += 1
  }
  return { usd, priced, runs: runs.length }
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
