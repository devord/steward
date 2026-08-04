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
  PENDING_TIMEOUT_MS,
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
        sections: [],
        dashboards: [
          {
            slug: "main",
            section: null,
            lastRunAt: null,
            stale: false,
          },
          {
            slug: "test",
            section: null,
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
        sections: [],
        dashboards: [
          {
            slug: "team-ops",
            section: null,
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

/** A board row's link, matched on its *name* span — the row also carries an
    age and an sr-only state phrase (ADR-0035/0058), so its whole textContent
    is never just the slug. */
const boardLink = (slug: string): HTMLAnchorElement | null =>
  [...document.querySelectorAll<HTMLAnchorElement>("nav a")].find(
    (a) => a.firstElementChild?.textContent?.trim() === slug,
  ) ?? null

/** The board rows are `<a>` per slug; each row's `⋯` trigger is its sibling
    button inside the same row wrapper. */
const menuButton = (slug: string): HTMLButtonElement | null => {
  const row = boardLink(slug)?.parentElement ?? null
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
  const onRenameBoard = vi.fn<(repo: string, slug: string) => void>()
  const onRenameSection = vi.fn<(repo: string, section: string) => void>()
  const onDeleteSection = vi.fn<(repo: string, section: string) => void>()
  // AccountMenu's sign-out uses useSubmit, which needs a data router.
  const router = createMemoryRouter([
    {
      path: "/",
      element: (
        <DashboardSidebar
          {...base}
          onDeleteBoard={onDeleteBoard}
          onRenameBoard={onRenameBoard}
          onRenameSection={onRenameSection}
          onDeleteSection={onDeleteSection}
          {...over}
        />
      ),
    },
  ])
  await render(<RouterProvider router={router} />)
  return { onDeleteBoard, onRenameBoard, onRenameSection, onDeleteSection }
}

/** A repo with two named sections — the fixture the section-menu cases drive. */
const groupedOver: Partial<Parameters<typeof DashboardSidebar>[0]> = {
  sidebar: {
    repos: [
      {
        ...base.sidebar.repos[0],
        sections: ["Projects", "Clients"],
        dashboards: [
          { slug: "main", section: null, lastRunAt: null, stale: false },
          { slug: "corza", section: "Clients", lastRunAt: null, stale: false },
          {
            slug: "steward",
            section: "Projects",
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
}

/** The `⋯` trigger inside a section heading, found by the section's label.
    Matched on the label element, not the heading's whole textContent — the
    caption also carries a count (ADR-0048) and a menu glyph. */
const sectionMenuButton = (label: string): HTMLButtonElement | null => {
  const heading = [
    ...document.querySelectorAll<HTMLElement>('[data-testid="rail-section"]'),
  ].find(
    (el) =>
      el
        .querySelector('[data-testid="rail-section-label"]')
        ?.textContent?.trim() === label,
  )
  return (
    heading?.querySelector<HTMLButtonElement>(
      'button[aria-label="Section options"]',
    ) ?? null
  )
}

const requireSectionMenuButton = (label: string): HTMLButtonElement => {
  const btn = sectionMenuButton(label)
  if (!btn) throw new Error(`no menu button for section "${label}"`)
  return btn
}

describe("DashboardSidebar section menu", () => {
  it("renames the section the menu belongs to, passing its repo and name", async () => {
    const { onRenameSection } = await renderSidebar(groupedOver)

    requireSectionMenuButton("Clients").click()
    await vi.waitFor(() => expect(menuItem("Rename section")).not.toBeNull())
    requireMenuItem("Rename section").click()

    expect(onRenameSection).toHaveBeenCalledTimes(1)
    expect(onRenameSection).toHaveBeenCalledWith(HOME_REPO, "Clients")
  })

  it("dissolves the section the menu belongs to", async () => {
    const { onDeleteSection } = await renderSidebar(groupedOver)

    requireSectionMenuButton("Projects").click()
    await vi.waitFor(() => expect(menuItem("Delete section")).not.toBeNull())
    requireMenuItem("Delete section").click()

    expect(onDeleteSection).toHaveBeenCalledTimes(1)
    expect(onDeleteSection).toHaveBeenCalledWith(HOME_REPO, "Projects")
  })

  it("renders no section menu on chrome pages (no handlers)", async () => {
    await renderSidebar({
      ...groupedOver,
      onRenameSection: undefined,
      onDeleteSection: undefined,
    })
    expect(sectionMenuButton("Clients")).toBeNull()
    expect(sectionMenuButton("Projects")).toBeNull()
  })

  it("sets the section ⋯ glyph on the board rows' ⋯ column", async () => {
    // The section caption carries the same ⋯ idiom the board rows do one
    // tier down, so the two glyphs must share a column. The buttons rest
    // invisible — it's the glyphs' optical centers that align, not the box
    // edges (the caption button is size-5 against the rows' size-6).
    await renderSidebar(groupedOver)
    const sectionGlyph = requireSectionMenuButton("Clients")
      .querySelector("svg")
      ?.getBoundingClientRect()
    const rowGlyph = requireMenuButton("corza")
      .querySelector("svg")
      ?.getBoundingClientRect()
    if (!sectionGlyph || !rowGlyph) throw new Error("missing a ⋯ glyph")
    expect(sectionGlyph.left + sectionGlyph.width / 2).toBeCloseTo(
      rowGlyph.left + rowGlyph.width / 2,
      1,
    )
  })

  it("holds the section ⋯ column on coarse pointers", async () => {
    // Under pointer-coarse every icon-xs button floors to size-8, inverting
    // the fine-pointer size-5-vs-size-6 compensation — the caption swaps
    // pr-1.5 for pr-1 to keep both glyphs on one column. This is the mobile
    // drawer's geometry, so pin it the way the repo caption's is pinned.
    await renderSidebar(groupedOver)
    await cdp().send("Emulation.setTouchEmulationEnabled", {
      enabled: true,
      maxTouchPoints: 1,
    })
    try {
      await vi.waitFor(() =>
        expect(matchMedia("(pointer: coarse)").matches).toBe(true),
      )
      const sectionGlyph = requireSectionMenuButton("Clients")
        .querySelector("svg")
        ?.getBoundingClientRect()
      const rowGlyph = requireMenuButton("corza")
        .querySelector("svg")
        ?.getBoundingClientRect()
      if (!sectionGlyph || !rowGlyph) throw new Error("missing a ⋯ glyph")
      expect(sectionGlyph.left + sectionGlyph.width / 2).toBeCloseTo(
        rowGlyph.left + rowGlyph.width / 2,
        1,
      )
    } finally {
      await cdp().send("Emulation.setTouchEmulationEnabled", {
        enabled: false,
      })
    }
  })

  it("vertically centers the section ⋯ in its caption row", async () => {
    // The ⋯ is in-flow in an h-5 row (not an absolute button overhanging an
    // auto-height text line, which sat off-center and pushed the caption's
    // vertical rhythm out of step with the boards).
    await renderSidebar(groupedOver)
    const button = requireSectionMenuButton("Clients")
    const heading = button.closest<HTMLElement>('[data-testid="rail-section"]')
    const svg = button.querySelector("svg")
    if (!heading || !svg)
      throw new Error("missing the section caption or glyph")
    const row = heading.getBoundingClientRect()
    const glyph = svg.getBoundingClientRect()
    expect(glyph.top + glyph.height / 2).toBeCloseTo(
      row.top + row.height / 2,
      0,
    )
  })
})

describe("DashboardSidebar per-board menu", () => {
  it("shows a menu on every deletable board, active or not", async () => {
    await renderSidebar()

    // A board you haven't switched to still carries its menu — the whole point
    // of the change.
    expect(menuButton("test")).not.toBeNull()
    // Shared repos' boards are all deletable too.
    expect(menuButton("team-ops")).not.toBeNull()
  })

  it("rests the ⋯ invisible without giving up its slot or its tab stop", async () => {
    // ADR-0058: nine visible ⋯ down a 200px column was the busiest thing in
    // the rail, so the trigger rests at opacity-0 and appears with the
    // pointer or focus. Two things must survive that: it is `opacity`, never
    // `display`, so the button keeps its box (the age never jumps aside for
    // it) and its tab stop; and `focus-visible` reveals it for keyboard
    // users, who have no hover to trade on.
    await renderSidebar()
    const button = requireMenuButton("test")
    expect(getComputedStyle(button).opacity).toBe("0")
    // Still laid out — a display-toggled control would measure 0×0 and let
    // the trailing column reflow as the pointer crossed it.
    expect(button.getBoundingClientRect().width).toBeGreaterThan(0)

    button.focus()
    await vi.waitFor(() => expect(getComputedStyle(button).opacity).toBe("1"))
  })

  it("keeps the ⋯ visible on coarse pointers, which have no hover", async () => {
    await renderSidebar()
    await cdp().send("Emulation.setTouchEmulationEnabled", {
      enabled: true,
      maxTouchPoints: 1,
    })
    try {
      await vi.waitFor(() =>
        expect(getComputedStyle(requireMenuButton("test")).opacity).toBe("1"),
      )
    } finally {
      await cdp().send("Emulation.setTouchEmulationEnabled", {
        enabled: false,
      })
    }
  })

  it("withholds delete (but not rename) from every repo's default board", async () => {
    // A shared repo's `main` is its owner's default board — deleting it is
    // cross-user data loss, so no repo's `main` offers Delete (matches the
    // server guard). Editing only sets the section, so `main` keeps its menu
    // with Edit alone.
    await renderSidebar({
      sidebar: {
        repos: [
          base.sidebar.repos[0],
          {
            ...base.sidebar.repos[1],
            dashboards: [
              {
                slug: "main",
                section: null,
                lastRunAt: null,
                stale: false,
              },
              {
                slug: "ops",
                section: null,
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

  it("edits the board the menu belongs to, passing its repo and slug", async () => {
    const { onRenameBoard } = await renderSidebar()

    requireMenuButton("test").click()
    await vi.waitFor(() => expect(menuItem("Edit dashboard")).not.toBeNull())
    requireMenuItem("Edit dashboard").click()

    expect(onRenameBoard).toHaveBeenCalledTimes(1)
    // The row's own repo+slug — the dialog looks up the section itself.
    expect(onRenameBoard).toHaveBeenCalledWith(HOME_REPO, "test")
  })

  it("labels every board by its slug (ADR-0039)", async () => {
    await renderSidebar()
    const labels = [...document.querySelectorAll("nav a")].map((a) =>
      a.textContent?.trim(),
    )
    expect(labels).toEqual(expect.arrayContaining(["main", "test", "team-ops"]))
  })

  it("renders no board menus on chrome pages (no handlers)", async () => {
    await renderSidebar({ onDeleteBoard: undefined, onRenameBoard: undefined })
    expect(menuButton("test")).toBeNull()
    expect(menuButton("team-ops")).toBeNull()
  })
})

const sectionLabels = (): string[] =>
  [...document.querySelectorAll('[data-testid="rail-section-label"]')].map(
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
            sections: ["Projects", "Clients"],
            dashboards: [
              {
                slug: "main",
                section: null,
                lastRunAt: null,
                stale: false,
              },
              {
                slug: "corza",
                section: "Clients",
                lastRunAt: null,
                stale: false,
              },
              {
                slug: "steward",
                section: "Projects",
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
    expect(labels).toEqual(expect.arrayContaining(["main", "corza", "steward"]))
  })
})

/** A repo group header — carries its repo as the tooltip. */
const groupHeader = (repo: string): HTMLElement | null =>
  document.querySelector<HTMLElement>(`nav div[title="${repo}"]`)

const createFirstRow = (): HTMLButtonElement | null =>
  [...document.querySelectorAll("button")].find(
    (el) => el.textContent?.trim() === "Create a dashboard",
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

  it("offers rename to pushers only, as a dialog off the access popover", async () => {
    await renderSidebar()

    // Home (push access): the popover offers a Rename action, not an inline
    // field — editing is a write, kept off the read-only sharing disclosure.
    groupHeader(HOME_REPO)
      ?.querySelector<HTMLButtonElement>('[data-slot="popover-trigger"]')
      ?.click()
    const homePop = await vi.waitFor(() => {
      const pop = document.querySelector('[data-slot="popover-content"]')
      if (!pop) throw new Error("popover not open")
      return pop
    })
    // No inline input lives in the sharing panel anymore.
    expect(homePop.querySelector("input")).toBeNull()
    const renameBtn = [...homePop.querySelectorAll("button")].find((b) =>
      /rename repo/i.test(b.textContent ?? ""),
    )
    expect(renameBtn).toBeTruthy()

    // Launching it closes the popover and opens the rename dialog with a field.
    renameBtn?.click()
    await vi.waitFor(() =>
      expect(document.querySelector('[role="dialog"] input')).not.toBeNull(),
    )

    // Dismiss the dialog (its Cancel button) before probing the other repo.
    ;[
      ...(document.querySelectorAll<HTMLButtonElement>(
        '[role="dialog"] button',
      ) ?? []),
    ]
      .find((b) => /cancel/i.test(b.textContent ?? ""))
      ?.click()
    await vi.waitFor(() =>
      expect(document.querySelector('[role="dialog"]')).toBeNull(),
    )

    // Shared as a plain reader (no push): no rename action at all.
    groupHeader(SHARED_REPO)
      ?.querySelector<HTMLButtonElement>('[data-slot="popover-trigger"]')
      ?.click()
    const sharedPop = await vi.waitFor(() => {
      const pop = document.querySelector('[data-slot="popover-content"]')
      if (!pop) throw new Error("popover not open")
      return pop
    })
    expect(
      [...sharedPop.querySelectorAll("button")].find((b) =>
        /rename repo/i.test(b.textContent ?? ""),
      ),
    ).toBeUndefined()
  })

  it("carries repo identity: a single exposure glyph, no bare count", async () => {
    await renderSidebar()

    // Home: private, solo (collaborators null) — the lock; no avatars in the
    // rail and no floating number anywhere (people live in the popover now).
    const home = groupHeader(HOME_REPO)
    expect(home?.querySelector('[data-testid="repo-private"]')).not.toBeNull()
    expect(home?.querySelector('[data-slot="avatar"]')).toBeNull()
    expect(home?.textContent).not.toContain("2")

    // Shared but public: the globe wins the ladder — "anyone can see it"
    // subsumes the collaborator count, so the rail shows no "2". The count
    // still reaches screen readers via the sr-only label beside the name.
    const shared = groupHeader(SHARED_REPO)
    expect(shared?.querySelector('[data-testid="repo-public"]')).not.toBeNull()
    expect(shared?.querySelector('[data-testid="repo-shared"]')).toBeNull()
    expect(shared?.textContent).toContain("2 people have access")
  })

  it("leads the caption with the exposure glyph, ranked public → shared → private", async () => {
    // ADR-0058 gave the rail's glyph column to the exposure ladder, because
    // `FolderGit2` was identical on every repo — decoration holding the one
    // slot that has to tell a repo caption from a section caption.
    //
    // Order is the ladder, not a null-check convenience: a *private* repo six
    // people can push to is `Users`, not `Lock`. Reading `private` first
    // showed a padlock on every shared team repo.
    await renderSidebar({
      sidebar: {
        repos: [
          {
            ...base.sidebar.repos[0],
            private: true,
            collaborators: [
              { login: "alice", avatarUrl: "" },
              { login: "bob", avatarUrl: "" },
            ],
          },
          base.sidebar.repos[1],
        ],
        complete: true,
        degraded: false,
      },
    })
    const home = groupHeader(HOME_REPO)
    expect(home?.querySelector('[data-testid="repo-shared"]')).not.toBeNull()
    expect(home?.querySelector('[data-testid="repo-private"]')).toBeNull()
  })

  it("falls back to the folder glyph when there is no exposure to report", async () => {
    // The tier must never lose its leading glyph: without one, a repo caption
    // is an 11px tracked-caps label at the same x as a section caption, and
    // neither reads as the parent of the other.
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
    expect(shared?.querySelector('[data-testid="repo-glyph"]')).not.toBeNull()
  })

  it("reaches the repo's routines from its caption, not from a row", async () => {
    // ADR-0058 moved the pool (ADR-0025) into the caption's trailing cluster:
    // it is repo-scoped furniture, and as a row it cost a full row per repo.
    await renderSidebar()
    const link = groupHeader(HOME_REPO)?.querySelector<HTMLAnchorElement>(
      `a[href*="${HOME_REPO}"]`,
    )
    expect(link?.getAttribute("href")).toContain("routines")
    // Its accessible name names the repo — "Routines" alone repeats once per
    // group with nothing to tell the two apart.
    expect(link?.textContent).toContain(HOME_REPO)
    // And it is gone from the board list.
    expect(
      [...document.querySelectorAll("nav a")].filter(
        (a) => a.firstElementChild?.textContent?.trim() === "Routines",
      ),
    ).toHaveLength(0)
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

  it("hangs the foot's actions on the boards' marker column", async () => {
    // The rail has one glyph column: every glyph — the repo caption's
    // exposure mark, the group spine, "New dashboard" — centers on it. The
    // foot must join it, so "Add data repo" and the account avatar sit on the
    // same line as the glyphs above them, not outdented in their own gutter.
    await renderSidebar()
    const centerX = (el: Element | null | undefined) => {
      if (!el) throw new Error("missing an element to measure")
      const r = el.getBoundingClientRect()
      return r.left + r.width / 2
    }
    const spine = centerX(
      document.querySelector('[data-testid="repo-private"]'),
    )
    const addRepo = [...document.querySelectorAll("button")]
      .find((b) => b.textContent?.trim() === "Add data repo")
      ?.querySelector("svg")
    const avatar = document.querySelector('[data-slot="avatar"]')
    expect(centerX(addRepo)).toBeCloseTo(spine, 0)
    expect(centerX(avatar)).toBeCloseTo(spine, 0)
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

/** The board row containing `label`, or null. */
const rowFor = (label: string): HTMLAnchorElement | null =>
  [...document.querySelectorAll<HTMLAnchorElement>("nav a")].find((a) =>
    (a.textContent ?? "").includes(label),
  ) ?? null

/** A repo's caption — where its routines control lives (ADR-0058). */
const captionFor = (repo: string): HTMLElement | null =>
  document.querySelector<HTMLElement>(`nav div[title="${repo}"]`)

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

    // The pool's draft rides its repo's caption now that the pool is a
    // control there rather than a row (ADR-0058) — and only that repo's.
    expect(draftDots(captionFor(SHARED_REPO))).toBe(1)
    expect(draftDots(captionFor(HOME_REPO))).toBe(0)

    // The marker names its state for readers, not color alone — and the
    // pool's says which state, since it sits on a caption rather than beside
    // the word "Routines".
    expect(rowFor("test")?.textContent).toContain("Unsynced changes")
    expect(captionFor(SHARED_REPO)?.textContent).toContain(
      "Routines have unsynced changes",
    )
  })

  it("marks the repo's routines control while a client-fired run is in flight", async () => {
    localStorage.setItem(
      `${PENDING_RUN_KEY_PREFIX}${HOME_REPO}:repo-pulse`,
      JSON.stringify({ firedAt: Date.now(), sha: null }),
    )
    await renderSidebar()

    await vi.waitFor(() => expect(runningDots(captionFor(HOME_REPO))).toBe(1))
    expect(runningDots(captionFor(SHARED_REPO))).toBe(0)
    expect(captionFor(HOME_REPO)?.textContent).toContain("Run in flight")
    // Board rows never claim "running" — runs belong to the pool.
    expect(runningDots(rowFor("main"))).toBe(0)
  })

  it("ignores a run mark that has already timed out", async () => {
    localStorage.setItem(
      `${PENDING_RUN_KEY_PREFIX}${HOME_REPO}:repo-pulse`,
      JSON.stringify({
        // Older than the pending-run window, so the hydration scan drops it.
        // Derived from the constant so a window change can't silently strand
        // this test at a stale threshold.
        firedAt: Date.now() - PENDING_TIMEOUT_MS - 60_000,
        sha: null,
      }),
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

  it("reports freshness as the age alone, pilling only what is overdue", async () => {
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
                section: null,
                lastRunAt: ago(2 * HOUR),
                stale: false,
              },
              {
                slug: "old",
                section: null,
                lastRunAt: ago(6 * 24 * HOUR),
                stale: true,
              },
              {
                slug: "new",
                section: null,
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

    // ADR-0058: no marker on a fresh row. The dot was green on nearly every
    // board — the idle state wearing a colour — while the board itself
    // already rules the opposite way for the same fact (a fresh tile carries
    // no pill). The age was beside it the whole time and says more.
    // One plain age, on the one fresh board: the overdue one spends its slot
    // on the pill instead, and the never-run one has nothing to report.
    expect(document.querySelectorAll('[data-testid="rail-age"]')).toHaveLength(
      1,
    )
    expect(rowFor("fresh")?.textContent).toContain("2h")

    // Only the overdue board carries colour, in the widget card's own stale
    // pill — one vocabulary for one fact across rail and board.
    const pills = document.querySelectorAll('[data-testid="rail-stale"]')
    expect(pills).toHaveLength(1)
    expect(pills[0]?.textContent).toBe("6d")
    expect(
      rowFor("old")?.querySelector('[data-testid="rail-stale"]'),
    ).not.toBeNull()

    // A board that has never run shows nothing at all, not a faint dot.
    expect(rowFor("new")?.querySelector('[data-testid="rail-age"]')).toBeNull()
    expect(
      rowFor("new")?.querySelector('[data-testid="rail-stale"]'),
    ).toBeNull()

    // The stale board names its state for readers, never colour alone.
    expect(rowFor("old")?.textContent).toContain("Stale")
  })

  it("marks the active board by its fill, not by outranking freshness", async () => {
    // The dot used to override to the accent on the active row, because
    // "you are here" and "how fresh" were competing for one marker. With the
    // marker column retired (ADR-0058) they don't compete: the selection
    // fill, full ink and a weight step carry the current board, and its age
    // reads exactly as any other row's.
    await renderSidebar({
      sidebar: {
        repos: [
          {
            ...base.sidebar.repos[0],
            dashboards: [
              {
                slug: "main",
                section: null,
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
    const active = boardLink("main")
    expect(active?.getAttribute("aria-current")).toBe("page")
    expect(active?.querySelector('[data-testid="rail-age"]')?.textContent).toBe(
      "1h",
    )
    // The fill is what says "you are here", and it is full-bleed: the rail's
    // rows are square and edge to edge, so the wash reaches both panel edges.
    const railEl = document.querySelector(".rail")
    if (!railEl || !active) throw new Error("no rail, or no active board")
    const rail = railEl.getBoundingClientRect()
    const box = active.getBoundingClientRect()
    expect(box.left).toBeCloseTo(rail.left, 0)
    expect(box.right).toBeCloseTo(rail.right, 0)
    expect(getComputedStyle(active).borderTopLeftRadius).toBe("0px")
  })
})
