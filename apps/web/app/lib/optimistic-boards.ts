import { useEffect, useMemo, useSyncExternalStore } from "react"
import type { SidebarData } from "./dashboard.server.ts"
import { useStreamed } from "./use-streamed.ts"

/**
 * Boards the viewer just deleted, hidden from the rail client-side until the
 * server listing confirms them gone.
 *
 * A delete commits to GitHub, then {@link invalidateSidebarCache} drops the
 * SWR entry so the next rail load runs live (ADR-0030). But that live read
 * can still list the board we just removed: the rail's directory GET replays
 * its ETag, and GitHub's Contents API is eventually consistent after a write,
 * so for a beat it answers 304 and we serve the stale cached listing — which
 * then re-primes SWR for the whole TTL. (On a multi-instance deploy there's a
 * second path: the revalidation GET can hit a warm instance whose SWR cache
 * never saw the invalidation.) Either way the "your own action shows on the
 * very next load" promise breaks and the deleted board lingers until a manual
 * refresh lands after GitHub catches up.
 *
 * Rather than trust that re-read, we drop the board from the rendered rail the
 * moment the delete succeeds and reconcile it away once a resolved rail no
 * longer lists it. Module-level so it survives the remount/navigation a delete
 * triggers (deleting the active board leaves for `/`).
 */
const listeners = new Set<() => void>()
// Reassigned (fresh identity) on every change so useSyncExternalStore re-reads;
// SSR always sees the stable empty set (a delete only ever happens client-side).
let deleted = new Set<string>()
const empty = new Set<string>()

/** repo is `owner/name` and slug is kebab — neither carries a NUL, so this
    round-trips through {@link repoOf}. */
function key(repo: string, slug: string): string {
  return `${repo}\0${slug}`
}

function repoOf(entryKey: string): string {
  return entryKey.slice(0, entryKey.indexOf("\0"))
}

function emit(): void {
  for (const listener of listeners) listener()
}

/** Record a just-deleted board so the rail hides it until GitHub catches up. */
export function markBoardDeleted(repo: string, slug: string): void {
  if (deleted.has(key(repo, slug))) return
  deleted = new Set(deleted).add(key(repo, slug))
  emit()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): Set<string> {
  return deleted
}

/** Test-only: drop every pending deletion so cases don't leak across each
    other (the store is module-global, like the SWR/ETag caches). */
export function __resetOptimisticBoards(): void {
  deleted = new Set()
  emit()
}

function getServerSnapshot(): Set<string> {
  return empty
}

function withoutDeleted(data: SidebarData, pending: Set<string>): SidebarData {
  return {
    ...data,
    repos: data.repos.map((repo) => {
      const boards = repo.dashboards.filter(
        (board) => !pending.has(key(repo.repo, board.slug)),
      )
      // Keep the original identity when nothing was hidden so unaffected repo
      // groups don't churn downstream renders.
      return boards.length === repo.dashboards.length
        ? repo
        : { ...repo, dashboards: boards }
    }),
  }
}

/**
 * Once a resolved rail lists a board's repo group but not the board itself,
 * GitHub has caught up — forget the pending deletion so a board later recreated
 * with the same slug isn't hidden forever. A missing/degraded repo group is not
 * proof the board is gone, so those keys stay pending.
 */
function reconcile(data: SidebarData): void {
  if (deleted.size === 0) return
  const live = new Set<string>()
  const groups = new Set<string>()
  for (const repo of data.repos) {
    groups.add(repo.repo)
    for (const board of repo.dashboards) live.add(key(repo.repo, board.slug))
  }
  const next = new Set(deleted)
  for (const entryKey of deleted) {
    if (groups.has(repoOf(entryKey)) && !live.has(entryKey))
      next.delete(entryKey)
  }
  if (next.size !== deleted.size) {
    deleted = next
    emit()
  }
}

/**
 * Resolve the streamed sidebar (ADR-0030) with just-deleted boards filtered out
 * until the server listing confirms them gone. Drop-in for
 * {@link useStreamed}(source, "sidebar") at every rail consumer, so the optimism
 * stays consistent across the views that render the rail.
 */
export function useOptimisticSidebar(
  source: SidebarData | Promise<SidebarData>,
): SidebarData | null {
  const data = useStreamed(source, "sidebar")
  const pending = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  )

  useEffect(() => {
    if (data) reconcile(data)
  }, [data])

  return useMemo(
    () => (data && pending.size > 0 ? withoutDeleted(data, pending) : data),
    [data, pending],
  )
}
