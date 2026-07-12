import { beforeEach, describe, expect, it } from "vitest"

import {
  failPath,
  failSearch,
  seedRepo,
  seedRepoMeta,
} from "../mocks/github.ts"
import { GitHubError } from "./github.server.ts"
import {
  __resetRepoCache,
  invalidateRepoCache,
  listDataRepos,
  requireDataRepo,
} from "./repos.server.ts"

const LOGIN = "daniel"
// STEWARD_DATA_REPO_PREFIX default; the rename PR sweeps this with it.
const HOME = "daniel/steward-data-daniel"
const TOPIC = "steward-data"

beforeEach(() => __resetRepoCache())

describe("listDataRepos", () => {
  it("unions topic search with the conventional home repo, home first", async () => {
    // Home predates topic support — no topic, still discovered by convention.
    seedRepo(HOME, {})
    seedRepoMeta("acme/team-data", { topics: [TOPIC], private: true })
    seedRepoMeta("zed/lab-data", { topics: [TOPIC], private: false })

    const listing = await listDataRepos("token", LOGIN)

    expect(listing.complete).toBe(true)
    expect(listing.repos.map((repo) => repo.full)).toEqual([
      HOME,
      "acme/team-data",
      "zed/lab-data",
    ])
    expect(listing.repos[0]).toMatchObject({ isHome: true, isShared: false })
    expect(listing.repos[1]).toMatchObject({ isHome: false, isShared: true })
    expect(listing.repos[2].private).toBe(false)
  })

  it("excludes a stranger's public topic-tagged repo (injection guard)", async () => {
    // The topic search returns every public repo carrying the tag; a repo
    // the viewer wasn't granted (public, not owned, no push) must not land
    // in the rail — otherwise anyone could inject a group into every user.
    seedRepo(HOME, {})
    seedRepoMeta("stranger/evil-data", {
      topics: [TOPIC],
      private: false,
      permissions: null,
    })

    const listing = await listDataRepos("token", LOGIN)

    expect(listing.repos.map((repo) => repo.full)).toEqual([HOME])
  })

  it("includes a public repo the viewer has push access to (real grant)", async () => {
    // Push access on a public repo is a deliberate collaborator/org grant,
    // not mere public read — that repo belongs in the rail.
    seedRepo(HOME, {})
    seedRepoMeta("acme/shared-public", {
      topics: [TOPIC],
      private: false,
      permissions: { admin: false, push: true },
    })

    const listing = await listDataRepos("token", LOGIN)

    expect(listing.repos.map((repo) => repo.full)).toContain(
      "acme/shared-public",
    )
  })

  it("dedupes a home repo that also carries the topic", async () => {
    seedRepoMeta(HOME, { topics: [TOPIC] })

    const listing = await listDataRepos("token", LOGIN)

    expect(listing.repos).toHaveLength(1)
    expect(listing.repos[0]).toMatchObject({ full: HOME, isHome: true })
  })

  it("respects the session override as the home repo", async () => {
    seedRepo("daniel/custom-data", {})

    const listing = await listDataRepos("token", LOGIN, "daniel/custom-data")

    expect(listing.repos.map((repo) => repo.full)).toEqual([
      "daniel/custom-data",
    ])
    expect(listing.repos[0].isHome).toBe(true)
  })

  it("degrades to the home repo when search fails, flagged incomplete", async () => {
    // A rate-limited search must not blank the rail — the viewer's own
    // repo stays, with a "may be missing shared repos" flag for the UI.
    seedRepo(HOME, {})
    failSearch({ status: 403 })

    const listing = await listDataRepos("token", LOGIN)

    expect(listing.repos.map((repo) => repo.full)).toEqual([HOME])
    expect(listing.complete).toBe(false)
  })

  it("keeps the home repo with unknown metadata when its probe flaps", async () => {
    seedRepo(HOME, {})
    failPath(HOME, "", { status: 503, endpoint: "repo" })

    const listing = await listDataRepos("token", LOGIN)

    expect(listing.repos[0]).toMatchObject({
      full: HOME,
      isHome: true,
      private: null,
      viewerIsAdmin: null,
    })
    expect(listing.complete).toBe(false)
  })

  it("omits a home repo that doesn't exist yet (pre-setup)", async () => {
    // No repos seeded at all: nothing to list, but no crash either — the
    // routes' repo-missing checks own the /setup redirect.
    const listing = await listDataRepos("token", LOGIN)
    expect(listing.repos).toEqual([])
  })

  it("re-throws a dead token instead of degrading to an empty rail", async () => {
    // A revoked token 401s forever; degrading would hide the re-auth page.
    seedRepo(HOME, {})
    failSearch({ status: 401 })

    const error = await listDataRepos("token", LOGIN).catch((e) => e)
    expect(error).toBeInstanceOf(GitHubError)
    expect((error as GitHubError).status).toBe(401)
  })

  it("caches per token until invalidated", async () => {
    seedRepo(HOME, {})
    const first = await listDataRepos("token", LOGIN)
    expect(first.repos).toHaveLength(1)

    // Tagged inside the cache window: the stale listing keeps serving...
    seedRepoMeta("acme/team-data", { topics: [TOPIC] })
    const cached = await listDataRepos("token", LOGIN)
    expect(cached.repos).toHaveLength(1)

    // ...until create/register invalidates, then the repo appears at once.
    invalidateRepoCache("token")
    const fresh = await listDataRepos("token", LOGIN)
    expect(fresh.repos.map((repo) => repo.full)).toContain("acme/team-data")
  })
})

describe("requireDataRepo", () => {
  it("returns a repo from the discovered set", async () => {
    seedRepoMeta("acme/team-data", { topics: [TOPIC] })

    const repo = await requireDataRepo("token", LOGIN, "acme/team-data")
    expect(repo).toMatchObject({ full: "acme/team-data", isShared: true })
  })

  it("accepts a tagged repo search hasn't indexed yet (lag fallback)", async () => {
    // Prime the cache while the repo is unknown — models search-index lag.
    seedRepo(HOME, {})
    await listDataRepos("token", LOGIN)
    seedRepoMeta("acme/just-shared", { topics: [TOPIC] })

    // The live check verifies and admits it even though the cached listing
    // (and the search index) don't know it yet.
    const repo = await requireDataRepo("token", LOGIN, "acme/just-shared")
    expect(repo.full).toBe("acme/just-shared")
  })

  it("does not invalidate the cache on the lag fallback (no quota burn)", async () => {
    // A repo lagging the search index would otherwise defeat the 60s cache
    // on every page view — the live check must NOT drop the cached listing.
    seedRepo(HOME, {})
    seedRepoMeta("acme/just-shared", { topics: [TOPIC] })
    // Prime a listing that already includes it, then verify a repeat gate
    // for it doesn't force a re-search: the cached entry keeps serving.
    await listDataRepos("token", LOGIN)
    await requireDataRepo("token", LOGIN, "acme/just-shared")
    // A different repo tagged after priming stays invisible until TTL — proof
    // the gate didn't invalidate the cache.
    seedRepoMeta("acme/later", { topics: [TOPIC] })
    const listing = await listDataRepos("token", LOGIN)
    expect(listing.repos.map((r) => r.full)).not.toContain("acme/later")
  })

  it("rejects a stranger's public tagged repo reached by direct link", async () => {
    // The injection guard applies on the live-verify path too, so a link to
    // /r/stranger/evil-data can't smuggle an ineligible public repo in.
    seedRepo(HOME, {})
    seedRepoMeta("stranger/evil-data", {
      topics: [TOPIC],
      private: false,
      permissions: null,
    })

    const thrown = (await requireDataRepo(
      "token",
      LOGIN,
      "stranger/evil-data",
    ).catch((e) => e)) as { init?: { status: number } }
    expect(thrown.init?.status).toBe(404)
  })

  it("accepts the conventional home repo without a topic", async () => {
    seedRepo(HOME, {})
    const repo = await requireDataRepo("token", LOGIN, HOME)
    expect(repo.isHome).toBe(true)
  })

  it("rejects a readable repo that isn't tagged as a data repo", async () => {
    // The token could read it, but it's not part of the product surface.
    seedRepo("daniel/some-project", {})

    const thrown = (await requireDataRepo(
      "token",
      LOGIN,
      "daniel/some-project",
    ).catch((e) => e)) as { init?: { status: number } }
    expect(thrown.init?.status).toBe(404)
  })

  it("maps a dead token to the 401 re-auth degrade, not a raw crash", async () => {
    // A revoked token 401s on the search; the gate must surface the re-auth
    // Response its action/loader callers expect, never an unhandled throw.
    seedRepo(HOME, {})
    failSearch({ status: 401 })

    const thrown = (await requireDataRepo("token", LOGIN, "acme/x").catch(
      (e) => e,
    )) as { init?: { status: number } }
    expect(thrown.init?.status).toBe(401)
  })

  it("maps a transient live-verify failure to the 503 degrade", async () => {
    // Prime the cache (search ok, home present), then a 5xx on the live
    // getRepoMeta for an unknown repo must degrade to 503, not crash.
    seedRepo(HOME, {})
    await listDataRepos("token", LOGIN)
    failPath("acme/flaky", "", { status: 503, endpoint: "repo" })

    const thrown = (await requireDataRepo("token", LOGIN, "acme/flaky").catch(
      (e) => e,
    )) as { init?: { status: number } }
    expect(thrown.init?.status).toBe(503)
  })

  it("rejects an invisible repo and a malformed name alike, as 404", async () => {
    for (const name of ["ghost/absent", "not a repo", "a/b/c"]) {
      const thrown = (await requireDataRepo("token", LOGIN, name).catch(
        (e) => e,
      )) as { init?: { status: number } }
      expect(thrown.init?.status).toBe(404)
    }
  })
})
