import { describe, expect, it } from "vitest"

import {
  axisMax,
  decodeView,
  type EncodedView,
  frameAt,
  mergedPerDay,
  rankAuthors,
  segmentsAt,
} from "./throughput-series.ts"

/**
 * Four days, two people. `changed` carries deltas, so the cumulative series
 * this decodes to is:
 *
 *          day 0        day 1        day 2        day 3
 *   ana    o0 m0 c0     o1 m1 c2     o1 m1 c2     o0 m3 c4
 *   bo     o0 m0 c0     o0 m0 c0     o2 m0 c2     o2 m0 c2
 *
 * Day 2 is deliberately absent from `changed` for ana — a day nobody touched
 * still has to appear on the axis, carrying the level forward.
 */
const series: EncodedView = {
  authors: ["ana", "bo"],
  from: "2026-03-01",
  n: 4,
  changed: [
    [
      1,
      [
        [1, 1, 2],
        [0, 0, 0],
      ],
    ],
    [
      2,
      [
        [0, 0, 0],
        [2, 0, 2],
      ],
    ],
    [
      3,
      [
        [-1, 2, 2],
        [0, 0, 0],
      ],
    ],
  ],
}

describe("decodeView", () => {
  it("restores every day on the axis, not just the ones that changed", () => {
    const v = decodeView(series)
    expect(v.days).toHaveLength(4)
    expect(v.days.map((d) => d.date)).toEqual([
      "2026-03-01",
      "2026-03-02",
      "2026-03-03",
      "2026-03-04",
    ])
  })

  it("accumulates deltas into the cumulative level", () => {
    const v = decodeView(series)
    expect(v.days[1].counts.ana).toEqual({ open: 1, merged: 1, created: 2 })
    expect(v.days[3].counts.ana).toEqual({ open: 0, merged: 3, created: 4 })
  })

  it("carries the level through a day with no entry", () => {
    // The failure this guards is a gap rendering as a drop to zero: a quiet
    // day is not a day everyone's work vanished.
    const v = decodeView(series)
    expect(v.days[2].counts.ana).toEqual(v.days[1].counts.ana)
  })

  it("survives an empty series without inventing an axis", () => {
    expect(decodeView({ authors: [], from: "", n: 0, changed: [] })).toEqual({
      authors: [],
      days: [],
    })
  })
})

describe("segmentsAt", () => {
  const { days } = decodeView(series)

  it("reads the stored level in the cumulative view", () => {
    expect(segmentsAt(days, 3, "ana", "cumulative", 7)).toEqual({
      merged: 3,
      open: 0,
    })
  })

  it("takes an exact difference of the cumulative series in the window", () => {
    // ana over a 2-day window ending day 3: merged 3-1, created 4-2.
    expect(segmentsAt(days, 3, "ana", "window", 2)).toEqual({
      merged: 2,
      open: 2,
    })
  })

  it("counts openings, not the open level, in the window", () => {
    // This is why `created` is stored. On day 3 ana has *nothing* open, but
    // she opened two PRs in the window — a windowed column driven off `open`
    // would show an empty bar for a person who had just filed twice.
    expect(days[3].counts.ana.open).toBe(0)
    expect(segmentsAt(days, 3, "ana", "window", 2).open).toBe(2)
  })

  it("treats a window reaching past day 0 as reaching to zero", () => {
    expect(segmentsAt(days, 1, "ana", "window", 30)).toEqual({
      merged: 1,
      open: 2,
    })
  })

  it("never returns a negative segment", () => {
    // A hand-edited payload can walk a cumulative count backwards; a negative
    // height renders as a column growing down out of its track.
    const broken = decodeView({
      authors: ["ana"],
      from: "2026-03-01",
      n: 2,
      changed: [
        [0, [[0, 5, 5]]],
        [1, [[0, -4, -4]]],
      ],
    })
    const s = segmentsAt(broken.days, 1, "ana", "window", 1)
    expect(s.merged).toBe(0)
    expect(s.open).toBe(0)
  })

  it("returns zeroes for a person the view has never heard of", () => {
    expect(segmentsAt(days, 3, "nobody", "cumulative", 7)).toEqual({
      merged: 0,
      open: 0,
    })
  })
})

describe("axisMax", () => {
  const v = decodeView(series)

  it("has a floor, so a quiet week still gets a full track", () => {
    expect(axisMax(v.days, v.authors, "cumulative", 7)).toBe(10)
  })

  it("rounds up to a readable ceiling", () => {
    const busy = decodeView({
      authors: ["ana"],
      from: "2026-03-01",
      n: 1,
      changed: [[0, [[3, 20, 23]]]],
    })
    // 23 tall → 30, not 23.
    expect(axisMax(busy.days, busy.authors, "cumulative", 7)).toBe(30)
  })

  it("measures the whole axis, not the scrubbed day", () => {
    // The scale has to hold still while scrubbing; if it tracked the current
    // day, every column would move for reasons unrelated to the day chosen.
    const peaked = decodeView({
      authors: ["ana"],
      from: "2026-03-01",
      n: 2,
      changed: [
        [0, [[0, 40, 40]]],
        [1, [[0, -40, 0]]],
      ],
    })
    // Day 1 is empty, but day 0 peaked at 40 — the ceiling stays 40.
    expect(axisMax(peaked.days, peaked.authors, "cumulative", 7)).toBe(40)
  })
})

describe("rankAuthors", () => {
  it("puts the tallest first", () => {
    expect(
      rankAuthors(["ana", "bo"], { ana: 1, bo: 9 }, ["ana", "bo"]),
    ).toEqual(["bo", "ana"])
  })

  it("breaks ties on the final ranking, so early days do not shuffle", () => {
    // Every early day is a tie at zero. Without the tiebreak the whole row
    // reorders on each one, and scrubbing reads as noise.
    const order = ["bo", "ana"]
    expect(rankAuthors(["ana", "bo"], { ana: 0, bo: 0 }, order)).toEqual(order)
  })
})

describe("frameAt", () => {
  const v = decodeView(series)

  it("totals the day across everyone", () => {
    const f = frameAt(v, 2, "cumulative", 7)
    // ana 1 merged / 1 open, bo 0 merged / 2 open.
    expect(f.totalMerged).toBe(1)
    expect(f.totalOpen).toBe(3)
  })

  it("ranks and dates the day it resolves", () => {
    const f = frameAt(v, 2, "cumulative", 7)
    expect(f.date).toBe("2026-03-03")
    expect(f.segments.ana).toEqual({ merged: 1, open: 1 })
    expect(f.segments.bo).toEqual({ merged: 0, open: 2 })
    // Both total 2, so the view's own author order settles it.
    expect(f.order).toEqual(["ana", "bo"])
  })

  it("ranks on the total, not on merged alone", () => {
    // Day 3: ana 3 merged / 0 open, bo 0 merged / 2 open. Ranking on merged
    // would be right here by accident — the windowed view is where it bites,
    // so check a day where open is the whole of someone's column.
    const f = frameAt(v, 3, "cumulative", 7)
    expect(f.order).toEqual(["ana", "bo"])
    expect(f.segments.bo).toEqual({ merged: 0, open: 2 })
  })
})

describe("mergedPerDay", () => {
  it("sums merged across everyone for the sparkline", () => {
    const v = decodeView(series)
    expect(mergedPerDay(v)).toEqual([0, 1, 1, 3])
  })
})
