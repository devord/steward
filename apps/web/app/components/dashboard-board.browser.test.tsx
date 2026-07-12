import { createMemoryRouter, RouterProvider } from "react-router"
import { describe, expect, it } from "vitest"
import { render } from "vitest-browser-react"

import "../app.css"
import { DashboardBoard } from "./dashboard-board.tsx"
import type { ArtifactInfo, DashboardBase } from "../lib/dashboard.server.ts"

function view(): DashboardBase {
  return {
    dataRepo: "alice/bulletin-alice",
    isShared: false,
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
          login="alice"
          displayName="Alice"
          now={Date.now()}
          sidebar={{
            repos: [
              {
                repo: "alice/bulletin-alice",
                name: "bulletin-alice",
                isHome: true,
                private: true,
                collaborators: null,
                viewerIsAdmin: true,
                dashboards: ["main"],
              },
              {
                repo: "acme/bulletin-team",
                name: "bulletin-team",
                isHome: false,
                private: true,
                collaborators: null,
                viewerIsAdmin: null,
                dashboards: ["team-ops"],
              },
            ],
            complete: true,
          }}
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
