import { describe, expect, it } from "vitest"

import { dragCandidate } from "./use-grid-drag.ts"

describe("dragCandidate", () => {
  const origin = { col: 2, row: 2, cols: 2, rows: 1 }
  // A 4-column board — bounds are the board's own count, not a global.
  const columns = 4

  it("moves by whole cells, keeping size", () => {
    expect(dragCandidate("move", origin, 1, -1, columns)).toEqual({
      col: 3,
      row: 1,
      cols: 2,
      rows: 1,
    })
  })

  it("clamps a move to the grid edges", () => {
    expect(dragCandidate("move", origin, 10, -10, columns)).toEqual({
      col: 3, // 4 columns minus a 2-wide widget
      row: 1,
      cols: 2,
      rows: 1,
    })
    expect(dragCandidate("move", origin, -10, 0, columns).col).toBe(1)
  })

  it("lets a move grow the grid downward (rows are unbounded)", () => {
    expect(dragCandidate("move", origin, 0, 10, columns).row).toBe(12)
  })

  it("resizes by whole cells, keeping position", () => {
    expect(dragCandidate("resize", origin, 1, 1, columns)).toEqual({
      col: 2,
      row: 2,
      cols: 3,
      rows: 2,
    })
  })

  it("clamps a resize to the remaining columns and max rows", () => {
    expect(dragCandidate("resize", origin, 10, 50, columns)).toEqual({
      col: 2,
      row: 2,
      cols: 3, // columns 2..4
      rows: 12, // GRID_MAX_ROWS
    })
  })

  it("never shrinks below one cell", () => {
    expect(dragCandidate("resize", origin, -10, -10, columns)).toEqual({
      col: 2,
      row: 2,
      cols: 1,
      rows: 1,
    })
  })
})
