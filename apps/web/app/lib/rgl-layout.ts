import type { LayoutItem } from "react-grid-layout"

import type { Widget } from "@steward/schema"
import { GRID_MAX_ROWS } from "@steward/schema"

import type { Rect } from "./placement.ts"

/**
 * The bridge between the stored layout and react-grid-layout (ADR-0041).
 *
 * The data repo keeps placement 1-indexed (`position.col/row` start at 1) and
 * split across `position`/`size`; RGL works in a flat, 0-indexed `{i,x,y,w,h}`
 * item. The YAML schema is unchanged — this is the only place the two
 * coordinate systems meet, so a reader never has to hold both in their head.
 */

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

/**
 * A widget's stored rect as an RGL layout item. `i` is the routine slug (the
 * card's React key, which RGL matches items to). Per-item bounds ride along so
 * RGL's own drag/resize constraints keep an item inside the board's columns
 * and the row ceiling — the same limits the schema enforces on save.
 */
export function widgetToLayoutItem(
  widget: Widget,
  columns: number,
): LayoutItem {
  return {
    i: widget.routine,
    x: widget.position.col - 1,
    y: widget.position.row - 1,
    w: widget.size.cols,
    h: widget.size.rows,
    minW: 1,
    maxW: columns,
    minH: 1,
    maxH: GRID_MAX_ROWS,
  }
}

/** The board's widgets as an RGL layout, in stored order. */
export function widgetsToLayout(
  widgets: Widget[],
  columns: number,
): LayoutItem[] {
  return widgets.map((widget) => widgetToLayoutItem(widget, columns))
}

/**
 * One RGL item back to a schema rect (1-indexed, clamped to the grid). RGL's
 * constraints already keep items in bounds, but clamping here keeps the schema
 * invariant (`col + cols - 1 ≤ columns`, `rows ≤ GRID_MAX_ROWS`) true no matter
 * what the layout hands back — a hand-authored or migrated layout can't fork a
 * draft the schema would then reject on save.
 */
export function layoutItemToRect(item: LayoutItem, columns: number): Rect {
  const cols = clamp(Math.round(item.w), 1, columns)
  const rows = clamp(Math.round(item.h), 1, GRID_MAX_ROWS)
  const col = clamp(Math.round(item.x) + 1, 1, columns - cols + 1)
  const row = Math.max(1, Math.round(item.y) + 1)
  return { col, row, cols, rows }
}
