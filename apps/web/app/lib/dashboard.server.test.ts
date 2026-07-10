import { describe, expect, it } from "vitest"

import { failPath, seedRepo } from "../mocks/github.ts"
import { loadDashboard } from "./dashboard.server.ts"
import { GitHubError } from "./github.server.ts"

const DATA_REPO = "daniel/bulletin-data-daniel"
const SHARED_REPO = "form-factory/bulletin" // matches setup-node env
const MAIN_BOARD = {
  scope: "personal",
  repo: DATA_REPO,
  dashboard: "main",
} as const

const ROUTINES_YAML = `routines:
  - slug: daily-plan
    name: daily plan
    skill: daily-plan
    schedule: "0 7 * * *"
    enabled: true
`

const DASHBOARD_YAML = `grid:
  columns: 4
  rowHeight: 150
widgets:
  - routine: daily-plan
    position: { col: 1, row: 1 }
    size: { cols: 2, rows: 2 }
`

const CATALOG_JSON = JSON.stringify({
  skills: [
    {
      id: "daily-plan",
      name: "daily plan",
      description: "today's working plan",
      widget: {
        artifact: "today's priorities and blocks",
        sizes: { default: { cols: 2, rows: 2 } },
        schedule: "0 7 * * *",
      },
    },
  ],
})

function seedConfig() {
  seedRepo(DATA_REPO, {
    "data/routines.yaml": ROUTINES_YAML,
    "data/dashboards/main.yaml": DASHBOARD_YAML,
  })
  seedRepo(SHARED_REPO, { "catalog/skills.json": CATALOG_JSON })
}

describe("loadDashboard", () => {
  it("assembles config, catalog, and artifacts in one view", async () => {
    seedConfig()
    seedRepo(
      DATA_REPO,
      {
        "w/daily-plan/index.html": {
          text: "<h1>plan</h1>",
          lastCommit: "2026-07-09T07:00:00Z",
        },
      },
      "artifacts",
    )

    const view = await loadDashboard("token", MAIN_BOARD)

    expect(view.routines.routines).toHaveLength(1)
    expect(view.dashboard.widgets[0]).toMatchObject({
      routine: "daily-plan",
      size: { cols: 2, rows: 2 },
    })
    expect(view.catalog.skills[0]?.id).toBe("daily-plan")
    expect(view.artifacts["daily-plan"]).toEqual({
      html: "<h1>plan</h1>",
      lastRunAt: "2026-07-09T07:00:00Z",
    })
    expect(view.baseShas.routines).toBe("sha:main:data/routines.yaml")
    expect(view.baseFiles.dashboard).toBe(DASHBOARD_YAML)
    expect(view.scope).toBe("personal")
    expect(view.dashboardSlug).toBe("main")
    expect(view.dashboards).toEqual(["main"])
  })

  it("falls back to empty defaults when the repo has no config yet", async () => {
    seedRepo(DATA_REPO, {})
    seedRepo(SHARED_REPO, {})

    const view = await loadDashboard("token", MAIN_BOARD)

    expect(view.routines.routines).toEqual([])
    expect(view.dashboard.grid).toEqual({
      columns: 4,
      rowHeight: 150,
      width: "fixed",
    })
    expect(view.dashboard.widgets).toEqual([])
    expect(view.catalog.skills).toEqual([])
    expect(view.baseShas).toEqual({ routines: null, dashboard: null })
  })

  it("reports a never-published artifact as html: null", async () => {
    seedConfig()

    const view = await loadDashboard("token", MAIN_BOARD)

    expect(view.artifacts["daily-plan"]).toEqual({
      html: null,
      lastRunAt: null,
    })
  })

  it("degrades one widget to unreachable on a persistent 5xx, keeping the board", async () => {
    seedConfig()
    failPath(DATA_REPO, "w/daily-plan/index.html", { status: 502 })

    const view = await loadDashboard("token", MAIN_BOARD)

    expect(view.artifacts["daily-plan"]).toEqual({
      html: null,
      lastRunAt: null,
      unreachable: true,
    })
    // The rest of the view is intact.
    expect(view.routines.routines).toHaveLength(1)
    expect(view.baseShas.routines).toBe("sha:main:data/routines.yaml")
  })

  it("keeps a fetched artifact even when its commit date fails to load", async () => {
    seedConfig()
    seedRepo(
      DATA_REPO,
      {
        "w/daily-plan/index.html": {
          text: "<h1>plan</h1>",
          lastCommit: "2026-07-09T07:00:00Z",
        },
      },
      "artifacts",
    )
    // Only the commits endpoint fails; the artifact body loads fine.
    failPath(DATA_REPO, "w/daily-plan/index.html", {
      status: 502,
      endpoint: "commits",
    })

    const view = await loadDashboard("token", MAIN_BOARD)

    // HTML is preserved; only the freshness is missing (not unreachable).
    expect(view.artifacts["daily-plan"]).toEqual({
      html: "<h1>plan</h1>",
      lastRunAt: null,
    })
  })

  it("degrades a widget without failing the board on a network error", async () => {
    seedConfig()
    seedRepo(
      DATA_REPO,
      { "w/daily-plan/index.html": "<h1>plan</h1>" },
      "artifacts",
    )
    // A fetch-level network error is not a GitHubError — it must still be
    // isolated to the cell rather than rejecting the whole batch.
    failPath(DATA_REPO, "w/daily-plan/index.html", {
      network: true,
      endpoint: "contents",
    })

    const view = await loadDashboard("token", MAIN_BOARD)

    expect(view.artifacts["daily-plan"]).toEqual({
      html: null,
      lastRunAt: null,
      unreachable: true,
    })
    expect(view.routines.routines).toHaveLength(1)
  })

  it("rides out a transient 5xx flap by retrying the GET", async () => {
    seedConfig()
    seedRepo(
      DATA_REPO,
      { "w/daily-plan/index.html": "<h1>plan</h1>" },
      "artifacts",
    )
    // Two failures, then success — inside the three GET attempts.
    failPath(DATA_REPO, "w/daily-plan/index.html", { status: 500, times: 2 })

    const view = await loadDashboard("token", MAIN_BOARD)

    expect(view.artifacts["daily-plan"]?.html).toBe("<h1>plan</h1>")
    expect(view.artifacts["daily-plan"]?.unreachable).toBeUndefined()
  })

  it("throws GitHubError when the config itself cannot load", async () => {
    seedRepo(SHARED_REPO, {})
    seedRepo(DATA_REPO, {})
    failPath(DATA_REPO, "data/routines.yaml", { status: 503 })

    await expect(loadDashboard("token", MAIN_BOARD)).rejects.toBeInstanceOf(
      GitHubError,
    )
  })
})
