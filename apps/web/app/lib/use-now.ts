import { useEffect, useState } from "react"

/**
 * A coarse clock for relative-time labels that must stay current without a
 * navigation — the rail's freshness ages (ADR-0035). Route loaders pass a
 * static `now`, fine for a page that reloads on navigation; the rail is
 * persistent chrome (`useStreamed`, ADR-0030), so its ages would freeze between
 * navigations without a tick of their own.
 *
 * Ticks every `intervalMs` (default a minute — the finest age unit the rail
 * shows). Seeds at mount time; the rail SSRs as a skeleton and fills
 * client-side (ADR-0030), so there's no server/client `Date.now()` mismatch to
 * reconcile.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}
