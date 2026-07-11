import { useEffect, useState } from "react"
import { useNavigation } from "react-router"

/**
 * A thin accent line across the top of the viewport during a pending
 * navigation — the "not frozen" signal for the window where React Router
 * holds the current page inert while a loader runs (switching boards,
 * returning from settings). It trickles toward ~90% while the loader is in
 * flight, then snaps to 100% and fades on arrival.
 *
 * Navigation only — deliberately *not* revalidation. A background freshness
 * poll (use-poll-revalidate: tab focus, interval, post-run) refreshes loader
 * data while the page stays fully live, so a viewport-wide bar there is too
 * loud; the header SyncIndicator carries that beat instead.
 *
 * Terminal-calm: 2px, the brand accent, one faint glow — feedback, not
 * decoration. Honors prefers-reduced-motion (no trickle, no transition).
 */
export function RouteProgress() {
  const navigation = useNavigation()
  const active = navigation.state !== "idle"

  const [state, setState] = useState({ visible: false, width: 0 })

  useEffect(() => {
    const timers: number[] = []

    if (active) {
      const reduce = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches
      setState({ visible: true, width: reduce ? 90 : 8 })
      if (!reduce) {
        // Ease toward 90% and stop — the last 10% is reserved for arrival so
        // the bar never completes before the page actually does.
        timers.push(
          window.setInterval(() => {
            setState((s) =>
              s.width >= 90
                ? s
                : {
                    visible: true,
                    width: Math.min(
                      90,
                      s.width + Math.max(0.5, (90 - s.width) * 0.08),
                    ),
                  },
            )
          }, 200),
        )
      }
    } else {
      // Fill and fade — but only if a load was actually showing, so an idle
      // mount doesn't flash the bar.
      setState((s) => (s.visible ? { visible: true, width: 100 } : s))
      timers.push(
        window.setTimeout(() => setState({ visible: false, width: 0 }), 260),
      )
    }

    return () => {
      for (const t of timers) {
        window.clearInterval(t)
        window.clearTimeout(t)
      }
    }
  }, [active])

  if (!state.visible) return null

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5"
    >
      <div
        className="h-full bg-primary shadow-[0_0_6px_var(--palette-accent)] transition-[width,opacity] duration-200 ease-out motion-reduce:transition-none"
        style={{
          width: `${state.width}%`,
          opacity: state.width >= 100 ? 0 : 1,
        }}
      />
    </div>
  )
}
