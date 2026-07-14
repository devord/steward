import { useCallback, useRef, useState } from "react"

import type { VersionState } from "../components/artifact-version-dialog.tsx"

/**
 * Lazy cache of a routine's past artifact renders, keyed by commit SHA. The
 * runs view lists the receipts up front (ADR-0033); a body is fetched only
 * when the viewer opens that run or picks it to compare, through the
 * `r/:owner/:repo/routines/:slug/at/:sha` resource route. Each SHA is fetched
 * at most once and kept, so reopening — or the two panes of a compare — is
 * instant; a failed fetch is dropped from the in-flight set so a later open
 * retries. `urlFor` must be stable (memoize per repo + slug).
 */
export function useArtifactVersions(urlFor: (sha: string) => string): {
  load: (sha: string) => void
  stateFor: (sha: string) => VersionState
} {
  const [cache, setCache] = useState<Record<string, VersionState>>({})
  // Dedupe live and settled-ok fetches without racing on the async setState —
  // the fetch fires outside the state updater, so the guard can't live there.
  const requested = useRef<Set<string>>(new Set())

  const load = useCallback(
    (sha: string) => {
      if (requested.current.has(sha)) return
      requested.current.add(sha)
      setCache((prev) => ({ ...prev, [sha]: { status: "loading" } }))
      fetch(urlFor(sha), { headers: { Accept: "application/json" } })
        .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
        .then((body: { html?: string | null; unreachable?: boolean }) =>
          setCache((prev) => ({
            ...prev,
            [sha]: body.unreachable
              ? { status: "error" }
              : { status: "ok", html: body.html ?? null },
          })),
        )
        .catch(() => {
          // Let a reopen try again — the flake is usually transient.
          requested.current.delete(sha)
          setCache((prev) => ({ ...prev, [sha]: { status: "error" } }))
        })
    },
    [urlFor],
  )

  const stateFor = useCallback(
    (sha: string): VersionState => cache[sha] ?? { status: "loading" },
    [cache],
  )

  return { load, stateFor }
}
