import { describe, expect, it } from "vitest"

import { PALETTE } from "../../tokens/palette.ts"
import { compileCharts, TIER_BUDGET } from "../compile.ts"
import { conformChart } from "../conform.ts"
import { seriesRequest, type SeriesSpec } from "./series.ts"

/**
 * The burn-up, compiled through flint (ADR-0062).
 *
 * These replace the assertions that used to sit on `Series.tsx`'s markup —
 * label nudging, `flex-basis` arithmetic, percentage offsets. Those tested how
 * one component drew; what matters and survives is what the chart *claims*, so
 * these assert on the emitted SVG instead.
 */

const spec: SeriesSpec = {
  from: "2026-07-01",
  to: "2026-08-01",
  today: "2026-07-30",
  max: 40,
  lines: [
    {
      id: "scope",
      label: "40 scope",
      role: "ceiling",
      points: [
        { x: "2026-07-01", y: 32 },
        { x: "2026-07-15", y: 36 },
        { x: "2026-07-30", y: 40 },
      ],
    },
    {
      id: "landed",
      label: "16 landed",
      role: "hero",
      points: [
        { x: "2026-07-01", y: 4 },
        { x: "2026-07-15", y: 10 },
        { x: "2026-07-30", y: 16 },
      ],
    },
    {
      id: "required",
      label: "needs 11.2/wk",
      role: "target",
      points: [
        { x: "2026-07-30", y: 16 },
        { x: "2026-08-01", y: 40 },
      ],
    },
  ],
}

const render = async (s: SeriesSpec = spec) => {
  const { charts, failures } = await compileCharts([seriesRequest("b", s)])
  return { svg: charts.get("b"), failures }
}

describe("the burn-up through flint", () => {
  it("compiles every tier and conforms at each", async () => {
    const { svg, failures } = await render()
    expect(failures).toEqual([])
    for (const tier of ["page", "detail", "narrow"] as const) {
      expect(svg?.[tier]).toContain("<svg")
      expect(conformChart(svg?.[tier] ?? "", tier, TIER_BUDGET[tier])).toEqual(
        [],
      )
    }
  })

  it("paints the hero in the accent and the context in gray", async () => {
    // One series is the point; the rest are context. Painting the context in
    // hues spends an accent budget that belongs elsewhere on the page.
    const { svg } = await render()
    expect(svg?.page).toContain(PALETTE.orange)
    expect(svg?.page).toContain(PALETTE["ink-dim"])
  })

  it("steps the ceiling instead of sloping it", async () => {
    // Scope does not grow a little every day. Somebody added four tickets on a
    // Tuesday, and the step is where they did it. A step-after path repeats an
    // x before changing y, which a straight interpolation never does.
    const { svg } = await render()
    const paths = [...(svg?.page ?? "").matchAll(/ d="(M[^"]+)"/g)].map(
      (m) => m[1],
    )
    const stepped = paths.some((d) => {
      const xs = [...d.matchAll(/[ML](-?[\d.]+),/g)].map((m) => Number(m[1]))
      return xs.some((x, i) => i > 0 && x === xs[i - 1])
    })
    expect(stepped).toBe(true)
  })

  it("marks now, and puts a dot on the hero's last point", async () => {
    const { svg } = await render()
    // The rule layer draws with a 4,4 dash; the point layer is the only
    // <path> carrying the accent as a fill rather than a stroke.
    expect(svg?.page).toMatch(/stroke-dasharray="4,4"/)
    expect(svg?.page).toMatch(new RegExp(`fill="${PALETTE.orange}"`))
  })

  it("never lets a target slope set the y scale", async () => {
    // A target is shown, never counted: it ends at a number nobody has hit, and
    // letting it set the ceiling squashes every real line into the bottom third.
    const { max: _dropped, ...noMax } = spec
    const { svg } = await render(noMax)
    // The tallest observed non-target point is 40; the target reaches 40 too,
    // so lower the observed set and check the axis follows the data, not it.
    const shorter: SeriesSpec = {
      ...noMax,
      lines: noMax.lines.map((l) =>
        l.role === "target"
          ? {
              ...l,
              points: [
                { x: "2026-07-30", y: 16 },
                { x: "2026-08-01", y: 400 },
              ],
            }
          : l,
      ),
    }
    const tall = await render(shorter)
    const ticks = (s: string) =>
      [...s.matchAll(/>(\d+)<\/text>/g)].map((m) => Number(m[1]))
    const highest = Math.max(...ticks(tall.svg?.page ?? ""), 0)
    expect(highest).toBeLessThan(400)
    expect(svg?.page).toContain("<svg")
  })

  it("labels three dates, not eleven", async () => {
    // Flint derives a dense mixed-format time axis. The window's ends and now
    // are the only dates a burn-up is read against.
    const { svg } = await render()
    const dates = [...(svg?.page ?? "").matchAll(/>(\d{4}-\d{2}-\d{2})</g)]
    expect(dates).toHaveLength(3)
  })

  it("reads dates in UTC, not the runner's zone", async () => {
    // Vega's temporal scales are local-time by default, so a UTC-midnight
    // point renders a day early anywhere west of Greenwich.
    const { svg } = await render()
    expect(svg?.page).toContain("2026-07-01")
    expect(svg?.page).not.toContain("2026-06-30")
  })

  it("carries one legend listing every series once", async () => {
    // The old chart printed the same four strings twice — direct end labels
    // and a legend — and the end labels drifted off their own lines under the
    // collision gap. One legend keeps swatch, dash and word in one place.
    const { svg } = await render()
    // Rendered text only. Vega also names the series in a per-point
    // `aria-label`, which is a screen reader hearing it once per mark rather
    // than a reader seeing it twice on the page.
    const drawn = [...(svg?.page ?? "").matchAll(/>([^<>]+)<\/text>/g)].map(
      (m) => m[1],
    )
    for (const label of ["40 scope", "16 landed", "needs 11.2/wk"]) {
      expect(drawn.filter((t) => t === label)).toHaveLength(1)
    }
  })

  it("still draws when there is no now-marker to place", async () => {
    const { today: _t, ...noToday } = spec
    const { svg, failures } = await render(noToday)
    expect(failures).toEqual([])
    expect(svg?.page).toContain("<svg")
  })
})
