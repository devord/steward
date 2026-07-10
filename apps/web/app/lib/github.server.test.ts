import { describe, expect, it } from "vitest"

import { githubStats, seedRepo } from "../mocks/github.ts"
import { getFile } from "./github.server.ts"

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
