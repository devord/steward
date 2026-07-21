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
  }
}

async function renderBoard(
  artifacts: Promise<Record<string, ArtifactInfo>> = Promise.resolve({}),
  {
    viewerCanPush = true,
    base = view(),
    placements = {},
  }: {
    viewerCanPush?: boolean | null
    base?: DashboardBase
    /** Repo-wide placement map (ADR-0042); null = unknown. */
    placements?: Placements | null
  } = {},
) {
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
    // Catch-all so key-layer navigations (1–9 board switch) land somewhere
    // observable instead of tripping the memory router's error boundary.
    { path: "*", element: <p>ELSEWHERE</p> },
  ])
  await render(<RouterProvider router={router} />)
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
})
