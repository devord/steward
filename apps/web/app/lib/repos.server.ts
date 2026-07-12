import { createHash } from "node:crypto"

import { data } from "react-router"

import type { DataRepo } from "./repos.ts"
import { env } from "./env.server.ts"
import {
  getRepoMeta,
  getRepoTopics,
  GitHubError,
  type RepoMeta,
  searchReposByTopic,
} from "./github.server.ts"
import { parseRepo } from "./repos.ts"

/**
 * The data-repo registry (ADR-0023). There is no stored list anywhere: the
 * viewer's repos are whatever the topic search returns for their token,
 * unioned with the conventional home repo. GitHub's own visibility rules are
 * the entire access model — a repo appears when someone grants you read
 * access, disappears when they revoke it.
 */

export interface RepoListing {
  repos: DataRepo[]
  /** false → the search degraded (rate limit, outage): `repos` may be
      missing shared repos. The rail renders a quiet notice, never an error. */
  complete: boolean
}

/** The viewer's home repo — naming convention, or the session override. */
export function resolveHomeRepo(login: string, override?: string): string {
  return override ?? `${login}/${env().BULLETIN_DATA_REPO_PREFIX}${login}`
}

/**
 * Search results are cached briefly per token: the search API has its own
 * 30 req/min quota and every page load would otherwise spend one. 60s is
 * short enough that a newly shared repo appears on the next natural reload,
 * and create/register flows call invalidateRepoCache for instant liveness.
 */
interface CacheEntry {
  listing: RepoListing
  expiresAt: number
}

const TTL_MS = 60_000
const MAX_ENTRIES = 200
const cache = new Map<string, CacheEntry>()

function cacheKey(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export function invalidateRepoCache(token: string): void {
  cache.delete(cacheKey(token))
}

/** Test-only: drop the registry cache so cases don't leak listings. */
export function __resetRepoCache(): void {
  cache.clear()
}

function toDataRepo(meta: RepoMeta, home: string): DataRepo | null {
  const ref = parseRepo(meta.full)
  if (!ref) return null
  return {
    ...ref,
    isHome: meta.full === home,
    private: meta.private,
    isShared: meta.full !== home,
    viewerIsAdmin: meta.permissions?.admin ?? null,
  }
}

/**
 * Every data repo the viewer can see: topic search ∪ {home repo}. The union
 * covers the two ways search alone would lie — index lag on a repo tagged
 * seconds ago, and home repos created before topic support. A dead token
 * (401) re-throws so loaders surface the re-auth page; every other failure
 * degrades to the home repo with `complete: false`.
 */
export async function listDataRepos(
  token: string,
  login: string,
  override?: string,
): Promise<RepoListing> {
  const key = cacheKey(token)
  const cached = cache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.listing

  const home = resolveHomeRepo(login, override)
  const [searched, homeMeta] = await Promise.allSettled([
    searchReposByTopic(token, env().DATA_REPO_TOPIC),
    getRepoMeta(token, home),
  ])

  // A revoked token 401s on everything — degrading would render an empty
  // rail forever instead of the re-auth page the session degrade paths show.
  for (const result of [searched, homeMeta]) {
    if (
      result.status === "rejected" &&
      result.reason instanceof GitHubError &&
      result.reason.status === 401
    ) {
      throw result.reason
    }
  }

  const repos = new Map<string, DataRepo>()
  if (homeMeta.status === "fulfilled") {
    // null → the home repo doesn't exist yet (pre-setup): omit it, the
    // routes' existing repo-missing checks own that redirect.
    if (homeMeta.value) {
      const repo = toDataRepo(homeMeta.value, home)
      if (repo) repos.set(repo.full, repo)
    }
  } else {
    // Transient failure probing home: keep it, with unknown metadata — the
    // viewer's own repo not appearing in the rail is worse than a bare row.
    const ref = parseRepo(home)
    if (ref) {
      repos.set(ref.full, {
        ...ref,
        isHome: true,
        private: null,
        isShared: false,
        viewerIsAdmin: null,
      })
    }
  }
  if (searched.status === "fulfilled") {
    for (const meta of searched.value) {
      if (repos.has(meta.full)) continue
      const repo = toDataRepo(meta, home)
      if (repo) repos.set(repo.full, repo)
    }
  }

  const listing: RepoListing = {
    repos: [...repos.values()].sort((a, b) =>
      a.isHome !== b.isHome
        ? Number(b.isHome) - Number(a.isHome)
        : a.full.localeCompare(b.full),
    ),
    complete:
      searched.status === "fulfilled" && homeMeta.status === "fulfilled",
  }

  cache.set(key, { listing, expiresAt: Date.now() + TTL_MS })
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
  return listing
}

/**
 * Server-side gate for any action or loader that takes a repo from the
 * client: the repo must be in the viewer's discovered set — or, covering
 * search-index lag, be live-verifiably a tagged data repo (readable AND
 * carrying the topic, or the conventional home repo). Everything after this
 * gate still runs on the viewer's token, so a forged name can never reach
 * data the token couldn't already read; the gate keeps non-data repos out of
 * the product surface. Throws 404 — indistinguishable from "no such repo",
 * by design.
 */
export async function requireDataRepo(
  token: string,
  login: string,
  repoFull: string,
  override?: string,
): Promise<DataRepo> {
  const ref = parseRepo(repoFull)
  if (!ref) throw data("Not a data repo.", { status: 404 })

  const listing = await listDataRepos(token, login, override)
  const known = listing.repos.find((repo) => repo.full === ref.full)
  if (known) return known

  const home = resolveHomeRepo(login, override)
  const meta = await getRepoMeta(token, ref.full)
  if (!meta) throw data("Not a data repo.", { status: 404 })
  if (ref.full !== home) {
    const topics = await getRepoTopics(token, ref.full)
    if (!topics?.includes(env().DATA_REPO_TOPIC)) {
      throw data("Not a data repo.", { status: 404 })
    }
  }
  // Freshly visible (created/registered inside the cache window): drop the
  // stale listing so the rail picks it up on the next load.
  invalidateRepoCache(token)
  const repo = toDataRepo(meta, home)
  if (!repo) throw data("Not a data repo.", { status: 404 })
  return repo
}
