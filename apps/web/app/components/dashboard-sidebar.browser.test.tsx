import { createMemoryRouter, RouterProvider } from "react-router"
import { describe, expect, it, vi } from "vitest"
import { render } from "vitest-browser-react"

import "../app.css"
import { DashboardSidebar } from "./dashboard-sidebar.tsx"

const HOME_REPO = "alice/steward-data"
const SHARED_REPO = "acme/steward-team"

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
        name: "steward-data",
        isHome: true,
        private: true,
        collaborators: null,
        viewerIsAdmin: true,
        dashboards: ["main", "test"],
      },
      {
        repo: SHARED_REPO,
        name: "steward-team",
        isHome: false,
        private: false,
        collaborators: [
          { login: "alice", avatarUrl: "https://avatars.test/alice" },
          { login: "bob", avatarUrl: "https://avatars.test/bob" },
        ],
        viewerIsAdmin: false,
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

  it("withholds the menu from every repo's default board, not just home", async () => {
    // A shared repo's `main` is its owner's default board — deleting it is
    // cross-user data loss, so no repo's `main` gets a delete menu (matches
    // the server guard). Give the shared repo a `main` and assert no `main`
    // row anywhere carries a menu.
    await renderSidebar({
      sidebar: {
        repos: [
          base.sidebar.repos[0],
          { ...base.sidebar.repos[1], dashboards: ["main", "ops"] },
        ],
        complete: true,
      },
    })
    const mainRows = [...document.querySelectorAll("a")].filter(
      (a) => a.textContent?.trim() === "main",
    )
    expect(mainRows.length).toBe(2)
    for (const row of mainRows) {
      expect(
        row.parentElement?.querySelector(
          'button[aria-label="Dashboard options"]',
        ),
      ).toBeNull()
    }
    // The shared repo's non-default board still deletes.
    expect(menuButton("ops")).not.toBeNull()
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

/** A repo group header — carries its repo as the tooltip. */
const groupHeader = (repo: string): HTMLElement | null =>
  document.querySelector<HTMLElement>(`nav div[title="${repo}"]`)

const createFirstRow = (): HTMLButtonElement | null =>
  [...document.querySelectorAll("button")].find(
    (el) => el.textContent?.trim() === "Create the first dashboard",
  ) ?? null

describe("DashboardSidebar repo groups", () => {
  it("renders one group per discovered repo, home labeled Personal", async () => {
    await renderSidebar()
    expect(groupHeader(HOME_REPO)?.textContent).toContain("Personal")
    expect(groupHeader(SHARED_REPO)?.textContent).toContain("steward-team")
  })

  it("carries repo identity: visibility glyph and collaborator count", async () => {
    await renderSidebar()

    // Home: private lock; solo (collaborators null) — glyph only, no count,
    // and no avatars anywhere in the rail (people live in the popover now).
    const home = groupHeader(HOME_REPO)
    expect(home?.querySelector('[data-testid="repo-private"]')).not.toBeNull()
    expect(home?.querySelector('[data-slot="avatar"]')).toBeNull()
    expect(home?.textContent).not.toContain("2")

    // Shared: public globe plus the people count on the trigger.
    const shared = groupHeader(SHARED_REPO)
    expect(shared?.querySelector('[data-testid="repo-public"]')).not.toBeNull()
    expect(
      shared?.querySelector('[data-slot="popover-trigger"]')?.textContent,
    ).toContain("2")
  })

  it("opens an access popover: visibility, people, GitHub link", async () => {
    await renderSidebar()

    // Home (admin, solo): slug, visibility in words, no list, settings link.
    groupHeader(HOME_REPO)
      ?.querySelector<HTMLButtonElement>('[data-slot="popover-trigger"]')
      ?.click()
    await vi.waitFor(() =>
      expect(
        document.querySelector('[data-slot="popover-content"]'),
      ).not.toBeNull(),
    )
    const homePop = document.querySelector('[data-slot="popover-content"]')
    expect(homePop?.textContent).toContain(HOME_REPO)
    expect(homePop?.textContent).toContain("collaborators only")
    expect(homePop?.querySelector("ul")).toBeNull()
    expect(
      homePop?.querySelector(
        `a[href="https://github.com/${HOME_REPO}/settings/access"]`,
      ),
    ).not.toBeNull()
    document.body.click() // dismiss
    await vi.waitFor(() =>
      expect(
        document.querySelector('[data-slot="popover-content"]'),
      ).toBeNull(),
    )

    // Shared (reader): both collaborators listed readably, plain repo link.
    groupHeader(SHARED_REPO)
      ?.querySelector<HTMLButtonElement>('[data-slot="popover-trigger"]')
      ?.click()
    await vi.waitFor(() =>
      expect(
        document.querySelector('[data-slot="popover-content"]'),
      ).not.toBeNull(),
    )
    const sharedPop = document.querySelector('[data-slot="popover-content"]')
    expect(sharedPop?.textContent).toContain("alice")
    expect(sharedPop?.textContent).toContain("bob")
    expect(
      sharedPop?.querySelector(`a[href="https://github.com/${SHARED_REPO}"]`),
    ).not.toBeNull()
  })

  it("falls back to a bare GitHub link when metadata is fully degraded", async () => {
    // Visibility unknown and collaborators unlistable — nothing to disclose,
    // so no popover trigger; the plain jump to GitHub remains.
    await renderSidebar({
      sidebar: {
        repos: [
          base.sidebar.repos[0],
          {
            ...base.sidebar.repos[1],
            private: null,
            collaborators: null,
            viewerIsAdmin: null,
          },
        ],
        complete: true,
      },
    })
    const shared = groupHeader(SHARED_REPO)
    expect(shared?.querySelector('[data-slot="popover-trigger"]')).toBeNull()
    expect(
      shared?.querySelector(`a[href="https://github.com/${SHARED_REPO}"]`),
    ).not.toBeNull()
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
    expect(groupHeader(SHARED_REPO)).not.toBeNull()
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
