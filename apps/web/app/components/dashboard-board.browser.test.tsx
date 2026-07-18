import { createMemoryRouter, RouterProvider } from "react-router"
import { describe, expect, it } from "vitest"
import { page, userEvent } from "vitest/browser"
import { render } from "vitest-browser-react"

import "../app.css"
import { DashboardBoard } from "./dashboard-board.tsx"
import type { ArtifactInfo, DashboardBase } from "../lib/dashboard.server.ts"

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
) {
  const router = createMemoryRouter([
    {
      path: "/",
      element: (
        <DashboardBoard
          view={view()}
          artifacts={artifacts}
          templates={[]}
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
                viewerCanPush: true,
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
})
