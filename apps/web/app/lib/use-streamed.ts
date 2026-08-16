import { useEffect, useState } from "react"

/**
 * Last resolved value per key, so a remount (board switches remount the whole
 * board by key) re-seeds instantly instead of flashing back to a skeleton.
 * Client only: module state on the server is shared across users' requests,
 * so reading it during SSR would leak one viewer's data into another's HTML.
 * SSR therefore always renders the null (skeleton) state — matching the
 * client's first hydration render, where this map is still empty.
 */
const held = new Map<string, unknown>()
const isClient = "document" in globalThis

/**
 * Per-namespace cap (the key segment before the first `:`), LRU by last read
 * or write. Chrome values — the rail, a repo's templates, its placements —
 * are small and few, so they stay uncapped: evicting the rail after a dozen
 * board visits would reintroduce the very flash this store exists to stop.
 * Artifact maps carry every widget's full HTML, so their namespace is bounded
 * to the handful of boards someone actually moves between, not a history.
 */
const LIMITS = new Map<string, number>([["artifacts", 4]])

function evict(key: string): void {
  const colon = key.indexOf(":")
  if (colon < 0) return
  const namespace = key.slice(0, colon)
  const limit = LIMITS.get(namespace)
  if (limit === undefined) return
  const mine = [...held.keys()].filter((k) => k.startsWith(`${namespace}:`))
  // Map preserves insertion order and both read and write re-insert, so the
  // front of this list is the coldest.
  for (const stale of mine.slice(0, Math.max(0, mine.length - limit))) {
    held.delete(stale)
  }
}

/**
 * The last value resolved under `key`, or null. Re-inserts to mark it
 * most-recently-used, so alternating between two boards never evicts either.
 */
export function readHeld<T>(key: string): T | null {
  if (!isClient || !held.has(key)) return null
  const value = held.get(key)
  held.delete(key)
  held.set(key, value)
  // SAFETY: a key's held value is only ever written by that key's own
  // promise, so the stored value is the caller's T — an invariant the type
  // system cannot carry through a shared heterogeneous map.
  // oxlint-disable-next-line typescript/consistent-type-assertions
  return (value as T | undefined) ?? null
}

/** Record `key`'s freshly resolved value, dropping its namespace's coldest
    entries past the cap. */
export function writeHeld<T>(key: string, value: T): void {
  if (!isClient) return
  held.delete(key)
  held.set(key, value)
  evict(key)
}

/** Test-only: drop the whole store so cases don't leak held values. */
export function __resetHeld(): void {
  held.clear()
}

function seed<T>(key: string): T | null {
  return readHeld<T>(key)
}

/**
 * Resolve a streamed loader value (ADR-0030) into state, holding the last
 * resolved value across revalidations and remounts: a poll or navigation
 * hands the component a *fresh* promise, and rendering it through <Await>
 * would re-suspend chrome that was already on screen. Returns null only
 * before the first resolution ever — the caller renders its skeleton there.
 *
 * A rejected promise (the server aborts streams still pending at
 * streamTimeout) keeps the last value on screen; the next revalidation
 * retries with a fresh promise.
 */
export function useStreamed<T>(source: T | Promise<T>, key: string): T | null {
  const [state, setState] = useState<{ key: string; value: T | null }>(() => ({
    key,
    value: seed<T>(key),
  }))
  // Key changed mid-life (e.g. templates when the board's repo changes):
  // re-seed synchronously so the old repo's value never renders under the
  // new key.
  if (state.key !== key) setState({ key, value: seed<T>(key) })

  useEffect(() => {
    let alive = true
    void Promise.resolve(source).then(
      (value) => {
        writeHeld(key, value)
        if (alive) setState({ key, value })
      },
      () => {},
    )
    return () => {
      alive = false
    }
  }, [source, key])

  return state.key === key ? state.value : seed<T>(key)
}
