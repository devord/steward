import { describe, expect, it } from "vitest"

import { failPath, seedRepo } from "../mocks/github.ts"
import { loadDashboard, repoExistsOr503 } from "./dashboard.server.ts"
import { GitHubError } from "./github.server.ts"

const DATA_REPO = "daniel/bulletin-data-daniel"
const PLUGINS_REPO = "form-factory/plugins" // matches setup-node env
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

const DAILY_PLAN_SKILL_MD = `---
name: daily-plan
description: today's working plan
widget:
  artifact: today's priorities and blocks
  sizes:
    default: { cols: 2, rows: 2 }
  schedule: "0 7 * * *"
---

# daily-plan
`

const REPO_PULSE_SKILL_MD = `---
name: repo-pulse
description: repository activity digest
widget:
  artifact: open PRs, new issues, CI status
---

# repo-pulse
`

function seedConfig() {
  seedRepo(DATA_REPO, {
    "data/routines.yaml": ROUTINES_YAML,
    "data/dashboards/main.yaml": DASHBOARD_YAML,
    // A private skill, discovered live from the data repo (ADR-0015).
    ".claude/skills/daily-plan/SKILL.md": DAILY_PLAN_SKILL_MD,
    // No widget: block — must never reach the picker.
    ".claude/skills/helper/SKILL.md": "---\ndescription: not a widget\n---\n",
  })
  // A shared skill in the plugins-marketplace layout (<plugin>/skills/).
  seedRepo(PLUGINS_REPO, {
    "bulletin/skills/repo-pulse/SKILL.md": REPO_PULSE_SKILL_MD,
  })
}

describe("loadDashboard", () => {
  it("assembles config, discovered skills, and artifacts in one view", async () => {
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
    expect(view.skills.map((skill) => [skill.id, skill.source])).toEqual([
      ["daily-plan", "private"],
      ["repo-pulse", "team"],
    ])
    expect(view.artifacts["daily-plan"]).toEqual({
      html: "<h1>plan</h1>",
      lastRunAt: "2026-07-09T07:00:00Z",
    })
    // Content-derived SHA (like GitHub's) — keyed on ref+path+content.
    expect(view.baseShas.routines).toMatch(/^sha:main:data\/routines\.yaml:/)
    expect(view.baseFiles.dashboard).toBe(DASHBOARD_YAML)
    expect(view.scope).toBe("personal")
    expect(view.dashboardSlug).toBe("main")
    expect(view.dashboards).toEqual(["main"])
  })

  it("falls back to empty defaults when the repo has no config yet", async () => {
    // No plugins repo seeded either — discovery degrades to no entries.
    seedRepo(DATA_REPO, {})

    const view = await loadDashboard("token", MAIN_BOARD)

    expect(view.routines.routines).toEqual([])
    expect(view.dashboard.grid).toEqual({
      columns: 4,
      rowHeight: 150,
      width: "fixed",
    })
    expect(view.dashboard.widgets).toEqual([])
    expect(view.skills).toEqual([])
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
    expect(view.baseShas.routines).toMatch(/^sha:main:data\/routines\.yaml:/)
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

  it("reports hasTrigger true for a manual cloud routine with a trigger file", async () => {
    seedRepo(DATA_REPO, {
      "data/routines.yaml":
        "routines:\n  - slug: mp\n    name: meeting prep\n    instructions: x\n",
      "data/dashboards/main.yaml": DASHBOARD_YAML,
      "data/triggers/mp.json": '{"routine":"rt_1","token":"tok"}',
    })

    const view = await loadDashboard("token", MAIN_BOARD)

    expect(view.artifacts["mp"]).toEqual({
      html: null,
      lastRunAt: null,
      hasTrigger: true,
    })
  })

  it("reports hasTrigger false for a manual cloud routine with no trigger file", async () => {
    seedRepo(DATA_REPO, {
      "data/routines.yaml":
        "routines:\n  - slug: mp\n    name: meeting prep\n    instructions: x\n",
      "data/dashboards/main.yaml": DASHBOARD_YAML,
    })

    const view = await loadDashboard("token", MAIN_BOARD)

    expect(view.artifacts["mp"]).toEqual({
      html: null,
      lastRunAt: null,
      hasTrigger: false,
    })
  })

  it("skips the trigger check for a local routine (hasTrigger absent)", async () => {
    seedRepo(DATA_REPO, {
      "data/routines.yaml":
        "routines:\n  - slug: mp\n    name: meeting prep\n    host: local\n    instructions: x\n",
      "data/dashboards/main.yaml": DASHBOARD_YAML,
    })

    const view = await loadDashboard("token", MAIN_BOARD)

    expect(view.artifacts["mp"]).toEqual({ html: null, lastRunAt: null })
    expect(view.artifacts["mp"]?.hasTrigger).toBeUndefined()
  })

  it("throws GitHubError when the config itself cannot load", async () => {
    seedRepo(DATA_REPO, {})
    failPath(DATA_REPO, "data/routines.yaml", { status: 503 })

    await expect(loadDashboard("token", MAIN_BOARD)).rejects.toBeInstanceOf(
      GitHubError,
    )
  })

  it("throws GitHubError, not a raw fetch error, when config load hits a network blip", async () => {
    seedRepo(DATA_REPO, {})
    // A thrown fetch (dropped connection, DNS, or the 15s timeout) on the
    // awaited structure path must arrive as a GitHubError so the loader
    // degrades to a 503 page instead of the generic crash — the intermittent
    // refresh failure this guards against.
    failPath(DATA_REPO, "data/routines.yaml", {
      network: true,
      endpoint: "contents",
    })

    const error = await loadDashboard("token", MAIN_BOARD).catch((e) => e)
    expect(error).toBeInstanceOf(GitHubError)
    // 503 is the service-unavailable contract loadDashboardStructureOr503
    // keys off — a regression to any other status would break the 503 page.
    expect((error as GitHubError).status).toBe(503)
  })
})

describe("repoExistsOr503", () => {
  it("returns true/false for the definitive present/absent cases", async () => {
    seedRepo(DATA_REPO, {})
    expect(await repoExistsOr503("token", DATA_REPO)).toBe(true)
    expect(await repoExistsOr503("token", "daniel/absent")).toBe(false)
  })

  it("degrades a transient existence-check failure to a 503, not a crash", async () => {
    // The bug behind the intermittent post-sign-in/refresh error page: a
    // network blip on the repo-existence probe used to escape the loader as a
    // raw GitHubError and render the generic error boundary. It must now become
    // the same 503 refresh page the config-load path already produces — never a
    // false `false` that would bounce an existing user to the setup wizard.
    seedRepo(DATA_REPO, {})
    failPath(DATA_REPO, "", { network: true, endpoint: "repo" })

    const thrown = (await repoExistsOr503("token", DATA_REPO).catch(
      (e) => e,
    )) as { init?: ResponseInit }
    expect(thrown).not.toBeInstanceOf(GitHubError)
    expect(thrown.init?.status).toBe(503)
  })
})
