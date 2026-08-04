import { beforeEach, describe, expect, it } from "vitest"

import { failPath, seedPublishLog, seedRepo } from "../mocks/github.ts"
import { loadRepoSpend, SPEND_WINDOW_DAYS } from "./dashboard.server.ts"
import { costBySlug } from "./publish-ledger.ts"

const TOKEN = "t"
const REPO = "daniel/steward-data-daniel"
const DAY = 24 * 3_600_000

/** A publish commit `n` days old, priced unless `usd` is omitted. */
function publish(slug: string, daysAgo: number, usd?: number) {
  const body = usd == null ? "" : `\n\nRun-Tokens: 1000\nRun-Cost-USD: ${usd}\n`
  return {
    date: new Date(Date.now() - daysAgo * DAY).toISOString(),
    message: `publish: ${slug}${body}`,
  }
}

beforeEach(() => {
  // The scan reads the branch, never a file — but the repo has to exist for
  // the rest of the client's expectations to hold.
  seedRepo(REPO, { "data/routines.yaml": "routines: []\n" })
})

describe("loadRepoSpend", () => {
  it("prices every routine from one branch-wide scan", async () => {
    seedPublishLog(REPO, [
      publish("alpha", 1, 2),
      publish("beta", 1, 5),
      publish("alpha", 2, 4),
    ])
    const ledger = await loadRepoSpend(TOKEN, REPO)
    const costs = costBySlug(ledger.entries)
    expect(costs.alpha).toMatchObject({ usd: 6, priced: 2, runs: 2, mean: 3 })
    expect(costs.beta).toMatchObject({ mean: 5 })
    expect(ledger.capped).toBe(false)
  })

  it("counts a scripted publish as a run of that routine", async () => {
    // repo-stats commits `widget: <slug> @ <iso> (scripted)` with its own git
    // plumbing. Those commits touch the artifact all the same, so dropping
    // them would read the routine as never having run.
    seedPublishLog(REPO, [
      {
        date: new Date().toISOString(),
        message: "widget: corza-repo-stats @ 2026-08-04T12:12:39Z (scripted)",
      },
    ])
    const ledger = await loadRepoSpend(TOKEN, REPO)
    expect(costBySlug(ledger.entries)["corza-repo-stats"]).toMatchObject({
      runs: 1,
      // Scripted runs burn no session, so they stay unpriced — a dash, not a
      // zero that would drag the average down with a non-measurement.
      priced: 0,
      mean: null,
    })
  })

  it("stops at the window instead of reading the whole branch", async () => {
    seedPublishLog(REPO, [
      publish("alpha", 1, 1),
      publish("alpha", SPEND_WINDOW_DAYS + 5, 99),
      publish("alpha", SPEND_WINDOW_DAYS + 6, 99),
    ])
    const ledger = await loadRepoSpend(TOKEN, REPO)
    // The page is short, so the scan ends there and nothing is capped — but
    // `since` reports how far back it actually reached, which is what every
    // total downstream is qualified by.
    expect(ledger.capped).toBe(false)
    expect(ledger.since).not.toBeNull()
  })

  it("marks itself capped when the page ceiling arrives before the window", async () => {
    // 10 pages of 100, all inside the window: the scan can't reach the floor,
    // so the surfaces must say the window they show is narrower than asked.
    seedPublishLog(
      REPO,
      Array.from({ length: 1_100 }, (_, i) => publish("alpha", i / 100, 0.5)),
    )
    const ledger = await loadRepoSpend(TOKEN, REPO)
    expect(ledger.capped).toBe(true)
    expect(ledger.entries).toHaveLength(1_000)
  })

  it("degrades in band rather than failing the page", async () => {
    failPath(REPO, "", { status: 500, times: Infinity, endpoint: "commits" })
    const ledger = await loadRepoSpend(TOKEN, REPO)
    expect(ledger.unreachable).toBe(true)
    expect(ledger.entries).toEqual([])
  })

  it("reads an unpublished repo as no spend, not as a failure", async () => {
    // No artifacts branch yet: nothing has ever run, which is an answer.
    const ledger = await loadRepoSpend(TOKEN, REPO)
    expect(ledger.unreachable).toBeUndefined()
    expect(ledger.entries).toEqual([])
  })
})
