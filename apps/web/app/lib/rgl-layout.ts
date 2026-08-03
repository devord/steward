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

/**
 * The grips a cell offers. The corner alone (RGL's default, and all the board
 * had) moves width and height together, so making a widget shorter without
 * also making it narrower meant dragging a 20px corner box along a perfectly
 * vertical line. The bottom and right edges give each dimension its own
 * handle, which is the gesture a dashboard grid is expected to have.
 */
export const RESIZE_HANDLES = ["se", "s", "e"] as const

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

/**
 * A settled RGL item folded onto what the board should store, given the grid
 * the reader actually settled it on.
 *
 * The tablet and phone grids have fewer columns than the board — 2 and 1 —
 * and RGL generates them from the desktop layout, so the item it hands back
 * says `x: 0, w: 1` no matter where the widget lives on the board. Writing
 * that would move every widget to column 1 and shrink it to a single column:
 * a phone reorder would silently flatten a desktop arrangement its reader was
 * never shown.
 *
 * Rows are the one thing a narrow grid states faithfully — it stacks in the
 * board's own vertical order and a resize there changes a real height — so on
 * a narrow grid only `row`/`rows` move and the stored columns are kept.
 * Reordering on a phone still reorders the board, which is the point; widgets
 * that shared a desktop row rejoin it on the next render, since vertical
 * compaction floats them back up beside each other (ADR-0041).
 */
export function settledRect(
  item: LayoutItem,
  columns: number,
  stored: Rect,
  narrow: boolean,
): Rect {
  const rect = layoutItemToRect(item, columns)
  return narrow ? { ...stored, row: rect.row, rows: rect.rows } : rect
}
