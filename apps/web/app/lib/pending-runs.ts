import { useCallback, useEffect, useState } from "react"

import type { ArtifactInfo } from "./dashboard.server.ts"

/**
 * A fired run has no server-side state to poll (ADR-0016: the server holds no
 * secret and just fires). So the client remembers, per routine, when it fired
 * a run — surviving reloads via localStorage — and clears the mark once a
 * newer artifact publishes or the wait times out. That drives the tile's
 * "running" spinner and disables re-firing inside the window.
 */
const PENDING_TIMEOUT_MS = 10 * 60_000
/** A publish just before the fire (clock skew between client and GitHub)
    shouldn't clear the mark; require the artifact to be meaningfully newer. */
const CLOCK_SKEW_MS = 60_000

const PREFIX = "bulletin:pending-run:"

function storageKey(dataRepo: string, slug: string): string {
  return `${PREFIX}${dataRepo}:${slug}`
}

/**
 * Which pending runs to clear given the freshly loaded artifacts: one whose
 * artifact published after it fired (past the skew guard), or one that has
 * waited past the timeout. Pure, so the decision is unit-testable.
 */
export function pendingToClear(
  pending: Record<string, number>,
  artifacts: Record<string, ArtifactInfo>,
  now: number,
): string[] {
  const clear: string[] = []
  for (const [slug, firedAt] of Object.entries(pending)) {
    const lastRunAt = artifacts[slug]?.lastRunAt
    const published =
      lastRunAt != null && Date.parse(lastRunAt) > firedAt - CLOCK_SKEW_MS
    const timedOut = now - firedAt >= PENDING_TIMEOUT_MS
    if (published || timedOut) clear.push(slug)
  }
  return clear
}

export function usePendingRuns(dataRepo: string) {
  const [pending, setPending] = useState<Record<string, number>>({})

  // Hydrate from localStorage (client-only), pruning entries past the timeout.
  useEffect(() => {
    const now = Date.now()
    const next: Record<string, number> = {}
    const prefix = `${PREFIX}${dataRepo}:`
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(prefix)) keys.push(k)
    }
    for (const k of keys) {
      const slug = k.slice(prefix.length)
      let firedAt: number | undefined
      try {
        const raw = localStorage.getItem(k)
        const parsed: unknown = raw ? JSON.parse(raw) : null
        if (
          parsed &&
          typeof parsed === "object" &&
          "firedAt" in parsed &&
          typeof parsed.firedAt === "number"
        ) {
          firedAt = parsed.firedAt
        }
      } catch {
        firedAt = undefined
      }
      if (firedAt != null && now - firedAt < PENDING_TIMEOUT_MS) {
        next[slug] = firedAt
      } else {
        localStorage.removeItem(k)
      }
    }
    setPending(next)
  }, [dataRepo])

  const markFired = useCallback(
    (slug: string) => {
      const firedAt = Date.now()
      localStorage.setItem(
        storageKey(dataRepo, slug),
        JSON.stringify({ firedAt }),
      )
      setPending((prev) => ({ ...prev, [slug]: firedAt }))
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
