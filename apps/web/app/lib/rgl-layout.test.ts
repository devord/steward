import type { LayoutItem } from "react-grid-layout"
import type { Widget } from "@steward/schema"
import { describe, expect, it } from "vitest"

import {
  layoutItemToRect,
  widgetsToLayout,
  widgetToLayoutItem,
} from "./rgl-layout.ts"

const widget = (
  routine: string,
  col: number,
  row: number,
  cols: number,
  rows: number,
): Widget => ({ routine, position: { col, row }, size: { cols, rows } })

describe("widgetToLayoutItem", () => {
  it("converts 1-indexed position/size to 0-indexed x/y with span w/h", () => {
    expect(widgetToLayoutItem(widget("a", 1, 1, 2, 3), 4)).toMatchObject({
      i: "a",
      x: 0,
      y: 0,
      w: 2,
      h: 3,
    })
    expect(widgetToLayoutItem(widget("b", 3, 2, 1, 1), 4)).toMatchObject({
      i: "b",
      x: 2,
      y: 1,
      w: 1,
      h: 1,
    })
  })

  it("rides per-item bounds so RGL keeps items inside the board", () => {
    const item = widgetToLayoutItem(widget("a", 1, 1, 2, 1), 4)
    expect(item.minW).toBe(1)
    expect(item.maxW).toBe(4) // the board's column count
    expect(item.minH).toBe(1)
    expect(item.maxH).toBe(12) // GRID_MAX_ROWS
  })
})

describe("widgetsToLayout", () => {
  it("maps every widget, preserving order and keying by routine", () => {
    const layout = widgetsToLayout(
      [widget("a", 1, 1, 2, 1), widget("b", 3, 1, 1, 1)],
      4,
    )
    expect(layout.map((l) => l.i)).toEqual(["a", "b"])
  })
})

describe("layoutItemToRect", () => {
  const item = (x: number, y: number, w: number, h: number): LayoutItem => ({
    i: "a",
    x,
    y,
    w,
    h,
  })

  it("is the inverse of widgetToLayoutItem for an in-bounds item", () => {
    const w = widget("a", 2, 3, 2, 1)
    const round = layoutItemToRect(widgetToLayoutItem(w, 4), 4)
    expect(round).toEqual({ col: 2, row: 3, cols: 2, rows: 1 })
  })

  it("clamps a width that would overflow the board's columns", () => {
    // x=3 (col 4) with w=3 would run to col 6 on a 4-column board.
    expect(layoutItemToRect(item(3, 0, 3, 1), 4)).toEqual({
      col: 2,
      row: 1,
      cols: 3,
      rows: 1,
    })
  })

  it("clamps rows to the row ceiling and floors position at 1", () => {
    expect(layoutItemToRect(item(0, 0, 1, 99), 4)).toMatchObject({
      rows: 12,
    })
    expect(layoutItemToRect(item(-1, -1, 1, 1), 4)).toMatchObject({
      col: 1,
      row: 1,
    })
  })

  it("rounds fractional coordinates RGL may hand back mid-interaction", () => {
    expect(layoutItemToRect(item(1.6, 2.4, 1.5, 0.9), 4)).toEqual({
      col: 3,
      row: 3,
      cols: 2,
      rows: 1,
    })
  })
})
