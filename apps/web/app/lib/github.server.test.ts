import { describe, expect, it } from "vitest"

import { failPath, githubStats, seedRepo } from "../mocks/github.ts"
import { getFile, GitHubError, repoExists } from "./github.server.ts"

const REPO = "daniel/bulletin-data-daniel"
const PATH = "data/routines.yaml"

describe("gh ETag revalidation", () => {
  it("answers a repeat GET with a 304 instead of refetching the body", async () => {
    seedRepo(REPO, { [PATH]: "routines: []" })

    const first = await getFile("token", REPO, PATH)
    const second = await getFile("token", REPO, PATH)

    expect(first?.text).toBe("routines: []")
    expect(second?.text).toBe("routines: []")
    // One full body, one conditional 304 — the repeat cost no rate limit.
    expect(githubStats).toEqual({ full: 1, conditional: 1 })
  })

  it("serves fresh content the moment the resource changes (no staleness)", async () => {
    seedRepo(REPO, { [PATH]: "routines: []" })
    await getFile("token", REPO, PATH)

    // Same path, new content — the stored ETag no longer matches, so GitHub
    // ships a full 200 rather than a 304. This is what keeps sync's
    // stale-base SHA check honest.
    seedRepo(REPO, { [PATH]: "routines: [changed]" })
    const updated = await getFile("token", REPO, PATH)

    expect(updated?.text).toBe("routines: [changed]")
    expect(githubStats).toEqual({ full: 2, conditional: 0 })
  })

  it("scopes the cache by token so one user's ETag can't answer another's read", async () => {
    seedRepo(REPO, { [PATH]: "routines: []" })

    await getFile("token-a", REPO, PATH)
    await getFile("token-b", REPO, PATH)

    // Different tokens → different keys → both are full reads, never a
    // cross-user 304 that could leak private content.
    expect(githubStats).toEqual({ full: 2, conditional: 0 })
  })
})

describe("repoExists", () => {
  it("returns true for a visible repo", async () => {
    seedRepo(REPO, {})
    expect(await repoExists("token", REPO)).toBe(true)
  })

  it("returns false only for a definitive 404 (absent or invisible)", async () => {
    // Nothing seeded → GitHub answers 404, the one real "no".
    expect(await repoExists("token", "daniel/does-not-exist")).toBe(false)
  })

  it("throws GitHubError on a 5xx instead of reading the repo as missing", async () => {
    // A GitHub outage must not masquerade as "repo gone" — that would bounce
    // an existing user into the setup wizard mid-outage.
    seedRepo(REPO, {})
    failPath(REPO, "", { status: 503, endpoint: "repo" })

    const error = await repoExists("token", REPO).catch((e) => e)
    expect(error).toBeInstanceOf(GitHubError)
  })

  it("throws GitHubError, not a raw fetch error, on a network blip", async () => {
    // The intermittent post-sign-in/refresh crash: a thrown fetch on the
    // existence probe must arrive as a GitHubError so the loader degrades to a
    // 503 page instead of the generic error boundary.
    seedRepo(REPO, {})
    failPath(REPO, "", { network: true, endpoint: "repo" })

    const error = await repoExists("token", REPO).catch((e) => e)
    expect(error).toBeInstanceOf(GitHubError)
    expect((error as GitHubError).status).toBe(503)
  })
})
