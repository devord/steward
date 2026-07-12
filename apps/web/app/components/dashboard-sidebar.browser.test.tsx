import { createMemoryRouter, RouterProvider } from "react-router"
import { describe, expect, it, vi } from "vitest"
import { render } from "vitest-browser-react"

import "../app.css"
import { DashboardSidebar } from "./dashboard-sidebar.tsx"

const HOME_REPO = "alice/bulletin-data"
const SHARED_REPO = "acme/bulletin-team"

const base = {
  dataRepo: HOME_REPO,
  activeRepo: HOME_REPO,
  // `main` is the active board — so `test` and `team-ops` are *not* active,
  // which is exactly the case the per-board menu has to cover.
  dashboardSlug: "main",
  sidebar: {
    repos: [
      {
        repo: HOME_REPO,
        name: "bulletin-data",
        isHome: true,
        private: true,
        dashboards: ["main", "test"],
      },
      {
        repo: SHARED_REPO,
        name: "bulletin-team",
        isHome: false,
        private: true,
        dashboards: ["team-ops"],
      },
    ],
    complete: true,
  },
  login: "alice",
  displayName: "Alice",
}

/** The board rows are `<a>` per slug; each row's `⋯` trigger is its sibling
    button inside the same row wrapper. */
const menuButton = (slug: string): HTMLButtonElement | null => {
  const link = [...document.querySelectorAll("a")].find(
    (a) => a.textContent?.trim() === slug,
  )
  const row = link?.parentElement ?? null
  return (
    row?.querySelector<HTMLButtonElement>(
      'button[aria-label="Dashboard options"]',
    ) ?? null
  )
}

const requireMenuButton = (slug: string): HTMLButtonElement => {
  const btn = menuButton(slug)
  if (!btn) throw new Error(`no menu button for board "${slug}"`)
  return btn
}

const menuItem = (label: string): HTMLElement | null =>
  [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (el) => el.textContent?.trim() === label,
  ) ?? null

const requireMenuItem = (label: string): HTMLElement => {
  const item = menuItem(label)
  if (!item) throw new Error(`no menu item "${label}"`)
  return item
}

async function renderSidebar(
  over: Partial<Parameters<typeof DashboardSidebar>[0]> = {},
) {
  const onDeleteBoard = vi.fn<(repo: string, slug: string) => void>()
  // AccountMenu's sign-out uses useSubmit, which needs a data router.
  const router = createMemoryRouter([
    {
      path: "/",
      element: (
        <DashboardSidebar {...base} onDeleteBoard={onDeleteBoard} {...over} />
      ),
    },
  ])
  await render(<RouterProvider router={router} />)
  return { onDeleteBoard }
}

describe("DashboardSidebar per-board menu", () => {
  it("shows a menu on every deletable board, active or not", async () => {
    await renderSidebar()

    // A board you haven't switched to still carries its menu — the whole point
    // of the change. And it's persistent, not opacity-gated on hover/active.
    const inactive = requireMenuButton("test")
    expect(getComputedStyle(inactive).opacity).toBe("1")

    // Shared repos' boards are all deletable too.
    expect(menuButton("team-ops")).not.toBeNull()
  })

  it("withholds the menu from the home default board", async () => {
    await renderSidebar()
    // `main` must always exist (it backs `/`), so it never offers delete.
    expect(menuButton("main")).toBeNull()
  })

  it("deletes the board the menu belongs to, not the active one", async () => {
    const { onDeleteBoard } = await renderSidebar()

    requireMenuButton("test").click()
    await vi.waitFor(() => expect(menuItem("Delete dashboard")).not.toBeNull())
    requireMenuItem("Delete dashboard").click()

    expect(onDeleteBoard).toHaveBeenCalledTimes(1)
    // The row's own repo+slug, even though `main` is the active board.
    expect(onDeleteBoard).toHaveBeenCalledWith(HOME_REPO, "test")
  })

  it("renders no board menus on chrome pages (no delete handler)", async () => {
    await renderSidebar({ onDeleteBoard: undefined })
    expect(menuButton("test")).toBeNull()
    expect(menuButton("team-ops")).toBeNull()
  })
})

/** A repo group heading — a plain div, so match on exact text. */
const groupHeading = (label: string): HTMLElement | null =>
  [...document.querySelectorAll<HTMLElement>("nav div")].find(
    (el) => el.textContent === label,
  ) ?? null

const createFirstRow = (): HTMLButtonElement | null =>
  [...document.querySelectorAll("button")].find(
    (el) => el.textContent?.trim() === "Create the first dashboard",
  ) ?? null

describe("DashboardSidebar repo groups", () => {
  it("renders one group per discovered repo, home labeled Personal", async () => {
    await renderSidebar()
    expect(groupHeading("Personal")).not.toBeNull()
    expect(groupHeading("bulletin-team")).not.toBeNull()
  })

  it("keeps an empty repo's group with a create-first row", async () => {
    // [] is "repo alive, zero boards" — the state after deleting the last
    // board. The group must not vanish with it.
    await renderSidebar({
      sidebar: {
        repos: [
          base.sidebar.repos[0],
          { ...base.sidebar.repos[1], dashboards: [] },
        ],
        complete: true,
      },
    })
    expect(groupHeading("bulletin-team")).not.toBeNull()
    expect(createFirstRow()).not.toBeNull()
  })

  it("opens the new-dashboard dialog pre-targeted at the empty repo", async () => {
    await renderSidebar({
      sidebar: {
        repos: [
          base.sidebar.repos[0],
          { ...base.sidebar.repos[1], dashboards: [] },
        ],
        complete: true,
      },
    })
    createFirstRow()?.click()

    await vi.waitFor(() =>
      expect(document.querySelector('[role="dialog"]')).not.toBeNull(),
    )
    // The repo field renders (two repos are offered) and starts on the
    // empty repo the row belongs to.
    const value = document.querySelector('[data-slot="select-value"]')
    expect(value?.textContent ?? "").toContain(SHARED_REPO)
  })

  it("notes when discovery degraded instead of hiding it", async () => {
    await renderSidebar({
      sidebar: { repos: [base.sidebar.repos[0]], complete: false },
    })
    expect(
      [...document.querySelectorAll("nav p")].some((el) =>
        (el.textContent ?? "").includes("may be missing"),
      ),
    ).toBe(true)
  })
})
