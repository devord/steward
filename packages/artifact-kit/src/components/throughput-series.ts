/**
 * The maths behind the `throughput` band, written once and run twice.
 *
 * The static render (server, `Throughput.tsx`) and the board's injected runtime
 * (browser, `behaviour/throughput.ts`) have to agree exactly on what a column is
 * — the runtime's first act is to re-render the day the server already drew,
 * and any disagreement shows up as a visible jump the moment a frame loads.
 * Two implementations of that is how the jump gets in. So the arithmetic lives
 * here, in a plain module both import, and gets tested once.
 *
 * This is also the thing the migration was actually for. It arrived as ~460
 * lines of script frozen inside a routine's `template.html`, published by that
 * routine's own script, which meant it never reached `publish-widget`'s gate
 * and nothing ever ran a line of it in anger. Here it is ordinary source.
 */

/**
 * A view's series as the routine ships it: positional, delta-encoded, sparse.
 *
 * The dense form — every day × every person — is ~10x larger, and it is paid
 * on every board render because the payload is inlined into the artifact. Only
 * days where something changed appear in `changed`, and each entry carries the
 * *deltas* for that day, in `authors` order.
 */
export interface EncodedView {
  /** Person keys, in final-ranking order. Also the stable ranking tiebreak. */
  authors: string[]
  /** ISO date of day 0. */
  from: string
  /** Day count — the axis length, including days with no change. */
  n: number
  /** `[dayIndex, [[dOpen, dMerged, dCreated], ...one per author]]`. */
  changed: [number, number[][]][]
}

/** Cumulative counts for one person on one day. */
export interface Counts {
  open: number
  merged: number
  created: number
}

/** A decoded view: the dense day axis the chart reads. */
export interface DecodedView {
  authors: string[]
  days: { date: string; counts: Record<string, Counts> }[]
}

const DAY_MS = 86_400_000

/**
 * Undo {@link EncodedView} back to the dense axis.
 *
 * Deliberately not lazy. The chart's y-axis is the max across *every* day, so
 * a scrub that stayed cheap by decoding on demand would still have to walk the
 * whole series before it could draw the first frame.
 */
export function decodeView(v: EncodedView): DecodedView {
  const authors = v.authors ?? []
  const running = authors.map(() => [0, 0, 0])
  const byIndex = new Map(v.changed ?? [])
  const t0 = v.from ? Date.parse(`${v.from}T00:00:00Z`) : 0
  const days: DecodedView["days"] = []

  for (let i = 0; i < (v.n ?? 0); i++) {
    const delta = byIndex.get(i)
    if (delta) {
      for (let j = 0; j < running.length; j++)
        for (let k = 0; k < 3; k++) running[j][k] += delta[j]?.[k] ?? 0
    }
    const counts: Record<string, Counts> = {}
    authors.forEach((a, j) => {
      counts[a] = {
        open: running[j][0],
        merged: running[j][1],
        created: running[j][2],
      }
    })
    days.push({
      date: new Date(t0 + i * DAY_MS).toISOString().slice(0, 10),
      counts,
    })
  }
  return { authors, days }
}

/** Cumulative totals, or a trailing window ending at the scrubbed day. */
export type Mode = "cumulative" | "window"

/** How a single column is split, for one person on one day. */
export interface Segments {
  merged: number
  open: number
}

const ZERO: Counts = { open: 0, merged: 0, created: 0 }

/**
 * One person's column on day `index`.
 *
 * Cumulative reads the stored counts directly: merged-to-date, and how many of
 * their PRs stand open right now. The windowed view is the exact difference
 * between two points on the cumulative series — which is why `created` is
 * stored at all. "Opened in the last week" cannot be recovered from `open`,
 * because `open` is a level that falls as PRs merge, not a count of events.
 *
 * Clamped at zero: the difference of two cumulative counts cannot legitimately
 * go negative, but a payload edited by hand can say otherwise, and a negative
 * height renders as a column growing downward out of its track.
 */
export function segmentsAt(
  days: DecodedView["days"],
  index: number,
  author: string,
  mode: Mode,
  windowDays: number,
): Segments {
  const now = days[index]?.counts[author] ?? ZERO
  if (mode === "cumulative") return { merged: now.merged, open: now.open }

  const baseIndex = index - windowDays
  const base = baseIndex >= 0 ? (days[baseIndex]?.counts[author] ?? ZERO) : ZERO
  return {
    merged: Math.max(0, now.merged - base.merged),
    open: Math.max(0, now.created - base.created),
  }
}

/**
 * The y-axis ceiling: the tallest column across every day in the current view.
 *
 * Computed over the whole axis rather than the scrubbed day so the scale holds
 * still while scrubbing — a rescaling axis makes every column move for reasons
 * that have nothing to do with the day you landed on. Recomputed whenever the
 * view, mode or window changes, so a windowed chart is not flattened against
 * the cumulative peak and the reviewer axis is not tied to the owner's.
 *
 * Rounded up to a multiple of ten with a floor of ten, so the printed ceiling
 * is a number worth reading and a quiet week still gets a full track.
 */
export function axisMax(
  days: DecodedView["days"],
  authors: string[],
  mode: Mode,
  windowDays: number,
): number {
  let tallest = 1
  for (let i = 0; i < days.length; i++)
    for (const a of authors) {
      const s = segmentsAt(days, i, a, mode, windowDays)
      tallest = Math.max(tallest, s.merged + s.open)
    }
  return Math.max(10, Math.ceil(tallest / 10) * 10)
}

/**
 * The day's ranking: tallest first, ties broken by the view's final ranking.
 *
 * The tiebreak is what keeps the chart legible while scrubbing. Early days are
 * mostly ties at zero, and without a stable order every one of them would
 * shuffle the whole row for no reason a reader could follow.
 */
export function rankAuthors(
  authors: string[],
  totals: Record<string, number>,
  baseOrder: string[],
): string[] {
  return authors
    .slice()
    .sort(
      (a, b) =>
        (totals[b] ?? 0) - (totals[a] ?? 0) ||
        baseOrder.indexOf(a) - baseOrder.indexOf(b),
    )
}

/** Everything the chart needs to draw one day, in one pass over the authors. */
export interface DayFrame {
  date: string
  /** Ranked, tallest first. */
  order: string[]
  segments: Record<string, Segments>
  totalMerged: number
  totalOpen: number
}

/** Resolve one day into its columns, ranked and totalled. */
export function frameAt(
  view: DecodedView,
  index: number,
  mode: Mode,
  windowDays: number,
): DayFrame {
  const segments: Record<string, Segments> = {}
  const totals: Record<string, number> = {}
  let totalMerged = 0
  let totalOpen = 0

  for (const a of view.authors) {
    const s = segmentsAt(view.days, index, a, mode, windowDays)
    segments[a] = s
    totals[a] = s.merged + s.open
    totalMerged += s.merged
    totalOpen += s.open
  }

  return {
    date: view.days[index]?.date ?? "",
    order: rankAuthors(view.authors, totals, view.authors),
    segments,
    totalMerged,
    totalOpen,
  }
}

/** Total merged across everyone, per day — the evolution sparkline's series. */
export function mergedPerDay(view: DecodedView): number[] {
  return view.days.map((d) =>
    view.authors.reduce((sum, a) => sum + (d.counts[a]?.merged ?? 0), 0),
  )
}
