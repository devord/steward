import { resolveCategory, type Routine } from "@steward/schema"

import { costByDay, type PublishEntry } from "./publish-ledger.ts"

/**
 * The spend page's arithmetic: publish receipts (publish-ledger.ts) joined
 * with the routines that wrote them, rolled up along the three axes the page
 * draws. Pure — the loader fetches, this derives, the view paints.
 *
 * Every figure here is a sum over the runs that reported a price, carried
 * beside the count of runs that did and didn't. ADR-0060's number is imputed
 * at list rates and undercounts the publishing turns, so a total that cannot
 * state its own reach is not a total worth showing.
 */

export interface SpendGroup {
  /** Stable identity — a slug, a login, a band name. */
  key: string
  /** What the row is called; for a routine, its name rather than its slug. */
  label: string
  usd: number
  /** Runs in this group that reported a price. */
  priced: number
  /** Runs in this group, priced or not. */
  runs: number
  /** Fraction of the window's total spend, 0–1. Zero when nothing is priced. */
  share: number
  /** The routine spent this but has since left `routines.yaml` — so the row is
      named by its slug, has no detail page to link to, and is marked as such.
      Always false on the owner and band roll-ups, which key on neither. */
  retired: boolean
}

/** One calendar day on the strip's axis. */
export interface SpendDay {
  /** `YYYY-MM-DD`, UTC — commit dates are, and a chart that changes shape by
      the viewer's timezone is not a record. */
  day: string
  usd: number
  priced: number
  runs: number
}

export interface SpendSummary {
  usd: number
  priced: number
  runs: number
  /** Dollars per priced run. null when nothing in the window was priced —
      which is not an average of zero. */
  mean: number | null
  /** Retired routines that never reported a price are not here — see
      `withheld`. Every other row is, including live routines that ran
      unpriced. */
  byRoutine: SpendGroup[]
  /** What `byRoutine` left out, so the list can say so instead of just being
      shorter. `runs` is the count those rows carried, which the headline's
      denominator still includes — the window's reach did not change. */
  withheld: { rows: number; runs: number }
  byOwner: SpendGroup[]
  byCategory: SpendGroup[]
  /** Continuous, oldest first: one slot per calendar day across the window,
      including days nothing ran. Gaps are part of the record. */
  days: SpendDay[]
}

/** A routine whose receipts are in the window but whose entry has since left
    routines.yaml still spent what it spent — it is named by its slug and
    counted, rather than dropped to make the total tidier. */
function labelFor(routine: Routine | undefined, slug: string): string {
  return routine?.name ?? slug
}

function group(
  entries: PublishEntry[],
  total: number,
  keyOf: (entry: PublishEntry) => {
    key: string
    label: string
    retired?: boolean
  },
): SpendGroup[] {
  const rows = new Map<string, SpendGroup>()
  for (const entry of entries) {
    const { key, label, retired = false } = keyOf(entry)
    const row = rows.get(key) ?? {
      key,
      label,
      usd: 0,
      priced: 0,
      runs: 0,
      share: 0,
      retired,
    }
    row.runs += 1
    if (entry.cost?.usd != null) {
      row.usd += entry.cost.usd
      row.priced += 1
    }
    rows.set(key, row)
  }
  return [...rows.values()]
    .map((row) => ({ ...row, share: total > 0 ? row.usd / total : 0 }))
    .sort(
      (a, b) => b.usd - a.usd || b.runs - a.runs || a.key.localeCompare(b.key),
    )
}

/**
 * One slot per calendar day from the oldest receipt to today, so the strip's
 * x-axis is linear in time. Drawing only the days that carry spend would space
 * a quiet week the same as a busy one and turn a gap into a lie about cadence.
 */
function daySlots(entries: PublishEntry[], nowMs: number): SpendDay[] {
  const dense = costByDay(entries)
  const first = dense[0]
  if (!first) return []
  const byDay = new Map(dense.map((row) => [row.day, row]))
  const out: SpendDay[] = []
  const cursor = new Date(`${first.day}T00:00:00Z`)
  const end = new Date(nowMs)
  // Guard the loop on the calendar rather than on a count: a clock-skewed
  // receipt dated in the future must not spin this.
  for (let i = 0; i < 400 && cursor.getTime() <= end.getTime(); i++) {
    const day = cursor.toISOString().slice(0, 10)
    out.push(byDay.get(day) ?? { day, usd: 0, priced: 0, runs: 0 })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return out
}

export function summarizeSpend(
  entries: PublishEntry[],
  routines: Routine[],
  {
    repoOwner,
    templateCategories = {},
    now,
  }: {
    /** The owner a routine falls back to when it names no runner — the same
        rule the pool ledger applies (ADR-0025). */
    repoOwner: string
    /** Band defaults by template id (ADR-0044); empty until templates stream,
        which only moves inheriting routines out of the unbanded bucket. */
    templateCategories?: Record<string, string>
    now: number
  },
): SpendSummary {
  const bySlug = new Map(routines.map((routine) => [routine.slug, routine]))
  let usd = 0
  let priced = 0
  for (const entry of entries) {
    if (entry.cost?.usd == null) continue
    usd += entry.cost.usd
    priced += 1
  }
  const routineRows = group(entries, usd, (entry) => ({
    key: entry.slug,
    label: labelFor(bySlug.get(entry.slug), entry.slug),
    // Absent from the pool is exactly what "retired" means here — the same
    // miss that already costs the row its name costs it its link.
    retired: !bySlug.has(entry.slug),
  }))
  // Retired *and* never priced: the row carries no money and no live subject,
  // so it is history with nothing to read off it (ADR-0063). Both halves are
  // load-bearing — a retired routine that spent stays, because the dollars are
  // real, and a live routine that ran unpriced stays, because it is still in
  // the pool and "ran without saying" is a fact about it worth seeing.
  const dropped = routineRows.filter((row) => row.retired && row.priced === 0)
  return {
    usd,
    priced,
    runs: entries.length,
    mean: priced > 0 ? usd / priced : null,
    byRoutine: routineRows.filter((row) => !(row.retired && row.priced === 0)),
    withheld: {
      rows: dropped.length,
      runs: dropped.reduce((n, row) => n + row.runs, 0),
    },
    byOwner: group(entries, usd, (entry) => {
      const owner = bySlug.get(entry.slug)?.runner ?? repoOwner
      return { key: owner, label: owner }
    }),
    byCategory: group(entries, usd, (entry) => {
      const routine = bySlug.get(entry.slug)
      const band = routine
        ? resolveCategory(routine, templateCategories[routine.template])
        : null
      // Unbanded is a real bucket, not a hole: several routines carry no band
      // on purpose, and folding them away would make the shares not add up.
      return { key: band ?? "", label: band ?? "" }
    }),
    days: daySlots(entries, now),
  }
}
