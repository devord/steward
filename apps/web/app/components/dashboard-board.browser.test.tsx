import { createMemoryRouter, RouterProvider } from "react-router"
import { describe, expect, it } from "vitest"
import { render } from "vitest-browser-react"

import "../app.css"
import { DashboardBoard } from "./dashboard-board.tsx"
import type { DashboardBase } from "../lib/dashboard.server.ts"

function view(): DashboardBase {
  return {
    dataRepo: "alice/bulletin-alice",
    scope: "personal",
    dashboardSlug: "main",
    dashboardName: null,
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
    templates: [],
    dashboards: ["main"],
    baseShas: { routines: "r1", dashboard: "d1" },
    baseFiles: { routines: "routines: []\n", dashboard: "widgets: []\n" },
  }
}

async function renderBoard() {
  const router = createMemoryRouter([
    {
      path: "/",
      element: (
        <DashboardBoard
          view={view()}
          artifacts={Promise.resolve({})}
          login="alice"
          displayName="Alice"
          now={Date.now()}
          personalDashboards={["main"]}
          teamDashboards={["team-ops"]}
        />
      ),
    },
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
})
