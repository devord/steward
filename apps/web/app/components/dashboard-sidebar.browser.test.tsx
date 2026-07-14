import { cdp } from "vitest/browser"
import { createMemoryRouter, RouterProvider } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { render } from "vitest-browser-react"

import "../app.css"
import { DashboardSidebar } from "./dashboard-sidebar.tsx"
import { DRAFT_EVENT, DRAFT_KEY_PREFIX } from "../lib/draft.ts"
import {
  PENDING_RUN_EVENT,
  PENDING_RUN_KEY_PREFIX,
} from "../lib/pending-runs.ts"

const HOME_REPO = "alice/steward-data"
const SHARED_REPO = "acme/steward-team"

const base = {
  activeRepo: HOME_REPO,
  // `main` is the active board — so `test` and `team-ops` are *not* active,
  // which is exactly the case the per-board menu has to cover.
  dashboardSlug: "main",
  sidebar: {
    repos: [
      {
        repo: HOME_REPO,
        name: "steward-data",
        displayName: null,
        isHome: true,
        private: true,
        collaborators: null,
        viewerIsAdmin: true,
        viewerCanPush: true,
        groups: [],
        dashboards: [
          {
            slug: "main",
            name: null,
            group: null,
            lastRunAt: null,
            stale: false,
          },
          {
            slug: "test",
            name: null,
            group: null,
            lastRunAt: null,
            stale: false,
          },
        ],
      },
      {
        repo: SHARED_REPO,
        name: "steward-team",
        displayName: null,
        isHome: false,
        private: false,
        collaborators: [
          { login: "alice", avatarUrl: "https://avatars.test/alice" },
          { login: "bob", avatarUrl: "https://avatars.test/bob" },
        ],
        viewerIsAdmin: false,
        viewerCanPush: false,
        groups: [],
        dashboards: [
          {
            slug: "team-ops",
            name: null,
            group: null,
            lastRunAt: null,
            stale: false,
          },
        ],
      },
    ],
    complete: true,
    degraded: false,
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
  const onRenameBoard =
    vi.fn<(repo: string, slug: string, name: string | null) => void>()
  // AccountMenu's sign-out uses useSubmit, which needs a data router.
  const router = createMemoryRouter([
    {
      path: "/",
      element: (
        <DashboardSidebar
          {...base}
          onDeleteBoard={onDeleteBoard}
          onRenameBoard={onRenameBoard}
          {...over}
        />
      ),
    },
  ])
  await render(<RouterProvider router={router} />)
  return { onDeleteBoard, onRenameBoard }
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

  it("withholds delete (but not rename) from every repo's default board", async () => {
    // A shared repo's `main` is its owner's default board — deleting it is
    // cross-user data loss, so no repo's `main` offers Delete (matches the
    // server guard). Renaming is display-name only, so `main` keeps its menu
    // with Rename alone.
    await renderSidebar({
      sidebar: {
        repos: [
          base.sidebar.repos[0],
          {
            ...base.sidebar.repos[1],
            dashboards: [
              {
                slug: "main",
                name: null,
                group: null,
                lastRunAt: null,
                stale: false,
              },
              {
                slug: "ops",
                name: null,
                group: null,
                lastRunAt: null,
                stale: false,
              },
            ],
          },
        ],
        complete: true,
        degraded: false,
      },
    })
    requireMenuButton("main").click()
    await vi.waitFor(() => expect(menuItem("Edit dashboard")).not.toBeNull())
    expect(menuItem("Delete dashboard")).toBeNull()
    // Selecting an item closes the menu — the cleanest dismiss the dropdown
    // offers in this harness (body clicks don't reach its outside-press layer).
    requireMenuItem("Edit dashboard").click()
    await vi.waitFor(() => expect(menuItem("Edit dashboard")).toBeNull())

    // The shared repo's non-default board still offers both.
    requireMenuButton("ops").click()
    await vi.waitFor(() => expect(menuItem("Delete dashboard")).not.toBeNull())
    expect(menuItem("Edit dashboard")).not.toBeNull()
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

  it("renames the board the menu belongs to, passing its current name", async () => {
    const { onRenameBoard } = await renderSidebar({
      sidebar: {
        repos: [
          {
            ...base.sidebar.repos[0],
            dashboards: [
              {
                slug: "main",
                name: null,
                group: null,
                lastRunAt: null,
                stale: false,
              },
              {
                slug: "test",
                name: "Test Ops",
                group: null,
                lastRunAt: null,
                stale: false,
              },
            ],
          },
          base.sidebar.repos[1],
        ],
        complete: true,
        degraded: false,
      },
    })

    requireMenuButton("Test Ops").click()
    await vi.waitFor(() => expect(menuItem("Edit dashboard")).not.toBeNull())
    requireMenuItem("Edit dashboard").click()

    expect(onRenameBoard).toHaveBeenCalledTimes(1)
    // The row's own repo+slug+name — the dialog prefill.
    expect(onRenameBoard).toHaveBeenCalledWith(HOME_REPO, "test", "Test Ops")
  })

  it("shows the display name when set, the slug otherwise", async () => {
    await renderSidebar({
      sidebar: {
        repos: [
          {
            ...base.sidebar.repos[0],
            dashboards: [
              {
                slug: "main",
                name: null,
                group: null,
                lastRunAt: null,
                stale: false,
              },
              {
                slug: "test",
                name: "Test Ops",
                group: null,
                lastRunAt: null,
                stale: false,
              },
            ],
          },
          base.sidebar.repos[1],
        ],
        complete: true,
        degraded: false,
      },
    })
    const labels = [...document.querySelectorAll("nav a")].map((a) =>
      a.textContent?.trim(),
    )
    expect(labels).toContain("Test Ops")
    expect(labels).not.toContain("test")
    // Unnamed boards keep their slug.
    expect(labels).toContain("main")
  })

  it("renders no board menus on chrome pages (no handlers)", async () => {
    await renderSidebar({ onDeleteBoard: undefined, onRenameBoard: undefined })
    expect(menuButton("test")).toBeNull()
    expect(menuButton("team-ops")).toBeNull()
  })
})

const sectionLabels = (): string[] =>
  [...document.querySelectorAll('[data-testid="rail-section"]')].map(
    (el) => el.textContent?.trim() ?? "",
  )

describe("DashboardSidebar sections", () => {
  it("renders no section labels when no board is grouped", async () => {
    await renderSidebar()
    expect(sectionLabels()).toEqual([])
  })

  it("groups boards under section labels in the repo's authored order", async () => {
    await renderSidebar({
      sidebar: {
        repos: [
          {
            ...base.sidebar.repos[0],
            // Authored order is Projects-before-Clients — not alphabetical,
            // and not the order the boards are listed in.
            groups: ["Projects", "Clients"],
            dashboards: [
              {
                slug: "main",
                name: null,
                group: null,
                lastRunAt: null,
                stale: false,
              },
              {
                slug: "corza",
                name: "Corza",
                group: "Clients",
                lastRunAt: null,
                stale: false,
              },
              {
                slug: "steward",
                name: "Steward",
                group: "Projects",
                lastRunAt: null,
                stale: false,
              },
            ],
          },
          base.sidebar.repos[1],
        ],
        complete: true,
        degraded: false,
      },
    })
    expect(sectionLabels()).toEqual(["Projects", "Clients"])
    // The ungrouped board still renders (leads, unlabeled).
    const labels = [...document.querySelectorAll("nav a")].map((a) =>
      a.textContent?.trim(),
    )
    expect(labels).toEqual(expect.arrayContaining(["main", "Corza", "Steward"]))
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

  it("prefers the display name from repo.yaml over Personal / the slug", async () => {
    await renderSidebar({
      sidebar: {
        repos: [
          { ...base.sidebar.repos[0], displayName: "Form Factory" },
          base.sidebar.repos[1],
        ],
        complete: true,
        degraded: false,
      },
    })
    const header = groupHeader(HOME_REPO)
    expect(header?.textContent).toContain("Form Factory")
    expect(header?.textContent).not.toContain("Personal")
    // The slug survives on the row itself (title attr = the selector above).
    expect(header).not.toBeNull()
  })

  it("offers rename to pushers only, inside the access popover", async () => {
    await renderSidebar()

    // Home (push access): the popover carries the display-name input.
    groupHeader(HOME_REPO)
      ?.querySelector<HTMLButtonElement>('[data-slot="popover-trigger"]')
      ?.click()
    await vi.waitFor(() =>
      expect(
        document.querySelector('[data-slot="popover-content"]'),
      ).not.toBeNull(),
    )
    expect(
      document.querySelector('[data-slot="popover-content"] input'),
    ).not.toBeNull()
    document.body.click() // dismiss
    await vi.waitFor(() =>
      expect(
        document.querySelector('[data-slot="popover-content"]'),
      ).toBeNull(),
    )

    // Shared as a plain reader (no push): no rename form.
    groupHeader(SHARED_REPO)
      ?.querySelector<HTMLButtonElement>('[data-slot="popover-trigger"]')
      ?.click()
    await vi.waitFor(() =>
      expect(
        document.querySelector('[data-slot="popover-content"]'),
      ).not.toBeNull(),
    )
    expect(
      document.querySelector('[data-slot="popover-content"] input'),
    ).toBeNull()
  })

  it("carries repo identity: visibility glyph and collaborator count", async () => {
    await renderSidebar()

    // Home: private lock; solo (collaborators null) — glyph only, no count,
    // and no avatars anywhere in the rail (people live in the popover now).
    const home = groupHeader(HOME_REPO)
    expect(home?.querySelector('[data-testid="repo-private"]')).not.toBeNull()
    expect(home?.querySelector('[data-slot="avatar"]')).toBeNull()
    expect(home?.textContent).not.toContain("2")

    // Shared: public globe plus the people count — both in the status
    // cluster, which is not the control (the ⋯ popover-trigger sits beside it).
    const shared = groupHeader(SHARED_REPO)
    const status = shared?.querySelector('[data-testid="repo-status"]')
    expect(status?.querySelector('[data-testid="repo-public"]')).not.toBeNull()
    expect(status?.textContent).toContain("2")
  })

  it("sets the group ⋯ glyph on the board rows' ⋯ column", async () => {
    // The header teaches the same ⋯ idiom the board rows carry one line
    // down — same glyph, one column. The buttons rest invisible, so it's
    // the glyphs' optical centers that must align, not the box edges
    // (the header button is size-5 against the rows' size-6).
    await renderSidebar()
    const headerGlyph = groupHeader(HOME_REPO)
      ?.querySelector('[data-slot="popover-trigger"] svg')
      ?.getBoundingClientRect()
    const rowGlyph = requireMenuButton("test")
      .querySelector("svg")
      ?.getBoundingClientRect()
    if (!headerGlyph || !rowGlyph) throw new Error("missing a ⋯ glyph")
    expect(headerGlyph.left + headerGlyph.width / 2).toBeCloseTo(
      rowGlyph.left + rowGlyph.width / 2,
      1,
    )
  })

  it("holds the ⋯ column on coarse pointers", async () => {
    // Under pointer-coarse every icon-xs button floors to size-8, which
    // inverts the fine-pointer size-5-vs-size-6 compensation — the header
    // row swaps pr-1.5 for pr-1 to keep both glyphs on one column. This
    // is the mobile drawer's geometry, so it regresses invisibly on
    // desktop; emulate touch to pin it.
    await renderSidebar()
    await cdp().send("Emulation.setTouchEmulationEnabled", {
      enabled: true,
      maxTouchPoints: 1,
    })
    try {
      await vi.waitFor(() =>
        expect(matchMedia("(pointer: coarse)").matches).toBe(true),
      )
      const headerGlyph = groupHeader(HOME_REPO)
        ?.querySelector('[data-slot="popover-trigger"] svg')
        ?.getBoundingClientRect()
      const rowGlyph = requireMenuButton("test")
        .querySelector("svg")
        ?.getBoundingClientRect()
      if (!headerGlyph || !rowGlyph) throw new Error("missing a ⋯ glyph")
      expect(headerGlyph.left + headerGlyph.width / 2).toBeCloseTo(
        rowGlyph.left + rowGlyph.width / 2,
        1,
      )
    } finally {
      await cdp().send("Emulation.setTouchEmulationEnabled", {
        enabled: false,
      })
    }
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
        degraded: false,
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
        degraded: false,
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
        degraded: false,
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

  it("keeps the foot's box stable while the account menu is open", async () => {
    // The account menu is modal, so Base UI parks hidden focus-guard spans
    // beside the trigger while it's open. The foot must lay out with flex
    // gap (out-of-flow children take no slot) — under space-y the guards
    // earned sibling margins and the foot grew, nudging both rows upward.
    await renderSidebar()
    const trigger = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Account"]',
    )
    if (!trigger) throw new Error("no account trigger")
    const foot = trigger.parentElement
    if (!foot) throw new Error("no foot")
    const before = foot.getBoundingClientRect()

    trigger.click()
    await vi.waitFor(() =>
      expect(document.querySelector('[role="menu"]')).not.toBeNull(),
    )

    const after = foot.getBoundingClientRect()
    expect(after.height).toBeCloseTo(before.height, 1)
    expect(after.top).toBeCloseTo(before.top, 1)
  })

  it("notes when discovery degraded instead of hiding it", async () => {
    await renderSidebar({
      sidebar: {
        repos: [base.sidebar.repos[0]],
        complete: false,
        degraded: false,
      },
    })
    expect(
      [...document.querySelectorAll("nav p")].some((el) =>
        (el.textContent ?? "").includes("may be missing"),
      ),
    ).toBe(true)
  })
})

/** The board/pool row containing `label`, or null. */
const rowFor = (label: string): HTMLAnchorElement | null =>
  [...document.querySelectorAll<HTMLAnchorElement>("nav a")].find((a) =>
    (a.textContent ?? "").includes(label),
  ) ?? null

const draftDots = (row: HTMLElement | null) =>
  row?.querySelectorAll('[data-testid="rail-draft"]').length ?? 0

const runningDots = (row: HTMLElement | null) =>
  row?.querySelectorAll('[data-testid="rail-running"]').length ?? 0

describe("DashboardSidebar state markers", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("marks boards and the pool with unsynced drafts, and only those", async () => {
    // A board draft, on a board that is NOT active — the whole point: unsynced
    // work is visible without switching to it. Payload content is irrelevant
    // to the rail; only the key's existence is read.
    localStorage.setItem(`${DRAFT_KEY_PREFIX}${HOME_REPO}:test`, "{}")
    // The repo pool's own draft (ADR-0025) marks the Routines row.
    localStorage.setItem(`${DRAFT_KEY_PREFIX}${SHARED_REPO}:__routines__`, "{}")
    await renderSidebar()

    await vi.waitFor(() => expect(draftDots(rowFor("test"))).toBe(1))
    expect(draftDots(rowFor("main"))).toBe(0)
    expect(draftDots(rowFor("team-ops"))).toBe(0)

    // Exactly one Routines row marked: the shared repo's.
    const routineRows = [
      ...document.querySelectorAll<HTMLAnchorElement>("nav a"),
    ].filter((a) => (a.textContent ?? "").includes("Routines"))
    expect(routineRows.map((row) => draftDots(row))).toEqual([0, 1])

    // The marker names its state for readers, not color alone.
    expect(rowFor("test")?.textContent).toContain("Unsynced changes")
  })

  it("marks the repo's Routines row while a client-fired run is in flight", async () => {
    localStorage.setItem(
      `${PENDING_RUN_KEY_PREFIX}${HOME_REPO}:repo-pulse`,
      JSON.stringify({ firedAt: Date.now(), sha: null }),
    )
    await renderSidebar()

    const routineRows = [
      ...document.querySelectorAll<HTMLAnchorElement>("nav a"),
    ].filter((a) => (a.textContent ?? "").includes("Routines"))
    await vi.waitFor(() =>
      expect(routineRows.map((row) => runningDots(row))).toEqual([1, 0]),
    )
    expect(routineRows[0]?.textContent).toContain("Run in flight")
    // Board rows never claim "running" — runs belong to the pool.
    expect(runningDots(rowFor("main"))).toBe(0)
  })

  it("ignores a run mark that has already timed out", async () => {
    localStorage.setItem(
      `${PENDING_RUN_KEY_PREFIX}${HOME_REPO}:repo-pulse`,
      JSON.stringify({ firedAt: Date.now() - 11 * 60_000, sha: null }),
    )
    await renderSidebar()
    // Give the hydration scan a tick, then assert nothing lit up.
    await vi.waitFor(() => expect(rowFor("main")).not.toBeNull())
    expect(
      document.querySelectorAll('[data-testid="rail-running"]').length,
    ).toBe(0)
  })

  it("updates live on the draft and pending-run change events", async () => {
    await renderSidebar()
    await vi.waitFor(() => expect(rowFor("test")).not.toBeNull())
    expect(draftDots(rowFor("test"))).toBe(0)

    // A draft appears (the board's useDraft writes then notifies) …
    localStorage.setItem(`${DRAFT_KEY_PREFIX}${HOME_REPO}:test`, "{}")
    window.dispatchEvent(new Event(DRAFT_EVENT))
    await vi.waitFor(() => expect(draftDots(rowFor("test"))).toBe(1))

    // … and clears on commit/discard.
    localStorage.removeItem(`${DRAFT_KEY_PREFIX}${HOME_REPO}:test`)
    window.dispatchEvent(new Event(DRAFT_EVENT))
    await vi.waitFor(() => expect(draftDots(rowFor("test"))).toBe(0))

    // Same live path for runs.
    localStorage.setItem(
      `${PENDING_RUN_KEY_PREFIX}${HOME_REPO}:repo-pulse`,
      JSON.stringify({ firedAt: Date.now(), sha: null }),
    )
    window.dispatchEvent(new Event(PENDING_RUN_EVENT))
    await vi.waitFor(() =>
      expect(
        document.querySelectorAll('[data-testid="rail-running"]').length,
      ).toBe(1),
    )
  })
})

describe("DashboardSidebar freshness (ADR-0035)", () => {
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString()
  const HOUR = 3600_000

  it("marks each board's freshness with a dot and an age", async () => {
    // No active board here, so the freshness colours show rather than the
    // active-accent override.
    await renderSidebar({
      activeRepo: "nobody/none",
      dashboardSlug: "none",
      sidebar: {
        repos: [
          {
            ...base.sidebar.repos[0],
            dashboards: [
              {
                slug: "fresh",
                name: "Fresh",
                group: null,
                lastRunAt: ago(2 * HOUR),
                stale: false,
              },
              {
                slug: "old",
                name: "Old",
                group: null,
                lastRunAt: ago(6 * 24 * HOUR),
                stale: true,
              },
              {
                slug: "new",
                name: "New",
                group: null,
                lastRunAt: null,
                stale: false,
              },
            ],
          },
        ],
        complete: true,
        degraded: false,
      },
    })

    // One dot per board, in render order, coloured by state.
    const dots = [
      ...document.querySelectorAll('[data-testid="freshness-dot"]'),
    ].map((d) => d.getAttribute("data-freshness"))
    expect(dots).toEqual(["fresh", "stale", "unknown"])

    // Ages read for known boards; the unknown board shows none.
    expect(document.body.textContent).toContain("2h")
    expect(document.body.textContent).toContain("6d")
    // The stale board names its state for readers, never colour alone.
    expect(document.body.textContent).toContain("Stale")
  })

  it("overrides freshness with the accent on the active board", async () => {
    // base's active board is HOME_REPO/main — give it a fresh timestamp and it
    // must still read "active", not "fresh" (you-are-here outranks freshness).
    await renderSidebar({
      sidebar: {
        repos: [
          {
            ...base.sidebar.repos[0],
            dashboards: [
              {
                slug: "main",
                name: null,
                group: null,
                lastRunAt: ago(HOUR),
                stale: false,
              },
            ],
          },
          base.sidebar.repos[1],
        ],
        complete: true,
        degraded: false,
      },
    })
    const active = document.querySelector(
      '[data-testid="freshness-dot"][data-freshness="active"]',
    )
    expect(active).not.toBeNull()
  })
})
