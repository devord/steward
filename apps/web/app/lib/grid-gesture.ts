import { useEffect } from "react"
import { flushSync } from "react-dom"

/**
 * Escape abandons a grid drag or resize in flight (ADR-0056).
 *
 * react-grid-layout has no cancel: once a gesture starts, the only way out is
 * to let go, and wherever the cell has got to is where it lands. So the
 * gesture is *rewound* rather than aborted — put the pointer back where it was
 * pressed, release it there, and the library settles the cell home along the
 * same path it would have taken if the reader had dragged it back by hand.
 * Nothing is faked and no library internals are reached into: the commit that
 * follows carries the placement the board already had, so it reads as the
 * no-op it is and never forks a draft.
 *
 * The live gesture is module state because that is what it is. A pointer is a
 * property of the document, not of a component: a board is many grids (one per
 * band, ADR-0044) and only ever one of them is being gestured at, so hanging
 * this off any single grid would leave the others unable to see it — which is
 * the same mistake the iframe shield made before it was scoped to the
 * document.
 */

/** Where the live gesture was pressed, in client coordinates. */
let pressedAt: { x: number; y: number } | null = null

function pointOf(event: Event): { x: number; y: number } | null {
  if (typeof MouseEvent !== "undefined" && event instanceof MouseEvent)
    return { x: event.clientX, y: event.clientY }
  if (typeof TouchEvent !== "undefined" && event instanceof TouchEvent) {
    const touch = event.touches[0] ?? event.changedTouches[0]
    return touch ? { x: touch.clientX, y: touch.clientY } : null
  }
  return null
}

/** RGL is starting a drag or resize; remember where the pointer was. */
export function beginGridGesture(event: Event): void {
  pressedAt = pointOf(event)
}

/** The gesture settled or was rewound; there is nothing left to cancel. */
export function endGridGesture(): void {
  pressedAt = null
}

/**
 * Rewind and release the live gesture. Returns false when there was none, so
 * a caller can tell whether it just consumed the reader's keypress.
 *
 * Only the mouse is rewound. Touch has no Escape to press, and synthesising a
 * `touchend` needs the original `Touch` identity to be accepted — so a touch
 * gesture is simply left to finish on its own.
 */
export function cancelGridGesture(): boolean {
  const from = pressedAt
  if (!from) return false
  pressedAt = null
  const at = (type: string) =>
    new MouseEvent(type, {
      clientX: from.x,
      clientY: from.y,
      bubbles: true,
      cancelable: true,
    })
  // Move first, then release: the move is what walks the cell back, the
  // release is what settles it there. Both go to the document, which is where
  // the library listens once a gesture is under way.
  //
  // The move is flushed before the release is sent. A mousemove is a
  // continuous event, so React batches what it produces and commits it later —
  // and the grid settles against the geometry it holds at the moment of
  // release. Sent in one tick, the release therefore lands on the size from
  // *before* the rewind and stores the very placement this is meant to throw
  // away. Deferring a frame instead would only move the race: the reader's own
  // mouseup can arrive first and settle it the same wrong way.
  flushSync(() => document.dispatchEvent(at("mousemove")))
  document.dispatchEvent(at("mouseup"))
  return true
}

/**
 * Wire Escape to {@link cancelGridGesture}, ahead of every other Escape on the
 * page. It listens in the capture phase and marks the event handled, so the
 * board's own "leave edit mode" Escape — which stands down for a handled event
 * — lets this one through and does not do both at once. With no gesture open
 * the key is untouched and falls through as before.
 */
export function useGridGestureEscape(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return
      if (cancelGridGesture()) event.preventDefault()
    }
    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [])
}
