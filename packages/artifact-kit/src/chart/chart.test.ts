import { describe, expect, it } from "vitest"

import { PALETTE } from "../tokens/palette.ts"
import { type ChartSpec, compileCharts } from "./compile.ts"
import { conformChart, TYPE_FLOOR } from "./conform.ts"
import { clampType, SERIES_INK } from "./finish.ts"
import { monoWidth, MONO_ADVANCE } from "./measure.ts"

const bars = (rows = 4): ChartSpec => ({
  data: {
    values: Array.from({ length: rows }, (_, i) => ({
      name: `m${i}`,
      count: (i + 1) * 3,
    })),
  },
  semantic_types: { name: "Category", count: "Quantity" },
  chart_spec: { chartType: "Bar Chart", encodings: { x: "name", y: "count" } },
})

describe("conformChart", () => {
  it("passes a chart painted only from the palette", () => {
    expect(
      conformChart(
        `<svg><path fill="${PALETTE.orange}"/><text font-size="12px" font-family="ui-monospace">a</text></svg>`,
      ),
    ).toEqual([])
  })

  it("names the colours that fall outside the palette", () => {
    // tableau10's first two, which is what flint reaches for unprompted.
    const [problem] = conformChart(
      `<svg><path stroke="#4c78a8"/><path stroke="#f58518"/></svg>`,
    )
    expect(problem).toContain("#4c78a8")
    expect(problem).toContain("outside the palette")
  })

  it("catches a functional colour notation, not just hex", () => {
    expect(
      conformChart(`<svg><rect fill="rgb(76, 120, 168)"/></svg>`).join(),
    ).toContain("outside the palette")
  })

  it("allows none, transparent and currentColor", () => {
    // currentColor is *better* than a token: it resolves against whatever the
    // board's appended theme settled on.
    expect(
      conformChart(
        `<svg><path fill="none" stroke="currentColor"/><rect fill="transparent"/></svg>`,
      ),
    ).toEqual([])
  })

  it("rejects type under the artifact floor", () => {
    const problem = conformChart(`<svg><text font-size="10px">a</text></svg>`)
    expect(problem.join()).toContain(`${TYPE_FLOOR}px floor`)
  })

  it("rejects a non-mono family, because measurement assumes one", () => {
    expect(
      conformChart(`<svg><text font-family="Helvetica">a</text></svg>`).join(),
    ).toContain("non-mono")
  })

  it("rejects anything the sandbox cannot fetch", () => {
    expect(conformChart(`<svg><image href="a.png"/></svg>`).join()).toContain(
      "external",
    )
    expect(conformChart(`<svg><rect fill="url(#p)"/></svg>`).join()).toContain(
      "external",
    )
  })
})

describe("monoWidth", () => {
  it("is the advance times the count, not an estimate", () => {
    expect(monoWidth({ fontSize: 12 }, "abcd")).toBe(4 * 12 * MONO_ADVANCE)
  })

  it("survives a missing size and a non-string", () => {
    expect(monoWidth({}, null)).toBe(0)
    expect(monoWidth({}, 1234)).toBeGreaterThan(0)
  })
})

describe("clampType", () => {
  it("raises every fontSize to the floor, at any depth", () => {
    const spec = {
      config: { axis: { labelFontSize: 10 }, legend: { titleFontSize: 20 } },
      layer: [{ mark: { fontSize: 8 } }],
    }
    clampType(spec)
    expect(spec.config.axis.labelFontSize).toBe(TYPE_FLOOR)
    expect(spec.config.legend.titleFontSize).toBe(20)
    expect(spec.layer[0].mark.fontSize).toBe(TYPE_FLOOR)
  })

  it("leaves a non-numeric size alone rather than coercing it", () => {
    const spec = { config: { axis: { labelFontSize: "1.2em" } } }
    clampType(spec)
    expect(spec.config.axis.labelFontSize).toBe("1.2em")
  })
})

describe("the emphasis palette", () => {
  it("leads with the accent, then goes gray", () => {
    // One series is the point; the rest are context. Series.tsx's rule,
    // inherited rather than re-argued.
    expect(SERIES_INK[0]).toBe(PALETTE.orange)
    expect(SERIES_INK[1]).toBe(PALETTE["ink-dim"])
  })
})

describe("compileCharts", () => {
  it("renders both tiers and conforms to the palette and the floor", async () => {
    const { charts, failures } = await compileCharts([
      { id: "c1", spec: bars() },
    ])
    expect(failures).toEqual([])
    const c = charts.get("c1")
    expect(c?.page).toContain("<svg")
    expect(c?.tile).toContain("<svg")
    // The whole safety claim, asserted on the artifact that would ship.
    expect(conformChart(c?.page ?? "")).toEqual([])
    expect(conformChart(c?.tile ?? "")).toEqual([])
  })

  it("renders the two tiers at different sizes, never one scaled", async () => {
    const { charts } = await compileCharts([{ id: "c1", spec: bars() }])
    const width = (s: string) => Number(/width="(\d+)"/.exec(s)?.[1] ?? 0)
    const c = charts.get("c1")
    expect(width(c?.page ?? "")).toBeGreaterThan(width(c?.tile ?? ""))
  })

  it("drops a chart whose data outgrew the form, and says why", async () => {
    const { charts, failures } = await compileCharts([
      { id: "big", spec: { ...bars(60), maxRows: 40 } },
    ])
    expect(charts.has("big")).toBe(false)
    expect(failures[0]?.problems.join()).toContain("ceiling")
  })

  it("drops an unknown chartType instead of throwing", async () => {
    // The ceiling is unrestricted by design, so this is reachable — and a
    // scheduled run must survive it (ADR-0062).
    const spec = bars()
    const { charts, failures } = await compileCharts([
      {
        id: "nope",
        spec: {
          ...spec,
          chart_spec: { ...spec.chart_spec, chartType: "Bogus Chart" },
        },
      },
    ])
    expect(charts.has("nope")).toBe(false)
    expect(failures).toHaveLength(1)
  })

  it("compiles the forms Series and CouplingMatrix cannot draw", async () => {
    // The point of the ceiling raise: a scatter and a heatmap without a new
    // React component for either.
    const scatter: ChartSpec = {
      data: {
        values: [
          { churn: 34, complexity: 12, mod: "cart" },
          { churn: 28, complexity: 30, mod: "checkout" },
          { churn: 22, complexity: 8, mod: "catalog" },
        ],
      },
      semantic_types: {
        churn: "Quantity",
        complexity: "Quantity",
        mod: "Category",
      },
      chart_spec: {
        chartType: "Scatter Plot",
        encodings: { x: "churn", y: "complexity" },
      },
    }
    const { charts, failures } = await compileCharts([
      { id: "hotspots", spec: scatter },
    ])
    expect(failures).toEqual([])
    expect(conformChart(charts.get("hotspots")?.page ?? "")).toEqual([])
  })
})
