import { createMemoryRouter, RouterProvider } from "react-router"
import { describe, expect, it, vi } from "vitest"
import { render } from "vitest-browser-react"

import type { Routine } from "@steward/schema"

import "../app.css"
import type { PublishEntry, PublishLedger } from "../lib/publish-ledger.ts"
import { SpendView } from "./spend-view.tsx"

const NOW = Date.parse("2026-08-04T12:00:00Z")
const REPO = { full: "ff/steward-data", name: "steward-data" }

const routines: Routine[] = [
  {
    slug: "alpha",
    name: "Alpha Report",
    template: "custom",
    enabled: true,
    category: "Engineering",
  },
  {
    slug: "beta",
    name: "Beta Digest",
    template: "custom",
    enabled: true,
    runner: "nat",
    category: "Executive",
  },
]

function entry(
  slug: string,
  usd: number | null,
  at = "2026-08-04T09:00:00Z",
): PublishEntry {
  return {
    slug,
    at,
    sha: `${slug}${at}`,
    cost: usd == null ? null : { tokens: 1000, usd },
  }
}

/** Rows of one roll-up, by its heading — the day strip ships an sr-only
    table too, so a bare `tbody tr` would find that one first. */
function rowsUnder(heading: string): HTMLElement[] {
  const section = [...document.querySelectorAll("section")].find(
    (el) => el.querySelector("h2")?.textContent?.trim() === heading,
  )
  return [...(section?.querySelectorAll<HTMLElement>("tbody tr") ?? [])]
}

async function renderView(ledger: Partial<PublishLedger> = {}, waitFor = "≈$") {
  const view = (
    <SpendView
      repo={REPO}
      sidebar={{ repos: [], complete: true, degraded: false }}
      login="daniel"
      displayName="Daniel"
      now={NOW}
      routines={routines}
      templates={[]}
      spend={Promise.resolve({
        entries: [entry("alpha", 9), entry("beta", 1), entry("alpha", null)],
        capped: false,
        since: "2026-08-01T09:00:00Z",
        ...ledger,
      })}
    />
  )
  const router = createMemoryRouter([{ path: "/", element: view }])
  await render(<RouterProvider router={router} />)
  await vi.waitFor(() => {
    if (!document.body.textContent?.includes(waitFor)) {
      throw new Error("pending")
    }
  })
}

describe("SpendView", () => {
  it("leads with the total and the reach it covers", async () => {
    await renderView()
    const text = document.body.textContent ?? ""
    expect(text).toContain("≈$10.00")
    // A total nobody can scope is not a fact: two of the three runs carried a
    // price, and the headline says so rather than implying all three did.
    expect(text).toContain("2 of 3 runs priced")
    expect(text).toContain("≈$5.00 each")
  })

  it("ranks routines by spend and links each back to its own history", async () => {
    await renderView()
    const rows = rowsUnder("By routine")
    expect(rows[0]?.textContent).toContain("Alpha Report")
    expect(rows[0]?.textContent).toContain("90%")
    const link = [...document.querySelectorAll("a")].find(
      (a) => a.textContent?.trim() === "Alpha Report",
    )
    expect(link?.getAttribute("href")).toBe("/r/ff/steward-data/routines/alpha")
  })

  it("marks a routine that has left the pool, and stops linking it", async () => {
    // Its receipts are commits and the money was spent (ADR-0061), so the row
    // stays and keeps counting — but the raw slug alone read as a routine
    // nobody had named, and the link it used to carry 404s.
    await renderView({
      entries: [entry("alpha", 9), entry("ghost", 3)],
    })
    const ghost = rowsUnder("By routine").find((row) =>
      row.textContent?.includes("ghost"),
    )
    expect(ghost?.textContent).toContain("retired")
    expect(ghost?.querySelector("a")).toBeNull()
    // The window's total still carries it — hiding it would leave the
    // headline and the rows disagreeing about what the repo cost.
    expect(document.body.textContent ?? "").toContain("≈$12.00")
    // A live routine beside it keeps its name and its link.
    const alpha = rowsUnder("By routine").find((row) =>
      row.textContent?.includes("Alpha Report"),
    )
    expect(alpha?.textContent).not.toContain("retired")
    expect(alpha?.querySelector("a")?.getAttribute("href")).toBe(
      "/r/ff/steward-data/routines/alpha",
    )
  })

  it("says how many of a routine's runs were priced, not just the total", async () => {
    // Forty cheap runs and one dear one reach the same sum and are not the
    // same finding.
    await renderView()
    expect(document.body.textContent ?? "").toContain("1/2 runs")
  })

  it("draws no column for a day that ran without pricing anything", async () => {
    // Pricing began part-way through the window, so a zero-height column
    // would claim the routines ran free on days that merely ran unpriced.
    await renderView({
      entries: [
        entry("alpha", 4, "2026-08-04T09:00:00Z"),
        entry("beta", null, "2026-08-02T09:00:00Z"),
      ],
    })
    // Four day slots (1st–4th is not covered; oldest entry is the 2nd), and
    // only the priced day carries a fill.
    const fills = document.querySelectorAll(".bg-ink-faint")
    const dayFills = [...fills].filter((el) =>
      el.parentElement?.getAttribute("title")?.includes("2026-08"),
    )
    expect(dayFills).toHaveLength(1)
  })

  it("reports an unreachable history rather than an empty repo", async () => {
    // A failed read must not render as "nothing has run yet" — that is a
    // claim about the repo, made from an answer we never got.
    await renderView({ entries: [], unreachable: true }, "GitHub unreachable")
    expect(document.body.textContent ?? "").not.toContain("Nothing has run yet")
  })

  it("keeps unbanded routines visible as their own band", async () => {
    await renderView({
      entries: [entry("alpha", 4), entry("ghost", 6)],
    })
    // The deleted routine's spend is real; it is named by slug and banded
    // under "No band" rather than dropped to tidy the total.
    const text = document.body.textContent ?? ""
    expect(text).toContain("ghost")
    expect(text).toContain("No band")
  })
})
