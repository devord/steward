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
    // daily-plan is used twice, repo-pulse once…
    for (const slug of ["morning", "standup", "pulse"]) {
      expect(text).toContain(slug)
    }
    // …and team-okrs by nothing — the ledger's orphan twin.
    expect(text).toContain("unused")
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
