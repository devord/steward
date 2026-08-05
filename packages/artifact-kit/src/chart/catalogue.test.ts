import { vlAllTemplateDefs } from "flint-chart/vegalite"
import { describe, expect, it } from "vitest"

import { compileCharts, type ChartRequest } from "./compile.ts"

/**
 * The derived allowlist (ADR-0062).
 *
 * The ADR's argument for letting a routine name **any** `chartType` is that a
 * wrong choice cannot produce a wrong-*looking* artifact: "The kit's build
 * renders every flint `chartType` and asserts the emitted SVG carries only
 * sentinel colours, only ≥12px type, only the kit's font stack… That test _is_
 * the allowlist."
 *
 * It did not exist. Nothing imported flint's catalogue, and `publishable.test.ts`
 * exercises `x`/`y` only — so no test had ever compiled a chart with a `color`
 * encoding, and every generic `chart` block using one was dropped at publish
 * for painting tableau10. Two more classes surfaced the moment this sweep ran:
 * facet headers (`config.header`, unset) and axis titles (`config.axisX` and
 * `axisY`, which Vega-Lite resolves *over* `config.axis`, so flint's `#666`
 * outranked a kit setting that was correct and more general).
 *
 * **The list below is the allowlist, and it is recorded rather than aspired
 * to.** A form that fails here is already handled — `compileCharts` drops it
 * with a stated reason and the artifact publishes without the band. What must
 * not happen silently is the set *changing*: a flint upgrade breaking a form
 * that worked, or a fix quietly making one pass while the docs still say it
 * cannot. Both trip this test and both deserve a human deciding what it means.
 */

/**
 * One table every form can read something out of: a category to band by, a
 * date to run along, a magnitude to measure, and a second category for the
 * colour channel — the axis that had no coverage at all.
 */
const ROWS = [
  { module: "cart", day: "2026-07-06", commits: 34, kind: "merged" },
  { module: "cart", day: "2026-07-13", commits: 21, kind: "open" },
  { module: "checkout", day: "2026-07-20", commits: 28, kind: "merged" },
  { module: "checkout", day: "2026-07-27", commits: 12, kind: "open" },
  { module: "catalog", day: "2026-08-03", commits: 22, kind: "merged" },
  { module: "catalog", day: "2026-08-10", commits: 9, kind: "open" },
]

const SEMANTIC_TYPES = {
  module: "Category",
  day: "Date",
  commits: "Quantity",
  kind: "Category",
}

/**
 * Fill only the channels a form declares, from the one field of each shape
 * that suits it. `column`/`row` are included deliberately: faceting is a
 * channel a routine may legitimately name, and leaving it out of the sweep is
 * how `config.header` went unnoticed.
 */
const FIELD_FOR: Record<string, string> = {
  x: "day",
  y: "commits",
  color: "kind",
  theta: "commits",
  size: "commits",
  detail: "module",
  column: "module",
  row: "module",
}

function requestFor(chartType: string, channels: readonly string[]) {
  const encodings: Record<string, string> = {}
  for (const c of channels)
    if (FIELD_FOR[c] !== undefined) encodings[c] = FIELD_FOR[c]
  return {
    id: chartType,
    spec: {
      data: { values: ROWS },
      semantic_types: SEMANTIC_TYPES,
      chart_spec: { chartType, encodings },
    },
  }
}

const CATALOGUE: { chart: string; channels: readonly string[] }[] =
  vlAllTemplateDefs.map((d: { chart: string; channels?: string[] }) => ({
    chart: d.chart,
    channels: d.channels ?? ["x", "y"],
  }))

/**
 * Forms this fixture cannot publish, and why — the allowlist's complement.
 *
 * Every remaining entry fails inside **flint's own template**, which paints
 * literals its `instantiate()` writes straight onto marks rather than into the
 * config the kit governs. Fixing them means overriding flint per template,
 * which is the trade ADR-0062 already declined: the kit drops them safely, and
 * a routine that names one gets a stated reason on provenance.
 */
const NOT_PUBLISHABLE: Record<string, string> = {
  "Bar Table": "paints #999/#666 and overflows every tier",
  "Candlestick Chart": "needs an open/high/low/close quartet",
  "KPI Card": "needs metric/value/goal",
  "Pyramid Chart": "paints #4e79a7/#e15759",
  "Radar Chart": "paints #ddd/#e0e0e0/#555",
  Sparkline: "paints #999/#9a9a9a",
  "Violin Plot": "overflows the narrow budget",
  "Waterfall Chart": "paints #93c4aa/#6b7280/#f7e0b6/#f78a64",
}

describe("the flint catalogue", () => {
  it("sweeps every form the backend registers", () => {
    // Guards everything below from passing vacuously if the import shape
    // changes under us.
    expect(CATALOGUE.length).toBeGreaterThan(30)
  })

  it("publishes exactly the forms the allowlist records", async () => {
    const requests: ChartRequest[] = CATALOGUE.map((d) =>
      requestFor(d.chart, d.channels),
    )
    const { charts, failures } = await compileCharts(requests)

    const failed = failures.map((f) => f.id).sort()
    const recorded = Object.keys(NOT_PUBLISHABLE).sort()

    // The message carries the reasons, so a failure here reads as a diff
    // rather than as two bare lists.
    expect(
      failed,
      failures.map((f) => `${f.id}: ${f.problems[0]}`).join("\n"),
    ).toEqual(recorded)

    expect(charts.size).toBe(CATALOGUE.length - recorded.length)
  }, 300_000)

  it("conforms the colour channel, which is what shipped broken", async () => {
    const withColour = CATALOGUE.filter(
      (d) => d.channels.includes("color") && !(d.chart in NOT_PUBLISHABLE),
    )
    expect(withColour.length).toBeGreaterThan(15)

    const { failures } = await compileCharts(
      withColour.map((d) => requestFor(d.chart, d.channels)),
    )
    expect(
      failures.map((f) => `${f.id}: ${f.problems[0]}`),
      "a colour-taking form regressed",
    ).toEqual([])
  }, 300_000)
})
