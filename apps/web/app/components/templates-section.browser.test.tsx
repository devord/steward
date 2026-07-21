import { describe, expect, it, vi } from "vitest"
import { render } from "vitest-browser-react"

import type { Routine } from "@steward/schema"

import "../app.css"
import type { DiscoveredTemplate } from "../lib/templates.ts"
import { TemplatesSection } from "./routines-view.tsx"

const REPO = {
  full: "alice/steward-data",
  name: "steward-data",
  isShared: false,
}

function template(
  over: Partial<DiscoveredTemplate> & Pick<DiscoveredTemplate, "id" | "source">,
): DiscoveredTemplate {
  return {
    name: over.id,
    description: `${over.id} description`,
    widget: { artifact: "a report" },
    ...over,
  }
}

// A built-in in use, a repo template shadowing a built-in, and a repo
// template no routine names — the three source/usage shapes the ledger tells
// apart.
const dailyPlan = template({
  id: "daily-plan",
  name: "Daily plan",
  source: "builtin",
  widget: { artifact: "today's plan", schedule: "0 6 * * *" },
})
const repoPulse = template({
  id: "repo-pulse",
  name: "Repo pulse",
  source: "repo",
  shadows: true,
})
const teamOkrs = template({ id: "team-okrs", source: "repo" })

const routines: Routine[] = [
  { slug: "morning", name: "Morning", template: "daily-plan", enabled: true },
  { slug: "standup", name: "Standup", template: "daily-plan", enabled: true },
  { slug: "pulse", name: "Pulse", template: "repo-pulse", enabled: true },
]

async function renderSection(
  over: Partial<Parameters<typeof TemplatesSection>[0]> = {},
) {
  const onUse = vi.fn()
  await render(
    <TemplatesSection
      templates={[dailyPlan, repoPulse, teamOkrs]}
      routines={routines}
      repo={REPO}
      onUse={onUse}
      {...over}
    />,
  )
  return { onUse }
}

describe("TemplatesSection", () => {
  it("renders a row per template with name, id, and suggested schedule", async () => {
    await renderSection()
    const text = document.body.textContent ?? ""
    for (const entry of [dailyPlan, repoPulse, teamOkrs]) {
      expect(text).toContain(entry.name)
      expect(text).toContain(entry.id)
    }
    expect(text).toContain("0 6 * * *")
  })

  it("names each source and flags a repo template overriding a built-in", async () => {
    await renderSection()
    const text = document.body.textContent ?? ""
    expect(text).toContain("built-in")
    expect(text).toContain(REPO.name)
    expect(text).toContain("overrides built-in")
  })

  it("cross-references the routines using each template; unused is named", async () => {
    await renderSection()
    const text = document.body.textContent ?? ""
    // A single user renders in the cell; repo-pulse's only routine is `pulse`.
    expect(text).toContain("pulse")
    // …and team-okrs is used by nothing — the ledger's orphan twin.
    expect(text).toContain("unused")
  })

  it("collapses a multi-routine cell to the first slug plus a counted rest", async () => {
    // daily-plan is used by `morning` and `standup`: the cell shows the first
    // and defers the rest to the popover, so the row stays one line wide.
    await renderSection()
    const text = document.body.textContent ?? ""
    expect(text).toContain("morning")
    expect(text).not.toContain("standup")
    expect(
      document.querySelector('button[aria-label="Show all 2 routines"]'),
    ).not.toBeNull()
  })

  it("opens the whole list of using routines from the counted rest", async () => {
    await renderSection()
    document
      .querySelector<HTMLButtonElement>(
        'button[aria-label="Show all 2 routines"]',
      )
      ?.click()
    await vi.waitFor(() => {
      const links = [...document.querySelectorAll("a")].filter(
        (a) => a.getAttribute("href")?.startsWith("#routine-") === true,
      )
      // Every user is named in the popover, the first one included.
      expect(links.map((a) => a.getAttribute("href"))).toEqual(
        expect.arrayContaining(["#routine-morning", "#routine-standup"]),
      )
    })
  })

  it("keeps a long-slug used-by cell off the row actions, on one line", async () => {
    // The bug this collapse exists for: slugs never break mid-word, so a
    // wrapping list both stacked the row and spilled a long name over the
    // action button beside it.
    await renderSection({
      templates: [dailyPlan],
      routines: routines.slice(0, 2).map((entry, i) => ({
        ...entry,
        slug: i === 0 ? "turtle-beach-hydrogen-stats" : "corza-repo-stats",
      })),
    })
    const row = document.querySelector("tbody tr")
    const cells = [...(row?.querySelectorAll("td") ?? [])]
    const action = cells.at(-1)?.querySelector("button")
    const head = cells
      .at(-2)
      ?.querySelector<HTMLElement>('[data-slot="cross-ref-head"]')
    if (row == null || action == null || head == null) {
      throw new Error("used-by cell or row action missing")
    }
    // The slug outgrows its box (it can't break mid-word) — the point is that
    // the box clips it instead of letting it paint over the row actions, which
    // a wrapping list, being `overflow: visible`, did.
    expect(head.scrollWidth).toBeGreaterThan(head.clientWidth)
    expect(getComputedStyle(head).overflowX).toBe("hidden")
    expect(head.getBoundingClientRect().right).toBeLessThanOrEqual(
      action.getBoundingClientRect().left,
    )
    // Clipped, so the full slug has to stay recoverable.
    expect(head.title).toBe("turtle-beach-hydrogen-stats")
    // And the row is one line, not one line per routine.
    expect(row.getBoundingClientRect().height).toBeLessThan(48)
  })

  it("starts a new routine from the row's template", async () => {
    const { onUse } = await renderSection()
    document
      .querySelector<HTMLButtonElement>(
        'button[aria-label="New routine from Daily plan"]',
      )
      ?.click()
    expect(onUse).toHaveBeenCalledWith("daily-plan")
  })

  it("links a repo template's name to its file on GitHub; a built-in's name is inert", async () => {
    await renderSection()
    // The name itself is the link — repo templates carry the file href.
    const fileLink = document.querySelector(
      'a[href="https://github.com/alice/steward-data/blob/HEAD/templates/routines/team-okrs.md"]',
    )
    expect(fileLink?.textContent).toContain("team-okrs")
    // A built-in ships in the app bundle, so its name is not a link.
    const links = [...document.querySelectorAll("a")]
    expect(links.some((a) => a.textContent?.includes(dailyPlan.name))).toBe(
      false,
    )
  })

  it("renders nothing with no templates", async () => {
    await renderSection({ templates: [] })
    expect(document.body.textContent).not.toContain("Templates")
  })
})
