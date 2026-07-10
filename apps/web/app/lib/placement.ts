import { GRID_MAX_COLS, type Widget, type WidgetSize } from "@bulletin/schema"

export interface Rect {
  col: number
  row: number
  cols: number
  rows: number
}

function toRect(widget: Widget): Rect {
  return { ...widget.position, ...widget.size }
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.col < b.col + b.cols &&
    b.col < a.col + a.cols &&
    a.row < b.row + b.rows &&
    b.row < a.row + a.rows
  )
}

/** Would `widget` (at a candidate rect) collide with any *other* widget? */
export function collides(
  widgets: Widget[],
  candidate: Rect,
  ignoreRoutine?: string,
): boolean {
  return widgets.some(
    (other) =>
      other.routine !== ignoreRoutine && rectsOverlap(candidate, toRect(other)),
  )
}

/**
 * First free top-left slot that fits `size` on the desktop grid, scanning
 * row-major. The grid has unbounded rows, so this always terminates.
 */
export function findFreeSlot(
  widgets: Widget[],
  size: WidgetSize,
  columns: number = GRID_MAX_COLS,
): { col: number; row: number } {
  for (let row = 1; ; row++) {
    for (let col = 1; col <= columns - size.cols + 1; col++) {
      if (!collides(widgets, { col, row, ...size })) return { col, row }
    }
  }
}
