/**
 * Live appearance state for React — a tiny external store over the
 * localStorage preference plus the OS `prefers-color-scheme` state.
 *
 * `useResolvedTheme()` is the read most components want (the widget cards
 * re-render their artifact injection off it). `useAppearance()` adds the
 * setter for the settings page. Writes stamp the document immediately
 * (attribute + `.dark` class — the same two things THEME_INIT_SCRIPT does
 * pre-paint) and notify subscribers via a custom event, so every tab and
 * every subscriber stays in sync.
 *
 * Server snapshots return the defaults; the client snapshot may differ, and
 * useSyncExternalStore re-renders once right after hydration — that single
 * pass is what swaps a non-default theme into the widget iframes.
 */
import { useCallback, useSyncExternalStore } from "react"

import {
  APPEARANCE_EVENT,
  APPEARANCE_STORAGE_KEY,
  type AppearancePrefs,
  coercePrefs,
  DEFAULT_APPEARANCE,
  DEFAULT_THEME,
  resolveTheme,
  type ThemeName,
  themes,
} from "./theme.ts"

function systemPrefersDark(): boolean {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return true
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
}

// In-memory fallback so a failed localStorage write (private mode, quota)
// still keeps the chosen preference for this page's lifetime instead of
// snapping subscribers back to the defaults on the next read.
let memoryPrefs: AppearancePrefs | null = null

/** Read + coerce the stored preference; tolerates SSR and private mode. */
export function getStoredPrefs(): AppearancePrefs {
  try {
    if (typeof window === "undefined") return DEFAULT_APPEARANCE
    const raw = window.localStorage.getItem(APPEARANCE_STORAGE_KEY)
    return raw
      ? coercePrefs(JSON.parse(raw))
      : (memoryPrefs ?? DEFAULT_APPEARANCE)
  } catch {
    return memoryPrefs ?? DEFAULT_APPEARANCE
  }
}

// Snapshot caches: useSyncExternalStore needs referentially stable values
// between notifications, and the prefs snapshot is an object.
let prefsCache: AppearancePrefs | null = null
let resolvedCache: ThemeName | null = null

function invalidate(): void {
  prefsCache = null
  resolvedCache = null
}

function getPrefsSnapshot(): AppearancePrefs {
  prefsCache ??= getStoredPrefs()
  return prefsCache
}

function getResolvedSnapshot(): ThemeName {
  resolvedCache ??= resolveTheme(getPrefsSnapshot(), systemPrefersDark())
  return resolvedCache
}

function subscribe(onChange: () => void): () => void {
  const notify = () => {
    invalidate()
    // Externally observed changes (another tab's storage write, an OS
    // appearance flip under system mode) must reach the document too —
    // React snapshots alone would leave <html data-theme> stale.
    applyToDocument(getStoredPrefs())
    onChange()
  }
  window.addEventListener(APPEARANCE_EVENT, notify)
  window.addEventListener("storage", notify)
  const mq =
    typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: dark)")
      : null
  mq?.addEventListener("change", notify)
  return () => {
    window.removeEventListener(APPEARANCE_EVENT, notify)
    window.removeEventListener("storage", notify)
    mq?.removeEventListener("change", notify)
  }
}

/** Stamp the document the way THEME_INIT_SCRIPT does, post-change. */
function applyToDocument(prefs: AppearancePrefs): void {
  if (typeof document === "undefined") return
  const resolved = resolveTheme(prefs, systemPrefersDark())
  document.documentElement.setAttribute("data-theme", resolved)
  document.documentElement.classList.toggle(
    "dark",
    themes[resolved].mode === "dark",
  )
}

/** Merge a partial change into the stored preference, persist, and apply. */
export function updateAppearance(
  patch: Partial<AppearancePrefs>,
): AppearancePrefs {
  const next = coercePrefs({ ...getStoredPrefs(), ...patch })
  memoryPrefs = next
  try {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // private mode / quota: memoryPrefs keeps it for this page's lifetime
  }
  applyToDocument(next)
  invalidate()
  window.dispatchEvent(new Event(APPEARANCE_EVENT))
  return next
}

/** The currently active theme name (default on the server). */
export function useResolvedTheme(): ThemeName {
  return useSyncExternalStore(
    subscribe,
    getResolvedSnapshot,
    () => DEFAULT_THEME,
  )
}

/** The stored preference plus its setter — the settings page's pair. */
export function useAppearance(): [
  AppearancePrefs,
  (patch: Partial<AppearancePrefs>) => void,
] {
  const prefs = useSyncExternalStore(
    subscribe,
    getPrefsSnapshot,
    () => DEFAULT_APPEARANCE,
  )
  const update = useCallback((patch: Partial<AppearancePrefs>) => {
    updateAppearance(patch)
  }, [])
  return [prefs, update]
}
