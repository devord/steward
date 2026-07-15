import { useCallback, useEffect, useState } from "react"

import type { ArtifactInfo } from "./dashboard.server.ts"

/**
 * A fired run has no server-side state to poll (ADR-0016: the server holds no
 * secret and just fires). So the client remembers, per routine, the run it
 * fired — surviving reloads via localStorage — and clears the mark once a new
 * artifact publishes or the wait times out. That drives the tile's "running"
 * spinner and disables re-firing inside the window.
 *
 * Freshness keys off the artifact's blob SHA, not its last-commit date: the
 * SHA comes from the contents API and tracks the branch tip immediately, while
 * the commits-list date lags behind a fresh push — which used to leave a tile
 * spinning "Running" long after its artifact had already updated. We record
 * the SHA on file at fire time and clear once the loaded SHA differs from it.
 */
export const PENDING_TIMEOUT_MS = 30 * 60_000

/** localStorage key prefix for in-flight run marks — the rail scans it
    (rail-status.ts) to mark repos with a run in flight. */
export const PENDING_RUN_KEY_PREFIX = "steward:pending-run:"

/** Fired on every pending-run write/remove so same-document observers (the
    rail) can re-scan; `storage` events only reach *other* tabs. */
export const PENDING_RUN_EVENT = "steward:pending-run-change"

function notifyPendingRunChange() {
  // Deferred: writes happen inside React state updaters, and a synchronous
  // dispatch there would set listeners' state mid-render.
  queueMicrotask(() => window.dispatchEvent(new Event(PENDING_RUN_EVENT)))
}

/** What we remember about an in-flight run: when it fired and the artifact
    SHA at that moment (null → nothing published yet), so a later load can tell
    "the artifact changed" from "still the one that was there when we fired". */
export interface PendingRun {
  firedAt: number
  sha: string | null
}

function storageKey(dataRepo: string, slug: string): string {
  return `${PENDING_RUN_KEY_PREFIX}${dataRepo}:${slug}`
}

/**
 * Which pending runs to clear given the freshly loaded artifacts: one whose
 * artifact SHA has changed from what it was when the run fired (the publish
 * landed), or one that has waited past the timeout. Pure, so the decision is
 * unit-testable.
 */
export function pendingToClear(
  pending: Record<string, PendingRun>,
  artifacts: Record<string, ArtifactInfo>,
  now: number,
): string[] {
  const clear: string[] = []
  for (const [slug, run] of Object.entries(pending)) {
    const info = artifacts[slug]
    // A SHA that differs from the one on file means the artifact changed since
    // the fire — including the first-ever publish (baseline null → a real SHA).
    // Skip an unreachable read (GitHub flap): its null SHA isn't a real change,
    // so it mustn't clear a run that's still in flight — let the timeout decide.
    const published = info != null && !info.unreachable && info.sha !== run.sha
    const timedOut = now - run.firedAt >= PENDING_TIMEOUT_MS
    if (published || timedOut) clear.push(slug)
  }
  return clear
}

export function usePendingRuns(dataRepo: string) {
  const [pending, setPending] = useState<Record<string, PendingRun>>({})

  // Hydrate from localStorage (client-only), pruning entries past the timeout.
  useEffect(() => {
    const now = Date.now()
    const next: Record<string, PendingRun> = {}
    const prefix = `${PENDING_RUN_KEY_PREFIX}${dataRepo}:`
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(prefix)) keys.push(k)
    }
    for (const k of keys) {
      const slug = k.slice(prefix.length)
      let run: PendingRun | undefined
      try {
        const raw = localStorage.getItem(k)
        const parsed: unknown = raw ? JSON.parse(raw) : null
        if (
          parsed &&
          typeof parsed === "object" &&
          "firedAt" in parsed &&
          typeof parsed.firedAt === "number"
        ) {
          // Marks written before SHA tracking carry no `sha`; treat that as a
          // null baseline (any published artifact then reads as "changed").
          const sha =
            "sha" in parsed && typeof parsed.sha === "string"
              ? parsed.sha
              : null
          run = { firedAt: parsed.firedAt, sha }
        }
      } catch {
        run = undefined
      }
      if (run != null && now - run.firedAt < PENDING_TIMEOUT_MS) {
        next[slug] = run
      } else {
        localStorage.removeItem(k)
        notifyPendingRunChange()
      }
    }
    setPending(next)
  }, [dataRepo])

  const markFired = useCallback(
    (slug: string, sha: string | null) => {
      const run: PendingRun = { firedAt: Date.now(), sha }
      localStorage.setItem(storageKey(dataRepo, slug), JSON.stringify(run))
      notifyPendingRunChange()
      setPending((prev) => ({ ...prev, [slug]: run }))
    },
    [dataRepo],
  )

  const resolveAgainst = useCallback(
    (artifacts: Record<string, ArtifactInfo>) => {
      setPending((prev) => {
        const clear = pendingToClear(prev, artifacts, Date.now())
        if (clear.length === 0) return prev
        const next = { ...prev }
        for (const slug of clear) {
          delete next[slug]
          localStorage.removeItem(storageKey(dataRepo, slug))
        }
        notifyPendingRunChange()
        return next
      })
    },
    [dataRepo],
  )

  return {
    pending,
    markFired,
    resolveAgainst,
    anyPending: Object.keys(pending).length > 0,
  }
}
