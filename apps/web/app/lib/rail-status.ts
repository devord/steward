import { useEffect, useState } from "react"

import { DRAFT_EVENT, DRAFT_KEY_PREFIX } from "./draft.ts"
import {
  PENDING_RUN_EVENT,
  PENDING_RUN_KEY_PREFIX,
  PENDING_TIMEOUT_MS,
} from "./pending-runs.ts"

/**
 * What the rail can honestly say about boards it isn't viewing, read straight
 * from the client-local stores (Design Principle #2: sync state is
 * first-class UI). Two signals, each at the granularity it truly exists at:
 *
 *  - `drafts` — boardKeys (`<repo>:<slug>`, or the pool's
 *    `<repo>:__routines__`) with unsynced edits in localStorage (ADR-0003).
 *    Exactly per rail row, no server call.
 *  - `running` — repos with a client-fired run in flight (ADR-0016: no
 *    server-side run state, so "running" can only ever mean a run *this
 *    browser* fired). Runs belong to the repo's routine pool (ADR-0025), not
 *    to a board — the rail surfaces them on the pool row, never guesses a
 *    board.
 *
 * Staleness is deliberately absent: it would take artifact fetches for every
 * board, and the widget tiles already carry it.
 */
export interface RailStatus {
  drafts: ReadonlySet<string>
  running: ReadonlySet<string>
}

const EMPTY: RailStatus = { drafts: new Set(), running: new Set() }

function setsEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false
  for (const item of a) if (!b.has(item)) return false
  return true
}

/** One pass over localStorage. `expiresAt` is when the earliest in-flight
    run times out (the moment the scan's answer goes stale on its own),
    null when nothing is running. */
export function scanRailStatus(now: number): {
  status: RailStatus
  expiresAt: number | null
} {
  const drafts = new Set<string>()
  const running = new Set<string>()
  let expiresAt: number | null = null
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key == null) continue
    if (key.startsWith(DRAFT_KEY_PREFIX)) {
      drafts.add(key.slice(DRAFT_KEY_PREFIX.length))
    } else if (key.startsWith(PENDING_RUN_KEY_PREFIX)) {
      // `<repo>:<slug>` — the repo may contain "/" but never ":", and slugs
      // are kebab-case, so the last colon is the split.
      const rest = key.slice(PENDING_RUN_KEY_PREFIX.length)
      const repo = rest.slice(0, rest.lastIndexOf(":"))
      if (repo === "") continue
      let firedAt: number | null = null
      try {
        const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "")
        if (
          parsed &&
          typeof parsed === "object" &&
          "firedAt" in parsed &&
          typeof parsed.firedAt === "number"
        ) {
          firedAt = parsed.firedAt
        }
      } catch {
        // Unparseable mark: usePendingRuns owns removal; just don't count it.
      }
      if (firedAt == null) continue
      const expiry = firedAt + PENDING_TIMEOUT_MS
      // Expired marks are skipped, not removed — usePendingRuns owns the keys.
      if (expiry <= now) continue
      running.add(repo)
      expiresAt = expiresAt == null ? expiry : Math.min(expiresAt, expiry)
    }
  }
  return { status: { drafts, running }, expiresAt }
}

/**
 * Live rail status: scans on mount, re-scans on the draft / pending-run
 * change events (same document) and `storage` (other tabs), and wakes itself
 * when the earliest in-flight run would time out — a run mark must not
 * outlive its honesty just because nothing else happened to fire an event.
 * Empty until hydration (localStorage is client-only), so SSR and first
 * paint agree.
 */
export function useRailStatus(): RailStatus {
  const [status, setStatus] = useState<RailStatus>(EMPTY)

  useEffect(() => {
    let timer: number | undefined
    const rescan = () => {
      window.clearTimeout(timer)
      const next = scanRailStatus(Date.now())
      setStatus((prev) =>
        setsEqual(prev.drafts, next.status.drafts) &&
        setsEqual(prev.running, next.status.running)
          ? prev
          : next.status,
      )
      if (next.expiresAt != null) {
        timer = window.setTimeout(rescan, next.expiresAt - Date.now())
      }
    }
    rescan()
    window.addEventListener(DRAFT_EVENT, rescan)
    window.addEventListener(PENDING_RUN_EVENT, rescan)
    window.addEventListener("storage", rescan)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener(DRAFT_EVENT, rescan)
      window.removeEventListener(PENDING_RUN_EVENT, rescan)
      window.removeEventListener("storage", rescan)
    }
  }, [])

  return status
}
