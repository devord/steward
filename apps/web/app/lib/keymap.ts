/**
 * The single-key accelerator layer (lazygit manners, no palette): bare keys
 * act on the current surface — `1`–`9` switch boards in rail order, `e`
 * toggles edit, `a` adds a routine, `s` opens sync when a draft exists, `r`
 * goes to the repo's routines, `?` opens the keymap sheet. Every function
 * stays reachable by pointer and Tab; keys are pure accelerators.
 *
 * Guards, in order: a preference can turn the whole layer off (WCAG 2.1.4 —
 * single-character shortcuts must be disableable; speech input can fire them
 * by accident); modifier chords pass through to the browser; typing surfaces
 * (inputs, textareas, selects, contenteditable) own their keys; and any open
 * layer (dialog, menu, listbox) owns the keyboard — the same layered-UI rule
 * Esc follows in edit mode.
 */
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react"

/** An open keyboard-owning layer anywhere in the document. Shared with the
    board's Esc handling so "a layer owns the keys" is one definition. */
export const OPEN_LAYER_SELECTOR =
  '[role="dialog"], [role="menu"], [role="listbox"]'

/** True when the event target is a surface the user types into. */
export function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('input, textarea, select, [contenteditable="true"]') != null
  )
}

/** Handlers keyed by `KeyboardEvent.key`. An absent key passes through. */
export type KeymapBindings = Partial<Record<string, () => void>>

/**
 * Register the layer for this surface. Bindings are read through a ref, so
 * the one listener survives re-renders; it detaches whenever the preference
 * turns the layer off.
 */
export function useKeymap(bindings: KeymapBindings): void {
  const [enabled] = useKeymapEnabled()
  const latest = useRef(bindings)
  latest.current = bindings

  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const handler = latest.current[event.key]
      if (handler == null) return
      if (isTypingTarget(event.target)) return
      if (document.querySelector(OPEN_LAYER_SELECTOR)) return
      event.preventDefault()
      handler()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [enabled])
}

/* ------------------------------------------------------------------------
 * The on/off preference — a device preference like appearance (ADR-0009):
 * localStorage + a custom event, mirrored by useSyncExternalStore so the
 * settings toggle and every mounted layer stay in sync across tabs.
 * ---------------------------------------------------------------------- */

export const KEYMAP_STORAGE_KEY = "steward-keymap"
const KEYMAP_EVENT = "steward:keymap"

// In-memory fallback so a failed localStorage write (private mode, quota)
// keeps the choice for this page's lifetime — same manners as appearance.
let memoryEnabled: boolean | null = null

function readStored(): boolean {
  try {
    if (typeof window === "undefined") return true
    const raw = window.localStorage.getItem(KEYMAP_STORAGE_KEY)
    if (raw == null) return memoryEnabled ?? true
    return raw !== "off"
  } catch {
    return memoryEnabled ?? true
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(KEYMAP_EVENT, onChange)
  window.addEventListener("storage", onChange)
  return () => {
    window.removeEventListener(KEYMAP_EVENT, onChange)
    window.removeEventListener("storage", onChange)
  }
}

export function setKeymapEnabled(enabled: boolean): void {
  memoryEnabled = enabled
  try {
    window.localStorage.setItem(KEYMAP_STORAGE_KEY, enabled ? "on" : "off")
  } catch {
    // private mode / quota: memoryEnabled keeps it for this page's lifetime
  }
  window.dispatchEvent(new Event(KEYMAP_EVENT))
}

/** The stored preference plus its setter — the settings page's pair. */
export function useKeymapEnabled(): [boolean, (enabled: boolean) => void] {
  const enabled = useSyncExternalStore(subscribe, readStored, () => true)
  const set = useCallback((next: boolean) => {
    setKeymapEnabled(next)
  }, [])
  return [enabled, set]
}
