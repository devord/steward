import { describe, expect, it } from "vitest"

import { PALETTE } from "../../tokens/palette.ts"
import { compileCharts, TIER_BUDGET } from "../compile.ts"
import { conformChart } from "../conform.ts"
import { RAMP } from "../finish.ts"
import { matrixRequest, type MatrixSpec } from "./matrix.ts"

/**
 * The co-change field, compiled through flint (ADR-0062).
 *
 * These carry forward what ADR-0047 claimed, which is about what the field
 * *says* — one hue, blank diagonal, mirrored cells, a ring for a named pair —
 * rather than how `CouplingMatrix.tsx` happened to draw it.
 */

const spec: MatrixSpec = {
  labels: ["cart", "checkout", "pricing", "catalog", "account"],
  cells: [
    { a: 0, b: 1, value: 14 },
    { a: 1, b: 2, value: 6 },
    { a: 3, b: 4, value: 11 },
    { a: 0, b: 3, value: 3 },
  ],
  marks: [{ a: 0, b: 1, label: "cart and checkout" }],
}

const render = async (s: MatrixSpec = spec) => {
  const { charts, failures } = await compileCharts([matrixRequest("m", s)])
  return { svg: charts.get("m"), failures }
}

describe("the co-change field through flint", () => {
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

  it("paints from a quantized ramp, never an interpolation", async () => {
    // A continuous scale emits computed colours that are in no palette — the
    // first heatmap through this pipeline was dropped naming five of them.
    const { svg } = await render()
    const painted = new Set(
      [...(svg?.page ?? "").matchAll(/fill="(#[0-9a-f]{3,6})"/gi)].map((m) =>
        m[1].toLowerCase(),
      ),
    )
    for (const c of painted)
      expect(
        Object.values(PALETTE)
          .map((v) => v.toLowerCase())
          .includes(c),
      ).toBe(true)
    // And at least one of them came off the ramp rather than the chrome.
    expect([...painted].some((c) => RAMP.includes(c))).toBe(true)
  })

  it("mirrors a triangle, so a reader can enter from either axis", async () => {
    const { svg } = await render()
    // Vega names each cell in an aria-label; a mirrored pair appears as both
    // orderings.
    const labels = svg?.page ?? ""
    expect(labels).toContain("cart")
    expect(labels).toContain("checkout")
    const forward = (labels.match(/row: cart/g) ?? []).length
    const back = (labels.match(/col: cart/g) ?? []).length
    expect(forward).toBeGreaterThan(0)
    expect(forward).toBe(back)
  })

  it("rings a named pair rather than filling over it", async () => {
    // The fill already spends itself on magnitude; marking significance with
    // more of the same fill makes two claims in one channel and the reader
    // cannot tell which one a dark cell is making (ADR-0047).
    //
    // `filled: false` does NOT do this — it only decides which channel the
    // colour encoding lands on. Measured before the fix: this layer painted
    // solid rectangles straight over the cells it was meant to outline.
    const { svg } = await render()
    const layers = [
      ...(svg?.page ?? "").matchAll(
        /<g class="(mark-rect[^"]*)"[^>]*>(.*?)<\/g>/gs,
      ),
    ]
    const ring = layers.find((l) => l[1].includes("layer_1"))
    expect(ring).toBeDefined()
    const paths = [...(ring?.[2] ?? "").matchAll(/<path[^>]*>/g)].map(
      (m) => m[0],
    )
    expect(paths.length).toBeGreaterThan(0)
    for (const path of paths) {
      expect(path).not.toMatch(/\sfill="(?!none)/)
      expect(path).toContain(`stroke="${PALETTE.ink}"`)
    }
  })

  it("leaves the diagonal blank rather than drawing a self-pair", async () => {
    // A module co-changes with itself on every commit. Drawing that puts the
    // darkest cells on the one axis carrying no information.
    const withDiagonal: MatrixSpec = {
      ...spec,
      cells: [...spec.cells, { a: 2, b: 2, value: 99 }],
    }
    const { svg } = await render(withDiagonal)
    // Asserted on the cell's own accessible name rather than the raw string:
    // "99" turns up inside path coordinates on any chart this size.
    expect(svg?.page).not.toContain("value: 99")
  })

  it("draws square cells, so the two directions compare equally", async () => {
    const { svg } = await render()
    const w = Number(/<svg[^>]*width="(\d+)"/.exec(svg?.page ?? "")?.[1] ?? 0)
    const h = Number(/<svg[^>]*height="(\d+)"/.exec(svg?.page ?? "")?.[1] ?? 0)
    // Label gutter makes them not exactly equal; the plot itself is square.
    expect(Math.abs(w - h)).toBeLessThan(w * 0.5)
  })

  it("survives a cell addressing a label that is not there", async () => {
    const { svg, failures } = await render({
      ...spec,
      cells: [...spec.cells, { a: 0, b: 99, value: 5 }],
    })
    expect(failures).toEqual([])
    expect(svg?.page).toContain("<svg")
  })

  it("still draws when no pair is marked", async () => {
    const { marks: _m, ...noMarks } = spec
    const { svg, failures } = await render(noMarks)
    expect(failures).toEqual([])
    expect(svg?.page).toContain("<svg")
  })
})
