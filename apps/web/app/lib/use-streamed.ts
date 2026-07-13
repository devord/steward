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
const isClient = typeof document !== "undefined"

function seed<T>(key: string): T | null {
  if (!isClient) return null
  // A key's held value is only ever written by that key's own promise, so
  // the stored unknown is the caller's T — an invariant the type system
  // can't carry through a shared heterogeneous map.
  // oxlint-disable-next-line typescript/consistent-type-assertions
  return (held.get(key) as T | undefined) ?? null
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
        held.set(key, value)
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
