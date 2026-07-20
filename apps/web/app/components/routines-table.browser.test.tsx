import { createMemoryRouter, RouterProvider } from "react-router"
import { describe, expect, it, vi } from "vitest"
import { page } from "vitest/browser"
import { render } from "vitest-browser-react"

import type { Routine } from "@steward/schema"

import "../app.css"
import type { ArtifactInfo, SidebarData } from "../lib/dashboard.server.ts"
import { RoutinesTable, RoutinesView } from "./routines-view.tsx"

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

  it("speaks a preset schedule as its picker phrase, cron in the tooltip", async () => {
    // A preset cron reads as the phrase the picker offered ("Hourly"), with
    // the raw expression as the native title + sr-only echo; an off-preset
    // cron has no phrase and stays verbatim.
    await renderTable({
      routines: [
        routine({
          slug: "hourly",
          name: "Hourly pulse",
          schedule: "0 * * * *",
        }),
        changelog, // 0 9 * * * — not a preset
      ],
    })
    const hourlyRow = [...document.querySelectorAll("tr")].find((tr) =>
      tr.textContent?.includes("Hourly pulse"),
    )
    expect(hourlyRow?.textContent).toContain("Hourly")
    const phrase = hourlyRow?.querySelector('[title="0 * * * *"]')
    expect(phrase).not.toBeNull()
    const changelogRow = [...document.querySelectorAll("tr")].find((tr) =>
      tr.textContent?.includes("Changelog"),
    )
    expect(changelogRow?.textContent).toContain("0 9 * * *")
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

  // Read-only access (ADR-0023): a viewer who can't push must not be able to
  // start a mutation from a row — every edit is a draft that could only fail at
  // Sync (ADR-0003), so the row's actions disable up front.
  it("read-only repo: disables the inline run button and the menu's mutating items", async () => {
    await renderTable({ viewerCanPush: false })

    // The inline run affordance rests visible but disabled (not hidden) — the
    // menu trigger stays enabled so its non-mutating items (claude.ai) still open.
    const changelogRow = [...document.querySelectorAll("tr")].find((tr) =>
      tr.textContent?.includes("Changelog"),
    )
    expect(changelogRow?.querySelector("button[disabled]")).not.toBeNull()

    await openMenu("Changelog")
    expect(menuItem("Delete")?.hasAttribute("data-disabled")).toBe(true)
    expect(menuItem("Edit")?.hasAttribute("data-disabled")).toBe(true)
    expect(menuItem("Disable")?.hasAttribute("data-disabled")).toBe(true)
  })

  // `true` and `null` (unknown) must both leave the row fully interactive — we
  // never gate on a permission we couldn't read. `null` is the harness default.
  it("unknown push permission (null): the row's actions stay enabled", async () => {
    const { onDelete } = await renderTable({ viewerCanPush: null })
    await openMenu("Changelog")
    const del = menuItem("Delete")
    expect(del?.hasAttribute("data-disabled")).toBe(false)
    del?.click()
    expect(onDelete).toHaveBeenCalledWith("changelog")
  })
})

// The pool's read-only signal end to end: RoutinesView derives push permission
// from the streamed sidebar (SidebarRepo.viewerCanPush) for the active repo,
// then shows the badge and disables the toolbar's create verb — the same shape
// the board carries. Rendered whole so the sidebar → gating path is exercised.
describe("RoutinesView read-only access", () => {
  function sidebar(viewerCanPush: boolean | null): SidebarData {
    return {
      repos: [
        {
          repo: HOME_REPO,
          name: "steward-data",
          displayName: null,
          isHome: true,
          private: true,
          collaborators: null,
          viewerIsAdmin: null,
          viewerCanPush,
          sections: [],
          dashboards: [],
        },
      ],
      complete: true,
      degraded: false,
    }
  }

  async function renderView(viewerCanPush: boolean | null) {
    await page.viewport(1280, 900)
    const router = createMemoryRouter([
      {
        path: "/",
        element: (
          <RoutinesView
            repo={{
              full: HOME_REPO,
              name: "steward-data",
              isShared: viewerCanPush === false,
            }}
            homeRepo={HOME_REPO}
            sidebar={sidebar(viewerCanPush)}
            templates={[]}
            login="alice"
            displayName="Alice"
            now={NOW}
            pool={{
              routines: { routines: [daily, changelog, triage] },
              baseSha: "r1",
              baseFile: "routines: []\n",
              boardsByRoutine: { "daily-plan": ["main"] },
              dashboards: ["main"],
            }}
            artifacts={Promise.resolve(artifacts)}
          />
        ),
      },
      { path: "*", element: <p>ELSEWHERE</p> },
    ])
    await render(<RouterProvider router={router} />)
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Daily plan"),
    )
  }

  it("read-only repo: shows the badge and disables the New routine control", async () => {
    await renderView(false)
    expect(
      document.querySelector('[data-testid="read-only-badge"]'),
    ).not.toBeNull()
    const create = page.getByRole("button", { name: "New routine" })
    expect(create.element().hasAttribute("disabled")).toBe(true)
  })

  it("unknown push permission (null): no badge, New routine enabled", async () => {
    await renderView(null)
    expect(document.querySelector('[data-testid="read-only-badge"]')).toBeNull()
    const create = page.getByRole("button", { name: "New routine" })
    expect(create.element().hasAttribute("disabled")).toBe(false)
  })
})
