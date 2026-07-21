/**
 * Collapsed widget bands — a device preference, not data (ADR-0009/0044).
 *
 * Collapsing "Engineering" collapses it on *every* board, because a category
 * describes what a widget is rather than where it sits: one click puts the
 * whole app in a PM view without inventing per-viewer access control, which
 * ADR-0001/0023 reserves entirely to GitHub repo permissions.
 *
 * A cookie rather than localStorage (where the theme lives) because the
 * server has to know before it renders: a board that paints expanded and
 * then collapses is the layout shift the collapse was meant to remove.
 * Same mechanism as the locale preference, for the same reason.
 */
const COLLAPSED_COOKIE = "steward_bands_collapsed"

/** A year, matching the locale cookie — a viewing mode should outlive a session. */
const COLLAPSED_MAX_AGE = 31_536_000

/**
 * Category names collapsed on this device. Unknown or malformed values
 * degrade to "nothing collapsed" — every band open is the honest floor, and
 * a stray cookie must never hide a widget.
 */
export function parseCollapsedBands(cookieHeader: string | null): string[] {
  const raw = (cookieHeader ?? "").match(
    new RegExp(`(?:^|;\\s*)${COLLAPSED_COOKIE}=([^;]*)`),
  )?.[1]
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(raw))
    if (!Array.isArray(parsed)) return []
    return parsed.filter((name): name is string => typeof name === "string")
  } catch {
    return []
  }
}

/** `Set-Cookie`/`document.cookie` value persisting the collapsed set. */
export function collapsedBandsCookie(names: readonly string[]): string {
  const value = encodeURIComponent(JSON.stringify([...new Set(names)]))
  return `${COLLAPSED_COOKIE}=${value}; Path=/; Max-Age=${COLLAPSED_MAX_AGE}; SameSite=Lax`
}

/** Persist a toggle from the client. No-op during SSR. */
export function writeCollapsedBands(names: readonly string[]): void {
  if (typeof document === "undefined") return
  document.cookie = collapsedBandsCookie(names)
}
