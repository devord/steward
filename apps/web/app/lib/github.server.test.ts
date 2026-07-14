import { describe, expect, it } from "vitest"

import {
  failPath,
  githubStats,
  seedRepo,
  seedRepoMeta,
} from "../mocks/github.ts"
import {
  addRepoTopic,
  commitFiles,
  getFile,
  getRepoTopics,
  GitHubError,
  listCollaborators,
  repoExists,
} from "./github.server.ts"

const REPO = "daniel/steward-data-daniel"
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

describe("addRepoTopic", () => {
  it("unions with existing topics — the PUT replaces the whole set", async () => {
    // Losing a repo's unrelated topics would be user-visible vandalism.
    seedRepoMeta(REPO, { topics: ["internal-tools"] })

    await addRepoTopic("token", REPO, "steward-data")

    expect(await getRepoTopics("token", REPO)).toEqual([
      "internal-tools",
      "steward-data",
    ])
  })

  it("is a no-op when the topic is already present", async () => {
    seedRepoMeta(REPO, { topics: ["steward-data"] })
    await addRepoTopic("token", REPO, "steward-data")
    expect(await getRepoTopics("token", REPO)).toEqual(["steward-data"])
  })
})

describe("listCollaborators", () => {
  it("lists collaborators for a repo the viewer can administer", async () => {
    seedRepoMeta(REPO, {
      collaborators: [
        { login: "daniel", avatar_url: "https://avatars.test/daniel" },
        { login: "ana", avatar_url: "https://avatars.test/ana" },
      ],
    })

    expect(await listCollaborators("token", REPO)).toEqual([
      { login: "daniel", avatarUrl: "https://avatars.test/daniel" },
      { login: "ana", avatarUrl: "https://avatars.test/ana" },
    ])
  })

  it("returns null — never throws — when the viewer lacks push access", async () => {
    // GitHub answers 403 for plain readers; the UI just omits the stack.
    seedRepoMeta(REPO, { collaborators: "forbidden" })
    expect(await listCollaborators("token", REPO)).toBeNull()
  })
})

describe("commitFiles", () => {
  it("writes every file in one commit — the whole batch lands", async () => {
    seedRepo(REPO, {
      "data/dashboards/corza.yaml": "section: Clients\ngrid: {}\nwidgets: []\n",
      "data/dashboards/acme.yaml": "section: Clients\ngrid: {}\nwidgets: []\n",
      "data/repo.yaml": "sections:\n  - Clients\n",
    })

    await commitFiles("token", REPO, {
      branch: "main",
      message: "config: rename section Clients → Accounts via steward",
      files: [
        {
          path: "data/dashboards/corza.yaml",
          content: "section: Accounts\ngrid: {}\nwidgets: []\n",
        },
        {
          path: "data/dashboards/acme.yaml",
          content: "section: Accounts\ngrid: {}\nwidgets: []\n",
        },
        { path: "data/repo.yaml", content: "sections:\n  - Accounts\n" },
      ],
    })

    // All three paths reflect the new content — an atomic multi-file commit,
    // not a half-applied sequence.
    expect(
      (await getFile("token", REPO, "data/dashboards/corza.yaml"))?.text,
    ).toContain("Accounts")
    expect(
      (await getFile("token", REPO, "data/dashboards/acme.yaml"))?.text,
    ).toContain("Accounts")
    expect((await getFile("token", REPO, "data/repo.yaml"))?.text).toContain(
      "Accounts",
    )
  })

  it("surfaces a GitHubError the route can classify, never a raw throw", async () => {
    // No repo seeded → the branch-head read 404s. commitFiles must let it
    // arrive as a GitHubError so the caller maps it (denied/conflict) instead
    // of crashing — the same contract the single-file writes keep.
    const error = await commitFiles("token", "daniel/does-not-exist", {
      branch: "main",
      message: "noop",
      files: [{ path: "data/repo.yaml", content: "sections: []\n" }],
    }).catch((e) => e)
    expect(error).toBeInstanceOf(GitHubError)
  })
})
