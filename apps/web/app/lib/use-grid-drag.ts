import { useCallback, useEffect, useRef, useState } from "react"

import type { Widget } from "@steward/schema"
import { GRID_MAX_ROWS } from "@steward/schema"

import { collides, type Rect } from "./placement.ts"

/** Must match the .dash-grid gap in app.css. */
const GRID_GAP = 12
/** Pointer travel (px) before a press counts as a drag, not a click. */
const DRAG_THRESHOLD = 4

export type DragKind = "move" | "resize"

export interface GridDrag {
  slug: string
  kind: DragKind
  /** Snap target in grid units, already clamped to the grid. */
  candidate: Rect
  /** Whether dropping at `candidate` would collide with another widget. */
  valid: boolean
  /** Pointer travel since the drag activated. */
  dx: number
  dy: number
  /** Live pixel size of the card while resizing. `width` is null on the
      narrow flow grids, where the grid owns the card's width. */
  sizePx: { width: number | null; height: number } | null
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

/**
 * Where `origin` snaps to after a drag of `dCol`/`dRow` whole cells.
 * Move keeps size and clamps position; resize keeps position and clamps
 * size (rows are position-unbounded in the schema, sizes are not). Column
 * bounds come from the board's own `columns`, not a global ceiling.
 */
export function dragCandidate(
  kind: DragKind,
  origin: Rect,
  dCol: number,
  dRow: number,
  columns: number,
): Rect {
  if (kind === "move") {
    return {
      col: clamp(origin.col + dCol, 1, columns - origin.cols + 1),
      row: Math.max(1, origin.row + dRow),
      cols: origin.cols,
      rows: origin.rows,
    }
  }
  return {
    col: origin.col,
    row: origin.row,
    cols: clamp(origin.cols + dCol, 1, columns - origin.col + 1),
    rows: clamp(origin.rows + dRow, 1, GRID_MAX_ROWS),
  }
}

/**
 * Pointer-driven move/resize on the dashboard grid. The dragged card
 * floats with the pointer while a ghost cell previews the snap target;
 * the draft is written once, on drop. Cell math mirrors the .dash-grid
 * geometry (12px gap, fixed row unit, columns per breakpoint). Move only
 * exists on the full ≥1100px grid where explicit col/row placement
 * applies; on the narrow auto-flow grids resize stays live, rows only —
 * the flow grid owns each card's column span.
 */
export function useGridDrag({
  widgets,
  columns,
  rowHeight,
  onCommit,
}: {
  widgets: Widget[]
  columns: number
  rowHeight: number
  onCommit: (slug: string, rect: Rect) => void
}) {
  const gridRef = useRef<HTMLElement | null>(null)
  const [drag, setDrag] = useState<GridDrag | null>(null)
  const widgetsRef = useRef(widgets)
  widgetsRef.current = widgets
  const commitRef = useRef(onCommit)
  commitRef.current = onCommit
  const cleanupRef = useRef<(() => void) | null>(null)

  const cancel = useCallback(() => cleanupRef.current?.(), [])
  useEffect(() => () => cleanupRef.current?.(), [])

  const startDrag = useCallback(
    (slug: string, kind: DragKind, event: React.PointerEvent) => {
      if (event.button !== 0 || cleanupRef.current) return
      // Explicit col/row placement only exists on the full ≥1100px grid;
      // the narrow grids auto-flow, so a move has nothing to move there.
      const full = window.matchMedia("(min-width: 1100px)").matches
      if (!full && kind === "move") return
      const grid = gridRef.current
      const widget = widgetsRef.current.find((w) => w.routine === slug)
      if (!grid || !widget) return

      event.preventDefault()
      const origin: Rect = { ...widget.position, ...widget.size }
      // Rendered column count per .dash-grid's breakpoints (app.css):
      // the board's own `columns` on the full grid, 2 on tablet, 1 on phone.
      const gridColumns = full
        ? columns
        : window.matchMedia("(min-width: 700px)").matches
          ? 2
          : 1
      const cellWidth =
        (grid.getBoundingClientRect().width - GRID_GAP * (gridColumns - 1)) /
        gridColumns
      const colStep = cellWidth + GRID_GAP
      const rowStep = rowHeight + GRID_GAP
      const startX = event.clientX
      const startY = event.clientY
      // Only the pointer that started the drag may steer it (a second
      // touch or a stray synthetic move must not hijack the candidate).
      const pointerId = event.pointerId
      let active = false
      let latest: GridDrag | null = null

      const onMove = (e: PointerEvent) => {
        if (e.pointerId !== pointerId) return
        const dx = e.clientX - startX
        const dy = e.clientY - startY
        if (!active) {
          if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD)
            return
          active = true
        }
        e.preventDefault()
        // On the narrow grids only rows resize — the stored `cols` is the
        // desktop span, which the flow grid clamps for display, so a
        // horizontal drag there would edit an invisible value.
        const candidate = dragCandidate(
          kind,
          origin,
          full ? Math.round(dx / colStep) : 0,
          Math.round(dy / rowStep),
          columns,
        )
        latest = {
          slug,
          kind,
          candidate,
          valid: !collides(widgetsRef.current, candidate, slug),
          dx,
          dy,
          sizePx:
            kind === "resize"
              ? {
                  width: full
                    ? Math.max(
                        cellWidth / 2,
                        cellWidth * origin.cols +
                          GRID_GAP * (origin.cols - 1) +
                          dx,
                      )
                    : null,
                  height: Math.max(
                    rowHeight / 2,
                    rowHeight * origin.rows + GRID_GAP * (origin.rows - 1) + dy,
                  ),
                }
              : null,
        }
        setDrag(latest)
      }

      const onUp = (e: PointerEvent) => {
        if (e.pointerId !== pointerId) return
        const drop = latest
        cleanup()
        if (!drop?.valid) return
        const { candidate } = drop
        // An unchanged rect must not fork a draft ("unsynced changes").
        if (
          candidate.col === origin.col &&
          candidate.row === origin.row &&
          candidate.cols === origin.cols &&
          candidate.rows === origin.rows
        )
          return
        commitRef.current(slug, candidate)
      }

      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") cleanup()
      }

      const onCancel = (e: PointerEvent) => {
        if (e.pointerId === pointerId) cleanup()
      }

      const cleanup = () => {
        window.removeEventListener("pointermove", onMove)
        window.removeEventListener("pointerup", onUp)
        window.removeEventListener("pointercancel", onCancel)
        window.removeEventListener("keydown", onKey)
        cleanupRef.current = null
        setDrag(null)
      }

      window.addEventListener("pointermove", onMove)
      window.addEventListener("pointerup", onUp)
      window.addEventListener("pointercancel", onCancel)
      window.addEventListener("keydown", onKey)
      cleanupRef.current = cleanup
    },
    [columns, rowHeight],
  )

  return { drag, gridRef, startDrag, cancel }
}
