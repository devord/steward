import { useEffect, useRef, useState } from "react"
import { useRevalidator } from "react-router"

/**
 * A whisper-quiet dot in the header that marks a *background* refresh — the
 * freshness poll in use-poll-revalidate (tab focus, interval, or the
 * revalidation that trails a manual run). Navigations drive the top
 * RouteProgress bar instead; this dot is only for the live-page revalidation
 * where nothing is held inert, so a viewport-wide bar would be too loud (it
 * used to flash on every tab focus).
 *
 * Chrome-monochrome and near-invisible when idle: it fades in when a
 * revalidation starts, lingers briefly so a sub-second 304 poll still reads
 * as a deliberate blink rather than a flicker, then fades out. The slot is
 * reserved (opacity, not mount) so the header never shifts. aria-hidden — a
 * poll on every focus must not spam a screen reader; the per-widget freshness
 * readouts carry the honest, announced state.
 *
 * Honors prefers-reduced-motion: no fade, and no linger.
 */
export function SyncIndicator() {
  const revalidator = useRevalidator()
  const syncing = revalidator.state !== "idle"
  const [visible, setVisible] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    window.clearTimeout(timer.current)
    if (syncing) {
      setVisible(true)
    } else if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(false)
    } else {
      timer.current = window.setTimeout(() => setVisible(false), 400)
    }
    return () => window.clearTimeout(timer.current)
  }, [syncing])

  return (
    <span
      aria-hidden
      className="size-1.5 shrink-0 rounded-full bg-ink-dim transition-opacity duration-200 ease-out motion-reduce:transition-none"
      style={{ opacity: visible ? 1 : 0 }}
    />
  )
}
