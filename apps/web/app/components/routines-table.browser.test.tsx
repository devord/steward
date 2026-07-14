import { createMemoryRouter, RouterProvider } from "react-router"
import { describe, expect, it, vi } from "vitest"
import { render } from "vitest-browser-react"

import type { Routine } from "@steward/schema"

import "../app.css"
import type { ArtifactInfo } from "../lib/dashboard.server.ts"
import { RoutinesTable } from "./routines-view.tsx"

const NOW = 1_770_000_000_000
const HOUR = 3_600_000
const DAY = 24 * HOUR

const HOME_REPO = "alice/steward-data"

function routine(
  over: Partial<Routine> & Pick<Routine, "slug" | "name">,
): Routine {
  return {
    template: "custom",
    enabled: true,
    ...over,
  }
}

// A live, fresh, placed cloud routine — carries a trigger id (the claude.ai
// link) and sits on `main`.
const daily = routine({
  slug: "daily-plan",
  name: "Daily plan",
  schedule: "0 7 * * *",
})
// Scheduled cloud, overdue by days → stale.
const changelog = routine({
  slug: "changelog",
  name: "Changelog",
  schedule: "0 9 * * *",
})
// Manual local, never run, on no board → orphan.
const triage = routine({
  slug: "triage-brief",
  name: "Triage brief",
  host: "local",
})

const artifacts: Record<string, ArtifactInfo> = {
  "daily-plan": {
    html: "<p>ok</p>",
    sha: "a1",
    lastRunAt: new Date(NOW - 2 * HOUR).toISOString(),
    hasTrigger: true,
    routineId: "rt_daily_123",
    claudeAccount: "alice@example.org",
  },
  changelog: {
    html: "<p>old</p>",
    sha: "b2",
    lastRunAt: new Date(NOW - 5 * DAY).toISOString(),
    hasTrigger: true,
    routineId: "rt_change_456",
  },
  "triage-brief": { html: null, sha: null, lastRunAt: null },
}

function menuItem(label: string): HTMLElement | null {
  return (
    [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (el) => el.textContent?.trim() === label,
    ) ?? null
  )
}

async function renderTable(
  over: Partial<Parameters<typeof RoutinesTable>[0]> = {},
) {
  const onEdit = vi.fn()
  const onSetEnabled = vi.fn()
  const onDelete = vi.fn()
  const onPlace = vi.fn()
  const onFired = vi.fn()
  const props: Parameters<typeof RoutinesTable>[0] = {
    routines: [daily, changelog, triage],
    artifacts,
    boardsByRoutine: { "daily-plan": ["main"], changelog: ["main"] },
    dashboards: ["main", "ops"],
    // All three are committed by default; a test overrides to cover drafts.
    committedSlugs: new Set(["daily-plan", "changelog", "triage-brief"]),
    pending: {},
    repo: { full: HOME_REPO, name: "steward-data", isShared: false },
    homeRepo: HOME_REPO,
    now: NOW,
    onEdit,
    onSetEnabled,
    onDelete,
    onPlace,
    onFired,
    ...over,
  }
  // RowMenu uses useFetcher, which needs a data router.
  const router = createMemoryRouter([
    { path: "/", element: <RoutinesTable {...props} /> },
  ])
  await render(<RouterProvider router={router} />)
  return { onEdit, onSetEnabled, onDelete, onPlace, onFired }
}

const openMenu = async (name: string) => {
  const trigger = document.querySelector<HTMLButtonElement>(
    `button[aria-label="Options for ${name}"]`,
  )
  if (!trigger) throw new Error(`no row menu for "${name}"`)
  trigger.click()
  await vi.waitFor(() => expect(menuItem("Delete")).not.toBeNull())
}

describe("RoutinesTable", () => {
  it("renders a row per routine with name and slug", async () => {
    await renderTable()
    const text = document.body.textContent ?? ""
    for (const r of [daily, changelog, triage]) {
      expect(text).toContain(r.name)
      expect(text).toContain(r.slug)
    }
  })

  it("names the state: fresh runs, stale, and never-run", async () => {
    await renderTable()
    const text = document.body.textContent ?? ""
    // Fresh live → "Ran …"; overdue → Stale; manual-local, no artifact → never.
    expect(text).toContain("Ran")
    expect(text).toContain("Stale")
    expect(text).toContain("Never ran")
  })

  it("shows Running for a routine with an in-flight mark, over its artifact", async () => {
    // The pool reads the same durable pending-run marks as the rail, so a fire
    // still in flight beats the live artifact's "Ran …" (regression: the two
    // used to disagree — rail dot spinning while the row read "Ran 1h ago").
    await renderTable({
      pending: { [daily.slug]: { firedAt: NOW, sha: null } },
    })
    const dailyRow = [...document.querySelectorAll("tr")].find((tr) =>
      tr.textContent?.includes(daily.name),
    )
    expect(dailyRow?.textContent).toContain("Running")
    expect(dailyRow?.textContent).not.toContain("Ran")
  })

  it("surfaces orphans and links placed routines to their boards", async () => {
    await renderTable()
    // The placed routine links to its board.
    const boardLink = [...document.querySelectorAll("a")].find(
      (a) => a.getAttribute("href") === "/", // home repo `main` → "/"
    )
    expect(boardLink?.textContent?.trim()).toBe("main")
    // The orphan (triage) row carries the orphan tag, not a board link.
    expect(document.body.textContent).toContain("orphan")
  })

  it("shows the owning Claude account when the trigger carries one (ADR-0029)", async () => {
    await renderTable()
    // daily-plan's trigger names its account; changelog's predates the field.
    const dailyRow = [...document.querySelectorAll("tr")].find((tr) =>
      tr.textContent?.includes("Daily plan"),
    )
    expect(dailyRow?.textContent).toContain("alice@example.org")
    const changelogRow = [...document.querySelectorAll("tr")].find((tr) =>
      tr.textContent?.includes("Changelog"),
    )
    expect(changelogRow?.textContent).not.toContain("@")
  })

  it("shows a claude.ai link only for a routine with a trigger id", async () => {
    await renderTable()
    await openMenu("Daily plan")
    const link = menuItem("Open in claude.ai")
    expect(link).not.toBeNull()
    expect(link?.closest("a")?.getAttribute("href")).toBe(
      "https://claude.ai/code/routines/rt_daily_123",
    )
  })

  it("offers an inline run button on a cloud routine's row", async () => {
    await renderTable()
    expect(
      document.querySelector('button[aria-label="Run Daily plan now"]'),
    ).not.toBeNull()
    // The menu no longer carries the verb — one affordance per action.
    await openMenu("Daily plan")
    expect(menuItem("Run now")).toBeNull()
  })

  it("omits the run button on a local routine's row", async () => {
    await renderTable()
    expect(
      document.querySelector('button[aria-label="Run Triage brief now"]'),
    ).toBeNull()
  })

  it("links a committed routine's name to its detail view (ADR-0033)", async () => {
    await renderTable()
    const nameLink = [...document.querySelectorAll("a")].find(
      (a) => a.getAttribute("href") === `/r/${HOME_REPO}/routines/daily-plan`,
    )
    expect(nameLink?.textContent).toContain("Daily plan")
  })

  it("keeps a draft-only routine's name inert — no page to land on yet", async () => {
    await renderTable({ committedSlugs: new Set(["daily-plan", "changelog"]) })
    const triageLink = [...document.querySelectorAll("a")].find(
      (a) => a.getAttribute("href") === `/r/${HOME_REPO}/routines/triage-brief`,
    )
    expect(triageLink).toBeUndefined()
  })

  it("deletes the routine the menu belongs to", async () => {
    const { onDelete } = await renderTable()
    await openMenu("Changelog")
    menuItem("Delete")?.click()
    expect(onDelete).toHaveBeenCalledWith("changelog")
  })
})
