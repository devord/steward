import { parseRunCost, type RunCost } from "./runs.ts"

/**
 * The repo's publish history, read branch-wide rather than per routine.
 *
 * Every run's mandatory last step is one commit on the artifacts branch
 * (ADR-0002/0026), and since ADR-0060 that commit also carries what the run
 * spent. One commits page therefore prices ~100 runs across *every* routine
 * at once — where asking per routine costs a request each. That is what makes
 * cost affordable on surfaces that show the whole pool.
 *
 * This module is the pure half: the subject grammar, the window arithmetic,
 * and the per-slug roll-up. The paging lives in github.server.ts.
 */

/** One run, as its receipt reports it. */
export interface PublishEntry {
  /** The routine that published — off the commit subject. */
  slug: string
  /** ISO commit date. */
  at: string
  sha: string
  /** null for a receipt written before ADR-0060, or a run that couldn't
      price itself. Absence is a resting state, never a zero. */
  cost: RunCost | null
}

export interface PublishLedger {
  /** Newest first, as the commits API lists them. */
  entries: PublishEntry[]
  /** The scan stopped on its page cap before reaching the window's floor —
      so the window it covers is narrower than asked for, and every total
      derived from it must say so. */
  capped: boolean
  /** ISO date of the oldest entry read: the true left edge of everything
      derived here, whether the scan stopped on the floor or the cap. */
  since: string | null
  /** GitHub couldn't serve the history — callers render the retry line, the
      same per-cell degrade the board and the run history use. */
  unreachable?: boolean
}

/**
 * Two subject shapes reach the artifacts branch, and only one is
 * `publish-widget`'s.
 *
 * `publish: <slug>` is the contract (publish-widget writes exactly this).
 * `widget: <slug> @ <iso> (scripted)` is written by scripted publishers that
 * commit with their own git plumbing instead of going through the skill —
 * `repo-stats` in the Form Factory data repo is one. Those commits touch
 * `w/<slug>/index.html` all the same, so they *are* runs: a scan that matched
 * only the first shape would drop them from every denominator, and read a
 * routine that publishes exclusively that way as never having run.
 *
 * They are being converged on `publish:` at the source, but history is
 * immutable — commits already written keep their shape forever, so both are
 * matched here permanently rather than for a migration window.
 */
/**
 * Both shapes end where the slug ends: `publish:` takes the rest of the
 * subject only as a parenthetical note, `widget:` only as its ` @ <iso>` tail.
 *
 * That tail rule is load-bearing, not tidiness. A prose subject on this branch
 * reads `publish: remove corza-stats widget (consolidated into …)`, and taking
 * the first token blindly invented a routine named `remove` — a phantom row on
 * the spend page, counted against a slug that never existed. Requiring `(` or
 * end-of-line after the slug tells the two apart: a real note follows the slug
 * immediately, prose puts bare words there first. Across 809 subjects on the
 * Form Factory branch this drops exactly that one and keeps all 808 receipts,
 * including the four legitimate `publish: <slug> (re-render …)` fix-ups.
 */
const PUBLISH_SUBJECT = /^publish:[ \t]*([a-z0-9][a-z0-9-]*)[ \t]*(?:\(.*)?$/
const SCRIPTED_SUBJECT = /^widget:[ \t]*([a-z0-9][a-z0-9-]*)[ \t]+@[ \t]*\S/

/** The routine a publish commit belongs to, or null when the message follows
    neither shape — skipped rather than guessed at. */
export function parsePublishSubject(
  message: string | null | undefined,
): string | null {
  if (!message) return null
  // Subject only: the shapes are anchored to end-of-line, and a commit body
  // carries trailers (ADR-0060) that would otherwise defeat the anchor.
  const subject = message.split("\n", 1)[0] ?? ""
  return (
    PUBLISH_SUBJECT.exec(subject)?.[1] ??
    SCRIPTED_SUBJECT.exec(subject)?.[1] ??
    null
  )
}

/** A commit as the API hands it over, narrowed to what a receipt needs. */
export interface LedgerCommit {
  sha: string
  date: string
  message: string | null
}

/** Receipts out of raw commits: anything whose subject names no routine is
    not a publish and is dropped (a merge, a branch fix-up, a manual edit). */
export function toEntries(commits: LedgerCommit[]): PublishEntry[] {
  return commits.flatMap((commit) => {
    const slug = parsePublishSubject(commit.message)
    if (slug == null) return []
    return [
      {
        slug,
        at: commit.date,
        sha: commit.sha,
        cost: parseRunCost(commit.message),
      },
    ]
  })
}

/** What one routine spent across the ledger's window. */
export interface RoutineCost {
  /** Summed dollars over the priced runs alone. */
  usd: number
  /** How many of this routine's runs reported a price. */
  priced: number
  /** How many runs it made in the window, priced or not — the denominator
      that keeps `mean` from reading as the cost of every run. */
  runs: number
  /** Dollars per priced run. null when none were priced: a routine that has
      never reported a cost has no average, which is not the same as zero. */
  mean: number | null
}

/** Per-routine spend, keyed by slug. Routines absent from the window simply
    don't appear — the caller renders the dash it already renders for a
    receipt that carried no price. */
export function costBySlug(
  entries: PublishEntry[],
): Record<string, RoutineCost> {
  const out: Record<string, RoutineCost> = {}
  for (const entry of entries) {
    const row = (out[entry.slug] ??= { usd: 0, priced: 0, runs: 0, mean: null })
    row.runs += 1
    if (entry.cost?.usd == null) continue
    row.usd += entry.cost.usd
    row.priced += 1
  }
  for (const row of Object.values(out)) {
    row.mean = row.priced > 0 ? row.usd / row.priced : null
  }
  return out
}

/** The window's totals — the headline, and the reach every figure under it
    is qualified by. */
export function totalCost(entries: PublishEntry[]): {
  usd: number
  priced: number
  runs: number
  mean: number | null
} {
  let usd = 0
  let priced = 0
  for (const entry of entries) {
    if (entry.cost?.usd == null) continue
    usd += entry.cost.usd
    priced += 1
  }
  return {
    usd,
    priced,
    runs: entries.length,
    mean: priced > 0 ? usd / priced : null,
  }
}

/**
 * Spend per calendar day, oldest first — the shape the day strip draws.
 *
 * Days are UTC, because commit dates are: bucketing an ISO instant into the
 * viewer's local day would move a run between columns depending on who is
 * looking, and a spend chart that changes shape by timezone is not a record.
 *
 * A day that ran but priced nothing comes back with `usd: 0` and `priced: 0`,
 * and those are different facts the caller must keep apart: **the strip draws
 * no column for such a day rather than a zero-height one.** Pricing began
 * part-way through any window reaching back past ADR-0060, so a flat run of
 * zero columns would claim the routines ran free on days they merely ran
 * unpriced — the likeliest misreading of this chart, and the cheapest to
 * design out. `priced` is what tells the two apart; `runs` keeps the day
 * honest about having happened at all.
 */
export function costByDay(
  entries: PublishEntry[],
): { day: string; usd: number; priced: number; runs: number }[] {
  const byDay = new Map<string, { usd: number; priced: number; runs: number }>()
  for (const entry of entries) {
    const day = entry.at.slice(0, 10)
    const row = byDay.get(day) ?? { usd: 0, priced: 0, runs: 0 }
    row.runs += 1
    if (entry.cost?.usd != null) {
      row.usd += entry.cost.usd
      row.priced += 1
    }
    byDay.set(day, row)
  }
  return [...byDay.entries()]
    .map(([day, row]) => ({ day, ...row }))
    .sort((a, b) => a.day.localeCompare(b.day))
}
