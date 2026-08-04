import { describe, expect, it } from "vitest"

import {
  costByDay,
  costBySlug,
  parsePublishSubject,
  toEntries,
  totalCost,
  type PublishEntry,
} from "./publish-ledger.ts"

const priced = (usd: number) =>
  `publish: alpha\n\nRun-Tokens: 1000\nRun-Cost-USD: ${usd}\n`

function entry(over: Partial<PublishEntry> & Pick<PublishEntry, "slug">) {
  return {
    at: "2026-08-04T09:00:00Z",
    sha: "a".repeat(40),
    cost: null,
    ...over,
  }
}

describe("parsePublishSubject", () => {
  it("reads the contract shape publish-widget writes", () => {
    expect(parsePublishSubject("publish: shopify-intel\n\nbody")).toBe(
      "shopify-intel",
    )
  })

  it("reads the scripted shape too, so those runs keep their denominator", () => {
    // repo-stats in the Form Factory data repo commits with its own git
    // plumbing rather than through the skill. Its commits touch
    // w/<slug>/index.html all the same, so they are runs — a scan matching
    // only `publish:` would read that routine as never having run.
    expect(
      parsePublishSubject(
        "widget: corza-repo-stats @ 2026-08-04T12:12:39Z (scripted)",
      ),
    ).toBe("corza-repo-stats")
  })

  it("names no routine for a commit that is not a publish", () => {
    expect(parsePublishSubject("Merge branch 'main' into artifacts")).toBeNull()
    expect(parsePublishSubject("")).toBeNull()
    expect(parsePublishSubject(null)).toBeNull()
  })

  it("does not read a slug out of the middle of a subject", () => {
    // Anchored to column 1, so an instruction or a body quoting the
    // convention cannot be mistaken for a receipt.
    expect(
      parsePublishSubject("chore: re-run publish: alpha by hand"),
    ).toBeNull()
  })
})

describe("toEntries", () => {
  it("keeps publishes with their price and drops everything else", () => {
    const entries = toEntries([
      { sha: "s1", date: "2026-08-04T09:00:00Z", message: priced(1.5) },
      { sha: "s2", date: "2026-08-04T08:00:00Z", message: "publish: beta" },
      {
        sha: "s3",
        date: "2026-08-04T07:00:00Z",
        message: "Merge pull request",
      },
    ])
    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({ slug: "alpha", cost: { usd: 1.5 } })
    // A receipt from before the trailers is a run without a price, not a
    // free run — the cost is absent, the entry stands.
    expect(entries[1]).toMatchObject({ slug: "beta", cost: null })
  })
})

describe("costBySlug", () => {
  it("means over the priced runs but counts every run", () => {
    const costs = costBySlug([
      entry({ slug: "alpha", cost: { tokens: 1, usd: 2 } }),
      entry({ slug: "alpha", cost: { tokens: 1, usd: 4 } }),
      entry({ slug: "alpha", cost: null }),
    ])
    // The denominator is the priced runs — averaging over 3 would report the
    // routine as cheaper than any run of it has ever been.
    expect(costs.alpha).toEqual({ usd: 6, priced: 2, runs: 3, mean: 3 })
  })

  it("gives a routine with no priced run no average at all", () => {
    const costs = costBySlug([entry({ slug: "beta" }), entry({ slug: "beta" })])
    expect(costs.beta.mean).toBeNull()
    expect(costs.beta.runs).toBe(2)
  })

  it("ignores a price the summing script could not compute", () => {
    // A model with no rate emits tokens alone. Tokens stay true when pricing
    // doesn't, but they are not dollars and must not enter a dollar mean.
    const costs = costBySlug([
      entry({ slug: "alpha", cost: { tokens: 9_000, usd: null } }),
      entry({ slug: "alpha", cost: { tokens: 1_000, usd: 1 } }),
    ])
    expect(costs.alpha).toMatchObject({ usd: 1, priced: 1, runs: 2, mean: 1 })
  })
})

describe("totalCost", () => {
  it("reports its own reach alongside the sum", () => {
    const total = totalCost([
      entry({ slug: "alpha", cost: { tokens: 1, usd: 1 } }),
      entry({ slug: "beta", cost: null }),
    ])
    expect(total).toEqual({ usd: 1, priced: 1, runs: 2, mean: 1 })
  })

  it("has no mean when nothing was priced", () => {
    expect(totalCost([entry({ slug: "alpha" })]).mean).toBeNull()
  })
})

describe("costByDay", () => {
  it("buckets by UTC day, oldest first", () => {
    const days = costByDay([
      entry({
        slug: "a",
        at: "2026-08-04T09:00:00Z",
        cost: { tokens: 1, usd: 2 },
      }),
      entry({
        slug: "a",
        at: "2026-08-04T23:30:00Z",
        cost: { tokens: 1, usd: 3 },
      }),
      entry({
        slug: "a",
        at: "2026-08-02T01:00:00Z",
        cost: { tokens: 1, usd: 1 },
      }),
    ])
    expect(days.map((d) => d.day)).toEqual(["2026-08-02", "2026-08-04"])
    expect(days[1]).toMatchObject({ usd: 5, priced: 2, runs: 2 })
  })

  it("leaves a day of unpriced runs at zero dollars but counts its runs", () => {
    // The strip draws only days that carry spend. Pricing began part-way
    // through any window reaching past ADR-0060, so a column of zero on a day
    // that simply ran unpriced would read as "we spent nothing that day".
    const days = costByDay([entry({ slug: "a", at: "2026-07-30T09:00:00Z" })])
    expect(days).toEqual([{ day: "2026-07-30", usd: 0, priced: 0, runs: 1 }])
  })
})
