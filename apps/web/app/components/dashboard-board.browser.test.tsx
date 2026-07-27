import { createMemoryRouter, RouterProvider } from "react-router"
import { beforeEach, describe, expect, it } from "vitest"
import { page, userEvent } from "vitest/browser"
import { render } from "vitest-browser-react"

import "../app.css"
import { DashboardBoard } from "./dashboard-board.tsx"
import type {
  ArtifactInfo,
  DashboardBase,
  Placements,
} from "../lib/dashboard.server.ts"

function view(): DashboardBase {
  return {
    dataRepo: "alice/steward-alice",
    isShared: false,
    dashboardSlug: "main",
    routines: {
      routines: [
        {
          slug: "daily",
          name: "Daily",
          template: "daily",
          schedule: "0 * * * *",
          enabled: true,
        },
      ],
    },
    dashboard: {
      widgets: [
        {
          routine: "daily",
          position: { col: 1, row: 1 },
          size: { cols: 2, rows: 1 },
        },
      ],
      grid: { columns: 4, rowHeight: 150, width: "fixed" },
    },
    dashboards: ["main"],
    baseShas: { routines: "r1", dashboard: "d1" },
    baseFiles: { routines: "routines: []\n", dashboard: "widgets: []\n" },
    categoryOrder: [],
    templateCategories: {},
  }
}

/**
 * A board whose routines resolve to two bands (ADR-0044): one carrying its
 * own `category`, one inheriting from its template, one with none — enough to
 * exercise the order list, the unlabeled lead band, and the floor.
 */
function bandedView(): DashboardBase {
  const base = view()
  return {
    ...base,
    categoryOrder: ["Project Mgmt", "Engineering"],
    templateCategories: { "repo-pulse": "Engineering" },
    routines: {
      routines: [
        ...base.routines.routines,
        {
          slug: "pulse",
          name: "Pulse",
          template: "repo-pulse",
          enabled: true,
        },
        {
          slug: "brief",
          name: "Brief",
          template: "custom",
          category: "Project Mgmt",
          enabled: true,
        },
      ],
    },
    dashboard: {
      ...base.dashboard,
      widgets: [
        ...base.dashboard.widgets,
        {
          routine: "pulse",
          position: { col: 1, row: 2 },
          size: { cols: 2, rows: 1 },
        },
        {
          routine: "brief",
          position: { col: 3, row: 1 },
          size: { cols: 2, rows: 1 },
        },
      ],
    },
  }
}

async function renderBoard(
  artifacts: Promise<Record<string, ArtifactInfo>> = Promise.resolve({}),
  {
    viewerCanPush = true,
    base = view(),
    placements = {},
    collapsedBands = [],
    actionResult = { ok: true },
  }: {
    viewerCanPush?: boolean | null
    base?: DashboardBase
    /** Repo-wide placement map (ADR-0042); null = unknown. */
    placements?: Placements | null
    /** Bands folded on this device (ADR-0044). */
    collapsedBands?: string[]
    /** What /dashboards answers — the failure path snaps a reorder back. */
    actionResult?: { ok: boolean; error?: string }
  } = {},
) {
  const submissions: unknown[] = []
  const router = createMemoryRouter([
    {
      path: "/",
      element: (
        <DashboardBoard
          view={base}
          artifacts={artifacts}
          templates={[]}
          placements={placements}
          login="alice"
          displayName="Alice"
          now={Date.now()}
          collapsedBands={collapsedBands}
          sidebar={{
            repos: [
              {
                repo: "alice/steward-alice",
                name: "steward-alice",
                displayName: null,
                isHome: true,
                private: true,
                collaborators: null,
                viewerIsAdmin: true,
                // The active board's repo — its push permission drives the
                // read-only gating (ADR-0023). Default pushable.
                viewerCanPush,
                sections: [],
                dashboards: [
                  {
                    slug: "main",
                    section: null,
                    lastRunAt: null,
                    stale: false,
                  },
                ],
              },
              {
                repo: "acme/steward-team",
                name: "steward-team",
                displayName: null,
                isHome: false,
                private: true,
                collaborators: null,
                viewerIsAdmin: null,
                viewerCanPush: null,
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
          }}
        />
      ),
    },
    // The band-order write (ADR-0049) posts here, the way the rail's section
    // edits do — recorded so a test can assert the payload, not just the
    // optimistic reorder on screen.
    {
      path: "/dashboards",
      action: async ({ request }: { request: Request }) => {
        submissions.push(await request.json())
        return actionResult
      },
    },
    // Catch-all so key-layer navigations (1–9 board switch) land somewhere
    // observable instead of tripping the memory router's error boundary.
    { path: "*", element: <p>ELSEWHERE</p> },
  ])
  await render(<RouterProvider router={router} />)
  return submissions
}

describe("DashboardBoard", () => {
  // Layout edits land in a localStorage draft (ADR-0003) keyed by repo+board,
  // which every test here shares — clear it so one test's unplaced widget
  // can't seed the next test's board.
  beforeEach(() => {
    localStorage.clear()
  })

  // Regression: the always-mounted delete dialog, closed by default, used to
  // call `dashboardPath("")` to build its body — and an empty, non-kebab slug
  // makes the schema throw, tripping the root error boundary the moment any
  // board loaded ("An unexpected error occurred" after sign-in).
  it("renders with the board-delete dialog closed (no target)", async () => {
    await renderBoard()
    await expect
      .poll(() =>
        [...document.querySelectorAll("*")].some(
          (el) => el.textContent === "Daily",
        ),
      )
      .toBe(true)
    // The delete confirmation only mounts its content once a board is targeted.
    expect(document.body.textContent).not.toContain("Delete this dashboard?")
  })

  it("Esc leaves edit mode, matching the app-wide close-this-layer key", async () => {
    await page.viewport(1280, 900)
    await renderBoard()
    await expect.poll(() => document.body.textContent).toContain("Daily")

    await userEvent.click(
      page.getByRole("button", { name: "Edit", exact: true }),
    )
    await expect
      .poll(() => document.querySelector(".dash-grid.is-editing"))
      .not.toBeNull()

    await userEvent.keyboard("{Escape}")
    // Exiting is safe (layout edits commit to the draft on drag stop), so Esc
    // is exactly the Done button.
    await expect
      .poll(() => document.querySelector(".dash-grid.is-editing"))
      .toBeNull()
    expect(document.body.textContent).toContain("Edit")
  })

  it("single-key layer: e toggles edit mode, ? opens the sheet and owns the keys", async () => {
    await page.viewport(1280, 900)
    await renderBoard()
    await expect.poll(() => document.body.textContent).toContain("Daily")

    // e enters edit mode; e again leaves it.
    await userEvent.keyboard("e")
    await expect
      .poll(() => document.querySelector(".dash-grid.is-editing"))
      .not.toBeNull()
    await userEvent.keyboard("e")
    await expect
      .poll(() => document.querySelector(".dash-grid.is-editing"))
      .toBeNull()

    // ? opens the keymap sheet — an open layer owns the keyboard, so e is
    // inert until Esc closes it.
    await userEvent.keyboard("?")
    await expect
      .poll(() => document.body.textContent)
      .toContain("Keyboard shortcuts")
    await userEvent.keyboard("e")
    expect(document.querySelector(".dash-grid.is-editing")).toBeNull()
    await userEvent.keyboard("{Escape}")
    await expect
      .poll(() => document.body.textContent)
      .not.toContain("Keyboard shortcuts")
  })

  it("single-key layer: number keys switch boards in rail order", async () => {
    await page.viewport(1280, 900)
    await renderBoard()
    await expect.poll(() => document.body.textContent).toContain("Daily")

    // Board 2 in rail order is acme/steward-team `team-ops` — off this
    // router's home route, so the catch-all proves the navigation happened.
    await userEvent.keyboard("2")
    await expect.poll(() => document.body.textContent).toContain("ELSEWHERE")
  })

  // Regression: the streamed artifacts promise rejects whenever the server
  // aborts it (react-router kills promises still pending at streamTimeout —
  // a cold instance + slow GitHub reads did it every few minutes). Unhandled,
  // the rejection threw from <Await> into the root error boundary and
  // replaced the whole board with "An unexpected error occurred."
  it("degrades to unreachable cells when the artifact stream dies", async () => {
    // Reject only after mount so the rejection exercises the subscribed
    // handlers (Await + the resolve effect), like a real aborted stream.
    await renderBoard(
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Server Timeout")), 10),
      ),
    )
    await expect
      .poll(() => document.body.textContent)
      .toContain("GitHub unreachable — retries on next refresh")
    expect(document.body.textContent).toContain("Daily")
  })

  // Read-only access (ADR-0023): a viewer who can read but not push must see
  // the state up front — the edit entry points disable and a calm badge names
  // why — so they never build a draft that could only fail at Sync (ADR-0003).
  it("read-only repo: disables the edit controls, shows the badge, and won't arm editing", async () => {
    await page.viewport(1280, 900)
    await renderBoard(Promise.resolve({}), { viewerCanPush: false })
    await expect.poll(() => document.body.textContent).toContain("Daily")

    // The badge names the state next to the (now-disabled) actions.
    await expect
      .poll(() => document.querySelector('[data-testid="read-only-badge"]'))
      .not.toBeNull()
    expect(document.body.textContent).toContain("Read-only")

    // Edit + Add rest visible but disabled — never silently hidden.
    const edit = page.getByRole("button", { name: "Edit", exact: true })
    const add = page.getByRole("button", { name: "Add routine" })
    expect(edit.element().hasAttribute("disabled")).toBe(true)
    expect(add.element().hasAttribute("disabled")).toBe(true)

    // The keyboard verb can't enter edit mode either.
    await userEvent.keyboard("e")
    expect(document.querySelector(".dash-grid.is-editing")).toBeNull()
  })

  // Unknown permission (null) must behave exactly as pushable — we never lock
  // out a viewer whose access we merely couldn't read (the Sync "denied" stays
  // the backstop). `true` is the existing tests' default; this pins `null`.
  it("unknown push permission (null): full editing, no badge", async () => {
    await page.viewport(1280, 900)
    await renderBoard(Promise.resolve({}), { viewerCanPush: null })
    await expect.poll(() => document.body.textContent).toContain("Daily")

    expect(document.querySelector('[data-testid="read-only-badge"]')).toBeNull()
    const edit = page.getByRole("button", { name: "Edit", exact: true })
    expect(edit.element().hasAttribute("disabled")).toBe(false)

    await userEvent.click(edit)
    await expect
      .poll(() => document.querySelector(".dash-grid.is-editing"))
      .not.toBeNull()
  })

  // "Not on the grid" (ADR-0042). A repo's routine pool is shared across its
  // boards, so the parking lot's old "absent from *this* board" test paraded
  // every sibling board's routines here — a client board's work showing up
  // under an unrelated one, each row beside a button offering to delete it
  // from the repo out from under the board that renders it.
  describe("the off-grid parking lot lists orphans only", () => {
    /** `daily` on this board, `sibling` on another, `homeless` on none. */
    function pool(): DashboardBase {
      const base = view()
      base.routines.routines.push(
        {
          slug: "sibling",
          name: "Sibling",
          template: "daily",
          schedule: "0 * * * *",
          enabled: true,
        },
        {
          slug: "homeless",
          name: "Homeless",
          template: "daily",
          schedule: "0 * * * *",
          enabled: true,
        },
      )
      return base
    }

    it("hides a routine placed on a sibling board, keeps the orphan", async () => {
      await page.viewport(1280, 900)
      await renderBoard(Promise.resolve({}), {
        base: pool(),
        placements: { daily: ["main"], sibling: ["corza"] },
      })
      await expect.poll(() => document.body.textContent).toContain("Daily")

      // View mode counts orphans only — one, not two.
      await expect
        .poll(() => document.body.textContent)
        .toContain("1 on no dashboard")

      await userEvent.click(
        page.getByRole("button", { name: "Edit", exact: true }),
      )
      await expect
        .poll(() => document.body.textContent)
        .toContain("Not on the grid")
      // Its "delete from the repo" control is the thing that must never be
      // offered for a routine another board renders.
      expect(
        page
          .getByRole("button", { name: "Delete Homeless from the repo" })
          .elements().length,
      ).toBe(1)
      expect(
        page
          .getByRole("button", { name: "Delete Sibling from the repo" })
          .elements().length,
      ).toBe(0)
    })

    // Unknown placements (still streaming, or a degraded read) must not be read
    // as "nothing is placed anywhere" — that reinstates the false claim for
    // every routine in the pool.
    it("stays hidden while placements are unknown", async () => {
      await page.viewport(1280, 900)
      await renderBoard(Promise.resolve({}), {
        base: pool(),
        placements: null,
      })
      await expect.poll(() => document.body.textContent).toContain("Daily")
      // Polled, not asserted once: useStreamed seeds from the last value held
      // for this key, so a previous test's map can paint for one frame.
      await expect
        .poll(() => document.body.textContent)
        .not.toContain("on no dashboard")

      await userEvent.click(
        page.getByRole("button", { name: "Edit", exact: true }),
      )
      await expect
        .poll(() => document.querySelector(".dash-grid.is-editing"))
        .not.toBeNull()
      await expect
        .poll(() => document.body.textContent)
        .not.toContain("Not on the grid")
    })

    // This board's placement comes from the *draft*, not the committed map:
    // unplacing a widget deliberately leaves the routine in the pool, and it
    // has to land in the parking lot right then — not one sync later.
    it("catches a widget unplaced in the draft, before any sync", async () => {
      await page.viewport(1280, 900)
      await renderBoard(Promise.resolve({}), {
        base: pool(),
        // The committed map still says `daily` is on this board.
        placements: { daily: ["main"], sibling: ["corza"] },
      })
      await expect.poll(() => document.body.textContent).toContain("Daily")

      await userEvent.click(
        page.getByRole("button", { name: "Edit", exact: true }),
      )
      await userEvent.click(
        page.getByRole("button", { name: "Remove Daily from grid" }),
      )
      await expect
        .poll(
          () =>
            page
              .getByRole("button", { name: "Delete Daily from the repo" })
              .elements().length,
        )
        .toBe(1)
    })
  })

  describe("category bands (ADR-0044)", () => {
    it("groups widgets under headings, in the repo's authored order", async () => {
      await page.viewport(1280, 900)
      await renderBoard(Promise.resolve({}), { base: bandedView() })
      await expect.poll(() => document.body.textContent).toContain("Pulse")

      const headings = () =>
        [...document.querySelectorAll("[data-band-heading]")].map((el) =>
          el.getAttribute("data-band-heading"),
        )
      // repo.yaml lists Project Mgmt first; alphabetical would invert it, so
      // this also pins that the order list is what's being honored.
      await expect.poll(headings).toEqual(["Project Mgmt", "Engineering"])
    })

    // One grid per band is the whole point (compaction can't cross a band).
    it("renders a separate grid instance per band", async () => {
      await page.viewport(1280, 900)
      await renderBoard(Promise.resolve({}), { base: bandedView() })
      await expect
        .poll(() => document.querySelectorAll(".dash-grid").length)
        // Project Mgmt, Engineering, and the unlabeled band holding Daily.
        .toBe(3)
    })

    it("stays flat below the floor rather than showing one lone heading", async () => {
      await page.viewport(1280, 900)
      // The default view has a single uncategorized routine — one category
      // would be worse than none, so nothing bands.
      await renderBoard()
      await expect.poll(() => document.body.textContent).toContain("Daily")
      expect(document.querySelectorAll("[data-band-heading]")).toHaveLength(0)
      expect(document.querySelectorAll(".dash-grid")).toHaveLength(1)
    })

    it("unmounts a collapsed band's widgets, so they cost no iframe", async () => {
      await page.viewport(1280, 900)
      await renderBoard(Promise.resolve({}), {
        base: bandedView(),
        collapsedBands: ["Engineering"],
      })
      await expect.poll(() => document.body.textContent).toContain("Brief")
      // The heading survives (it's how you get the band back); its cells don't.
      expect(document.body.textContent).toContain("Engineering")
      expect(document.body.textContent).not.toContain("Pulse")
    })

    it("collapses a band from its heading, and expands it again", async () => {
      await page.viewport(1280, 900)
      await renderBoard(Promise.resolve({}), { base: bandedView() })
      await expect.poll(() => document.body.textContent).toContain("Pulse")

      const heading = () => {
        const el = document.querySelector<HTMLElement>(
          '[data-band-heading="Engineering"]',
        )
        if (!el) throw new Error("Engineering band heading not rendered")
        return el
      }
      await userEvent.click(heading())
      await expect.poll(() => document.body.textContent).not.toContain("Pulse")
      expect(heading().getAttribute("aria-expanded")).toBe("false")

      await userEvent.click(heading())
      await expect.poll(() => document.body.textContent).toContain("Pulse")
    })
  })

  describe("band ordering and creation (ADR-0049)", () => {
    const headings = () =>
      [...document.querySelectorAll("[data-band-heading]")].map((el) =>
        el.getAttribute("data-band-heading"),
      )

    async function openBandMenu(category: string) {
      await userEvent.click(
        page.getByRole("button", { name: `${category} band options` }),
      )
    }

    // The end bands have nowhere to go in one direction, and the menu drops
    // the item rather than showing it disabled — "first" is legible from the
    // position, so a dead row would only be noise.
    it("offers each end band only the move it can make", async () => {
      await page.viewport(1280, 900)
      await renderBoard(Promise.resolve({}), { base: bandedView() })
      await expect.poll(headings).toEqual(["Project Mgmt", "Engineering"])

      const menuItems = () =>
        [...document.querySelectorAll('[role="menuitem"]')].map((el) =>
          el.textContent?.trim(),
        )

      await openBandMenu("Project Mgmt")
      await expect.poll(menuItems).toEqual(["Move band down", "New band…"])
      await userEvent.keyboard("{Escape}")
      await expect.poll(menuItems).toEqual([])

      await openBandMenu("Engineering")
      await expect.poll(menuItems).toEqual(["Move band up", "New band…"])
    })

    it("moves a band past its neighbour and writes the repo's whole order", async () => {
      await page.viewport(1280, 900)
      const submissions = await renderBoard(Promise.resolve({}), {
        base: bandedView(),
      })
      await expect.poll(headings).toEqual(["Project Mgmt", "Engineering"])

      await openBandMenu("Engineering")
      await userEvent.click(
        page.getByRole("menuitem", { name: "Move band up" }),
      )

      // Optimistic: the board reorders now, not after the commit round-trips —
      // GitHub can serve the pre-commit blob for a beat, and a band that
      // doesn't move gets nudged twice.
      await expect.poll(headings).toEqual(["Engineering", "Project Mgmt"])
      // The whole order goes, not a move: `categories:` carries only the names
      // it lists, so a first nudge has to materialize the rest.
      expect(submissions).toEqual([
        {
          intent: "reorderCategories",
          repo: "alice/steward-alice",
          categories: ["Engineering", "Project Mgmt"],
        },
      ])
    })

    it("snaps a refused move back, and says why", async () => {
      await page.viewport(1280, 900)
      await renderBoard(Promise.resolve({}), {
        base: bandedView(),
        actionResult: { ok: false, error: "conflict" },
      })
      await expect.poll(headings).toEqual(["Project Mgmt", "Engineering"])

      await openBandMenu("Engineering")
      await userEvent.click(
        page.getByRole("menuitem", { name: "Move band up" }),
      )

      await expect
        .poll(() => document.body.textContent)
        .toContain("The repo changed just now")
      // The board must not keep showing an order the repo doesn't have.
      expect(headings()).toEqual(["Project Mgmt", "Engineering"])
    })

    // Order and membership are repo-wide writes (ADR-0023): a read-only viewer
    // keeps the collapse row and gets no menu at all.
    it("withholds the band menu from a read-only viewer", async () => {
      await page.viewport(1280, 900)
      await renderBoard(Promise.resolve({}), {
        base: bandedView(),
        viewerCanPush: false,
      })
      await expect.poll(headings).toEqual(["Project Mgmt", "Engineering"])
      expect(
        document.querySelectorAll('[aria-label$="band options"]'),
      ).toHaveLength(0)
    })

    // A band with no routines cannot render, so creating one is naming it and
    // saying what goes in it — one act, in the draft.
    it("creates a band by filing this board's widgets into it", async () => {
      await page.viewport(1280, 900)
      await renderBoard(Promise.resolve({}), { base: bandedView() })
      await expect.poll(headings).toEqual(["Project Mgmt", "Engineering"])

      await openBandMenu("Engineering")
      await userEvent.click(page.getByRole("menuitem", { name: "New band…" }))
      await expect.poll(() => document.body.textContent).toContain("New band")

      const name = document.querySelector<HTMLInputElement>("#band-name")
      if (!name) throw new Error("band name field not rendered")
      await userEvent.fill(name, "Executive")

      // Daily is the uncategorized widget — filing it empties the unlabeled
      // lead band and opens a third.
      const row = [...document.querySelectorAll("li")].find((li) =>
        li.textContent?.includes("Daily"),
      )
      const box = row?.querySelector<HTMLElement>('[role="checkbox"]')
      if (!box) throw new Error("Daily row not offered in the picker")
      await userEvent.click(box)

      await userEvent.click(page.getByRole("button", { name: "Create band" }))
      // Unlisted in repo.yaml, so it sorts after the two authored bands.
      await expect
        .poll(headings)
        .toEqual(["Project Mgmt", "Engineering", "Executive"])
      // Membership is a routine edit, so it rides the draft to Sync — never a
      // direct commit like the order beside it.
      await expect.poll(() => document.body.textContent).toContain("Sync")
    })
  })
})
