import { useEffect, useRef } from "react"
import { useRevalidator } from "react-router"

/**
 * Keep the board fresh without a manual reload: revalidate the loader on an
 * interval so a published artifact appears on its own. Cheap — every GitHub
 * GET is ETag-cached, so a no-change poll is all 304s that don't touch the
 * rate limit. Polls fast while a run is pending (the artifact is imminent),
 * slowly otherwise, and never while the tab is hidden; becoming visible
 * revalidates immediately so a backgrounded board catches up at once.
 */
const AMBIENT_MS = 120_000
const FAST_MS = 20_000

export function usePollRevalidate({ fast }: { fast: boolean }) {
  const revalidator = useRevalidator()
  // Read state/revalidate through a ref so the interval isn't torn down every
  // time the revalidator's state flips.
  const stateRef = useRef(revalidator.state)
  stateRef.current = revalidator.state
  const revalidate = revalidator.revalidate
  // When the last revalidation started. 0 → never: the first focus always
  // catches up, which is the case the visibility handler exists for.
  const lastRunRef = useRef(0)

  useEffect(() => {
    const interval = fast ? FAST_MS : AMBIENT_MS
    const tick = () => {
      // Skip while hidden (don't poll a backgrounded tab) or mid-flight.
      if (document.hidden || stateRef.current !== "idle") return
      lastRunRef.current = Date.now()
      void revalidate()
    }
    const id = window.setInterval(tick, interval)
    const onVisible = () => {
      if (document.hidden) return
      // Becoming visible catches a backgrounded board up at once — but only if
      // it is actually behind. Every revalidation re-runs the whole loader fan
      // -out (the board's artifacts and the rail's per-repo reads), so glancing
      // at another tab and back would otherwise fire that burst per flip, for
      // data that cannot have moved in the interim.
      if (Date.now() - lastRunRef.current < interval) return
      tick()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [fast, revalidate])
}
