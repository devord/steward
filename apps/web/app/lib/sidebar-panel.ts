/**
 * Device-local sidebar preferences: whether the rail is collapsed and how
 * wide it is (ADR-0009 keeps per-device chrome prefs client-side). Both
 * persist to localStorage so a chosen layout survives a reload, and both
 * initialise to the SSR default on first render — the stored value is applied
 * in an effect after mount, so server and client first paint match (no
 * hydration mismatch on the width style).
 */
import { useCallback, useEffect, useState } from "react"

export const SIDEBAR_MIN_WIDTH = 200
export const SIDEBAR_MAX_WIDTH = 400
export const SIDEBAR_DEFAULT_WIDTH = 240

const COLLAPSED_KEY = "steward:sidebar:collapsed"
const WIDTH_KEY = "steward:sidebar:width"

export function clampWidth(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width))
}

/** `[collapsed, toggle]`, persisted. Best-effort against a throwing store. */
export function useSidebarCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === "1")
    } catch {
      // no-op: keep the default when the store is unavailable
    }
  }, [])

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0")
      } catch {
        // persisting is best-effort; the in-memory flag still applies
      }
      return next
    })
  }, [])

  return [collapsed, toggle]
}

export interface SidebarWidth {
  /** Current width in px (clamped). */
  width: number
  /** Live update during a drag — clamps, sets state, does not persist. */
  setWidth: (w: number) => void
  /** Write the given width to the store — call once when the drag ends. */
  persist: (w: number) => void
  /** True once the stored width has been read; lets the caller suppress the
      width transition for that first correcting frame. */
  hydrated: boolean
}

export function useSidebarWidth(): SidebarWidth {
  const [width, setWidthState] = useState(SIDEBAR_DEFAULT_WIDTH)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(WIDTH_KEY)
      const parsed = raw === null ? NaN : Number(raw)
      if (Number.isFinite(parsed)) setWidthState(clampWidth(parsed))
    } catch {
      // keep the default width
    }
    setHydrated(true)
  }, [])

  const setWidth = useCallback((next: number) => {
    setWidthState(clampWidth(next))
  }, [])

  const persist = useCallback((next: number) => {
    try {
      window.localStorage.setItem(
        WIDTH_KEY,
        String(Math.round(clampWidth(next))),
      )
    } catch {
      // persisting is best-effort; the in-memory width still applies
    }
  }, [])

  return { width, setWidth, persist, hydrated }
}
