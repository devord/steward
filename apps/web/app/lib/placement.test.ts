import type { Widget } from "@steward/schema"
import { describe, expect, it } from "vitest"

import { collides, findFreeSlot } from "./placement.ts"

const widget = (
  routine: string,
  col: number,
  row: number,
  cols = 1,
  rows = 1,
): Widget => ({ routine, position: { col, row }, size: { cols, rows } })

describe("findFreeSlot", () => {
  // A 4-column board (the default); the slot scan is bounded by it.
  it("places the first widget at the origin", () => {
    expect(findFreeSlot([], { cols: 2, rows: 1 }, 4)).toEqual({
      col: 1,
      row: 1,
    })
  })

  it("skips occupied cells", () => {
    const existing = [widget("a", 1, 1, 2, 2)]
    expect(findFreeSlot(existing, { cols: 2, rows: 1 }, 4)).toEqual({
      col: 3,
      row: 1,
    })
  })

  it("wraps to the next row when nothing fits", () => {
    const existing = [widget("a", 1, 1, 3, 1)]
    expect(findFreeSlot(existing, { cols: 2, rows: 1 }, 4)).toEqual({
      col: 1,
      row: 2,
    })
  })

  it("uses the board's width — a wider board fits more per row", () => {
    const existing = [widget("a", 1, 1, 3, 1)]
    expect(findFreeSlot(existing, { cols: 2, rows: 1 }, 6)).toEqual({
      col: 4,
      row: 1,
    })
  })
})

describe("collides", () => {
  it("ignores the widget being moved", () => {
    const widgets = [widget("a", 1, 1, 2, 1)]
    expect(collides(widgets, { col: 1, row: 1, cols: 2, rows: 1 }, "a")).toBe(
      false,
    )
  })

  it("detects overlap with another widget", () => {
    const widgets = [widget("a", 1, 1, 2, 1), widget("b", 3, 1, 1, 1)]
    expect(collides(widgets, { col: 2, row: 1, cols: 2, rows: 1 }, "a")).toBe(
      true,
    )
  })
})
