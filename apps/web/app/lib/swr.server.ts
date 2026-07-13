import { createHash } from "node:crypto"

/**
 * Stale-while-revalidate cache for assembled loader data (ADR-0030). The
 * ETag store (github.server.ts) already makes repeat GitHub reads cheap for
 * the *rate limit*, but every revalidation is still a live round trip — the
 * latency stays. This layer sits above it: a hit serves the last assembled
 * value immediately and, once the entry is stale, refreshes it in the
 * background so the *next* read is current. Same per-warm-instance scope and
 * lifecycle as the ETag store; a cold start simply re-primes.
 *
 * What may live here is bounded by ADR-0030: discovery data whose staleness
 * is cosmetic (the rail, templates). Config file bodies and their blob SHAs
 * must never pass through — drafts and the sync conflict check (ADR-0003)
 * key off exactly what is on main right now.
 */
interface Entry {
  value: unknown
  /** Epoch ms after which a read triggers a background refresh. */
  staleAt: number
  /** Epoch ms after which the entry is unservable — treated as a miss, so a
      value whose refreshes keep failing can't be served forever. */
  expiresAt: number
  /** One background refresh at a time per entry. */
  refreshing: boolean
}

const cache = new Map<string, Entry>()
const MAX_ENTRIES = 500

/** Cache keys carry the viewer's token — hashed, never raw. */
export function tokenKey(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

function write(key: string, value: unknown, ttlMs: number, maxAgeMs: number) {
  cache.delete(key)
  cache.set(key, {
    value,
    staleAt: Date.now() + ttlMs,
    expiresAt: Date.now() + maxAgeMs,
    refreshing: false,
  })
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

/**
 * Serve `key` from the cache, refreshing in the background once the entry is
 * older than `ttlMs`; load live (and populate) on a miss. A failed background
 * refresh keeps the stale value — the next read retries — but only until
 * `maxAgeMs`, after which the entry is a miss and failures surface to the
 * caller again.
 */
export async function swr<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
  maxAgeMs = ttlMs * 10,
): Promise<T> {
  const entry = cache.get(key)
  if (entry && entry.expiresAt > Date.now()) {
    // Re-insert to mark most-recently-used (Map preserves insertion order).
    cache.delete(key)
    cache.set(key, entry)
    if (entry.staleAt <= Date.now() && !entry.refreshing) {
      entry.refreshing = true
      void load().then(
        (value) => write(key, value, ttlMs, maxAgeMs),
        () => {
          entry.refreshing = false
        },
      )
    }
    // The entry under a key is only ever written by that key's own load(),
    // so the stored unknown is the caller's T — an invariant the type system
    // can't carry through a shared heterogeneous map.
    // oxlint-disable-next-line typescript/consistent-type-assertions
    return entry.value as T
  }
  const value = await load()
  write(key, value, ttlMs, maxAgeMs)
  return value
}

/**
 * Drop every entry whose key starts with `prefix` — how mutations keep the
 * cache honest (create/delete a board, register/rename a repo). Prefixes are
 * namespaced per feature and per token: see the SIDEBAR/TEMPLATES key
 * builders in dashboard.server.ts / templates.server.ts.
 */
export function invalidateSwr(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key)
  }
}

/** Test-only: drop the whole store so cases don't leak entries. */
export function __resetSwr(): void {
  cache.clear()
}
