import { useCallback, useEffect, useRef, useState } from "react"

import type { Widget } from "@bulletin/schema"
import { GRID_MAX_COLS, GRID_MAX_ROWS } from "@bulletin/schema"

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
  /** Live pixel size of the card while resizing. */
  sizePx: { width: number; height: number } | null
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

/**
 * Where `origin` snaps to after a drag of `dCol`/`dRow` whole cells.
 * Move keeps size and clamps position; resize keeps position and clamps
 * size (rows are position-unbounded in the schema, sizes are not).
 */
export function dragCandidate(
  kind: DragKind,
  origin: Rect,
  dCol: number,
  dRow: number,
): Rect {
  if (kind === "move") {
    return {
      col: clamp(origin.col + dCol, 1, GRID_MAX_COLS - origin.cols + 1),
      row: Math.max(1, origin.row + dRow),
      cols: origin.cols,
      rows: origin.rows,
    }
  }
  return {
    col: origin.col,
    row: origin.row,
    cols: clamp(origin.cols + dCol, 1, GRID_MAX_COLS - origin.col + 1),
    rows: clamp(origin.rows + dRow, 1, GRID_MAX_ROWS),
  }
}

/**
 * Pointer-driven move/resize on the desktop dashboard grid. The dragged
 * card floats with the pointer while a ghost cell previews the snap
 * target; the draft is written once, on drop. Cell math mirrors the
 * .dash-grid geometry (4 columns, 12px gap, fixed row unit), so this only
 * activates on the ≥1100px grid where explicit placement applies.
 */
export function useGridDrag({
  widgets,
  rowHeight,
  onCommit,
}: {
  widgets: Widget[]
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
      // Explicit col/row placement only exists on the 4-column grid.
      if (!window.matchMedia("(min-width: 1100px)").matches) return
      const grid = gridRef.current
      const widget = widgetsRef.current.find((w) => w.routine === slug)
      if (!grid || !widget) return

      event.preventDefault()
      const origin: Rect = { ...widget.position, ...widget.size }
      const cellWidth =
        (grid.getBoundingClientRect().width - GRID_GAP * (GRID_MAX_COLS - 1)) /
        GRID_MAX_COLS
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
        const candidate = dragCandidate(
          kind,
          origin,
          Math.round(dx / colStep),
          Math.round(dy / rowStep),
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
                  width: Math.max(
                    cellWidth / 2,
                    cellWidth * origin.cols + GRID_GAP * (origin.cols - 1) + dx,
                  ),
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

      const cleanup = () => {
        window.removeEventListener("pointermove", onMove)
        window.removeEventListener("pointerup", onUp)
        window.removeEventListener("pointercancel", cleanup)
        window.removeEventListener("keydown", onKey)
        cleanupRef.current = null
        setDrag(null)
      }

      window.addEventListener("pointermove", onMove)
      window.addEventListener("pointerup", onUp)
      window.addEventListener("pointercancel", cleanup)
      window.addEventListener("keydown", onKey)
      cleanupRef.current = cleanup
    },
    [rowHeight],
  )

  return { drag, gridRef, startDrag, cancel }
}
