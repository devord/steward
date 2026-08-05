import { describe, expect, it } from "vitest"

import type { Routine } from "@steward/schema"

import type { PublishEntry } from "./publish-ledger.ts"
import { summarizeSpend } from "./spend.ts"

const NOW = Date.parse("2026-08-04T12:00:00Z")

function routine(over: Partial<Routine> & Pick<Routine, "slug">): Routine {
  return {
    name: over.slug,
    template: "custom",
    enabled: true,
    ...over,
  }
}

function entry(
  slug: string,
  usd: number | null,
  at = "2026-08-04T09:00:00Z",
): PublishEntry {
  return {
    slug,
    at,
    sha: `${slug}-${at}`,
    cost: usd == null ? null : { tokens: 1000, usd },
  }
}

const routines = [
  routine({ slug: "alpha", name: "Alpha", category: "Engineering" }),
  routine({ slug: "beta", name: "Beta", runner: "nat", category: "Executive" }),
  routine({ slug: "gamma", name: "Gamma" }),
]

const opts = { repoOwner: "daniel", now: NOW }

describe("summarizeSpend", () => {
  it("ranks routines by spend and states each one's share", () => {
    const summary = summarizeSpend(
      [entry("alpha", 3), entry("beta", 1), entry("alpha", 6)],
      routines,
      opts,
    )
    expect(summary.usd).toBe(10)
    expect(summary.mean).toBe(10 / 3)
    expect(summary.byRoutine.map((row) => [row.label, row.usd])).toEqual([
      ["Alpha", 9],
      ["Beta", 1],
    ])
    expect(summary.byRoutine[0].share).toBeCloseTo(0.9)
  })

  it("attributes a run to its runner, falling back to the repo owner", () => {
    const summary = summarizeSpend(
      [entry("alpha", 2), entry("beta", 5)],
      routines,
      opts,
    )
    // alpha names no runner, so it belongs to whoever owns the repo — the
    // same rule the pool ledger's Owner column applies.
    expect(summary.byOwner.map((row) => [row.key, row.usd])).toEqual([
      ["nat", 5],
      ["daniel", 2],
    ])
  })

  it("keeps unbanded routines as their own bucket so the shares still add up", () => {
    const summary = summarizeSpend(
      [entry("alpha", 4), entry("gamma", 6)],
      routines,
      opts,
    )
    const bands = summary.byCategory.map((row) => [row.key, row.usd])
    expect(bands).toContainEqual(["", 6])
    expect(bands).toContainEqual(["Engineering", 4])
    expect(
      summary.byCategory.reduce((sum, row) => sum + row.share, 0),
    ).toBeCloseTo(1)
  })

  it("counts a routine that ran without ever reporting a price", () => {
    // Not absent and not free: it ran, it cost something, and nothing said
    // what. The row carries its runs with no dollars.
    const summary = summarizeSpend(
      [entry("alpha", 5), entry("gamma", null), entry("gamma", null)],
      routines,
      opts,
    )
    const gamma = summary.byRoutine.find((row) => row.key === "gamma")
    expect(gamma).toMatchObject({ usd: 0, priced: 0, runs: 2 })
    expect(summary.runs).toBe(3)
    expect(summary.priced).toBe(1)
  })

  it("names a routine that has left routines.yaml by its slug rather than dropping it", () => {
    // Its receipts are in the window and the money was spent; deleting the
    // config entry does not un-spend it.
    const summary = summarizeSpend([entry("ghost", 4)], routines, opts)
    expect(summary.byRoutine[0]).toMatchObject({
      key: "ghost",
      label: "ghost",
      retired: true,
    })
    expect(summary.usd).toBe(4)
  })

  it("drops a retired routine that never priced a run, and says how many", () => {
    // Retired *and* unpriced is the one inert combination (ADR-0063): no
    // dollars, no live subject, no page to click through to.
    const summary = summarizeSpend(
      [entry("alpha", 1), entry("ghost", null), entry("ghost", null)],
      routines,
      opts,
    )
    expect(summary.byRoutine.map((row) => row.key)).toEqual(["alpha"])
    expect(summary.withheld).toEqual({ rows: 1, runs: 2 })
    // The window's reach is unchanged — the runs stay in the denominator,
    // which is exactly why the page has to state what it withheld.
    expect(summary.runs).toBe(3)
  })

  it("keeps a retired routine that spent, and a live one that never priced", () => {
    // Both halves of the rule are load-bearing in opposite directions.
    const summary = summarizeSpend(
      [entry("ghost", 5), entry("alpha", null)],
      routines,
      opts,
    )
    expect(summary.byRoutine.map((row) => row.key).sort()).toEqual([
      "alpha",
      "ghost",
    ])
    expect(summary.withheld).toEqual({ rows: 0, runs: 0 })
  })

  it("marks only the routines that have left the pool", () => {
    // The flag carries the row's whole treatment — the tag and the missing
    // link — so a live routine picking it up would strand its detail page.
    const summary = summarizeSpend(
      [entry("alpha", 1), entry("ghost", 2)],
      routines,
      opts,
    )
    expect(
      Object.fromEntries(
        summary.byRoutine.map((row) => [row.key, row.retired]),
      ),
    ).toEqual({ alpha: false, ghost: true })
    // Owners and bands key on neither, so nothing there is ever retired.
    expect(summary.byOwner.every((row) => !row.retired)).toBe(true)
    expect(summary.byCategory.every((row) => !row.retired)).toBe(true)
  })

  it("gives the day axis one slot per calendar day, gaps included", () => {
    const summary = summarizeSpend(
      [
        entry("alpha", 1, "2026-08-04T09:00:00Z"),
        entry("alpha", 2, "2026-08-01T09:00:00Z"),
      ],
      routines,
      opts,
    )
    // 1st through 4th inclusive: the two quiet days keep their width, so the
    // strip stays linear in time instead of squeezing the gap away.
    expect(summary.days.map((day) => day.day)).toEqual([
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
      "2026-08-04",
    ])
    expect(summary.days[1]).toMatchObject({ usd: 0, runs: 0, priced: 0 })
  })

  it("has no mean and no days when nothing ran", () => {
    const summary = summarizeSpend([], routines, opts)
    expect(summary.mean).toBeNull()
    expect(summary.days).toEqual([])
    expect(summary.runs).toBe(0)
  })
})
