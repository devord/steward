import { beforeEach, describe, expect, it } from "vitest"

import {
  failGenerate,
  failPath,
  seedRepo,
  seedRepoMeta,
} from "../mocks/github.ts"
import {
  createDataRepoOr503,
  loadArtifactVersion,
  loadDashboard,
  loadDashboardStructureOr503,
  loadSidebar,
  repoExistsOr503,
  streamPlacements,
} from "./dashboard.server.ts"
import { GitHubError } from "./github.server.ts"
import { __resetRepoCache } from "./repos.server.ts"

const LOGIN = "daniel"
const DATA_REPO = "daniel/steward-data-daniel"
const MAIN_BOARD = {
  repo: DATA_REPO,
  shared: false,
  dashboard: "main",
} as const

const ROUTINES_YAML = `routines:
  - slug: daily-plan
    name: daily plan
    template: daily-plan
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

const DAILY_PLAN_TEMPLATE_MD = `---
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

function seedConfig() {
  seedRepo(DATA_REPO, {
    "data/routines.yaml": ROUTINES_YAML,
    "data/dashboards/main.yaml": DASHBOARD_YAML,
    // A private template, discovered live from the data repo (ADR-0021);
    // it shadows the same-named built-in.
    "templates/routines/daily-plan.md": DAILY_PLAN_TEMPLATE_MD,
    // No widget: block — must never reach the picker.
    "templates/routines/helper.md": "---\ndescription: not a widget\n---\n",
  })
}

describe("loadDashboard", () => {
  it("assembles config, discovered templates, and artifacts in one view", async () => {
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
    // The data repo's daily-plan shadows the bundled built-in of the same
    // name; the rest arrive as built-ins with no repo seeded at all.
    expect(view.templates.map((t) => [t.id, t.source])).toEqual([
      ["daily-plan", "repo"],
      ["module-entropy", "builtin"],
      ["repo-narrative", "builtin"],
      ["repo-pulse", "builtin"],
    ])
    expect(view.artifacts["daily-plan"]).toEqual({
      html: "<h1>plan</h1>",
      sha: expect.stringMatching(/^sha:artifacts:w\/daily-plan\/index\.html:/),
      lastRunAt: "2026-07-09T07:00:00Z",
      // Scheduled cloud routines carry trigger state too — the tile's
      // run-now affordances need it (ADR-0016).
      hasTrigger: false,
    })
    // Content-derived SHA (like GitHub's) — keyed on ref+path+content.
    expect(view.baseShas.routines).toMatch(/^sha:main:data\/routines\.yaml:/)
    expect(view.baseFiles.dashboard).toBe(DASHBOARD_YAML)
    expect(view.isShared).toBe(false)
    expect(view.dashboardSlug).toBe("main")
    expect(view.dashboards).toEqual(["main"])
  })

  it("falls back to empty defaults when the repo has no config yet", async () => {
    seedRepo(DATA_REPO, {})

    const view = await loadDashboard("token", MAIN_BOARD)

    expect(view.routines.routines).toEqual([])
    expect(view.dashboard.grid).toEqual({
      columns: 4,
      rowHeight: 150,
      width: "fixed",
    })
    expect(view.dashboard.widgets).toEqual([])
    // Built-ins ship in the bundle — they're there even with no config.
    expect(view.templates.map((t) => [t.id, t.source])).toEqual([
      ["daily-plan", "builtin"],
      ["module-entropy", "builtin"],
      ["repo-narrative", "builtin"],
      ["repo-pulse", "builtin"],
    ])
    expect(view.baseShas).toEqual({ routines: null, dashboard: null })
  })

  it("reports a never-published artifact as html: null", async () => {
    seedConfig()

    const view = await loadDashboard("token", MAIN_BOARD)

    expect(view.artifacts["daily-plan"]).toEqual({
      html: null,
      sha: null,
      lastRunAt: null,
      hasTrigger: false,
    })
  })

  it("degrades one widget to unreachable on a persistent 5xx, keeping the board", async () => {
    seedConfig()
    failPath(DATA_REPO, "w/daily-plan/index.html", { status: 502 })

    const view = await loadDashboard("token", MAIN_BOARD)

    expect(view.artifacts["daily-plan"]).toEqual({
      html: null,
      sha: null,
      lastRunAt: null,
      unreachable: true,
      hasTrigger: false,
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
      sha: expect.stringMatching(/^sha:artifacts:w\/daily-plan\/index\.html:/),
      lastRunAt: null,
      hasTrigger: false,
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
      sha: null,
      lastRunAt: null,
      unreachable: true,
      hasTrigger: false,
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

  it("reports hasTrigger true and the routine id from the trigger file", async () => {
    seedRepo(DATA_REPO, {
      "data/routines.yaml":
        "routines:\n  - slug: mp\n    name: meeting prep\n    template: custom\n    instructions: x\n",
      "data/dashboards/main.yaml": DASHBOARD_YAML,
      "data/triggers/mp.json": '{"routine":"rt_1","token":"tok"}',
    })

    const view = await loadDashboard("token", MAIN_BOARD)

    // The routine id rides out of the trigger file for the claude.ai link and
    // the fire path (ADR-0016/0025).
    expect(view.artifacts["mp"]).toEqual({
      html: null,
      sha: null,
      lastRunAt: null,
      hasTrigger: true,
      routineId: "rt_1",
    })
  })

  it("reports hasTrigger false for a manual cloud routine with no trigger file", async () => {
    seedRepo(DATA_REPO, {
      "data/routines.yaml":
        "routines:\n  - slug: mp\n    name: meeting prep\n    template: custom\n    instructions: x\n",
      "data/dashboards/main.yaml": DASHBOARD_YAML,
    })

    const view = await loadDashboard("token", MAIN_BOARD)

    expect(view.artifacts["mp"]).toEqual({
      html: null,
      sha: null,
      lastRunAt: null,
      hasTrigger: false,
    })
  })

  it("skips the trigger check for a local routine (hasTrigger absent)", async () => {
    seedRepo(DATA_REPO, {
      "data/routines.yaml":
        "routines:\n  - slug: mp\n    name: meeting prep\n    template: custom\n    host: local\n    instructions: x\n",
      "data/dashboards/main.yaml": DASHBOARD_YAML,
    })

    const view = await loadDashboard("token", MAIN_BOARD)

    expect(view.artifacts["mp"]).toEqual({
      html: null,
      sha: null,
      lastRunAt: null,
    })
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

  it("degrades a dead-token 401 to a 401 re-auth page, not a 503 outage", async () => {
    // A revoked/expired token 401s on every read. Classifying it as the
    // transient 503 outage is a trap: the "back on next refresh" page never
    // recovers (each refresh replays the same dead token) and carries no way
    // out. It must degrade to a distinct 401 the error boundary pairs with a
    // sign-out instead.
    seedRepo(DATA_REPO, {})
    failPath(DATA_REPO, "", { status: 401, endpoint: "repo" })

    const thrown = (await repoExistsOr503("token", DATA_REPO).catch(
      (e) => e,
    )) as { init?: ResponseInit }
    expect(thrown).not.toBeInstanceOf(GitHubError)
    expect(thrown.init?.status).toBe(401)
  })
})

describe("createDataRepoOr503", () => {
  const TEMPLATE = "steward/data-template"

  it("creates the data repo from the template", async () => {
    await createDataRepoOr503(
      "token",
      TEMPLATE,
      "daniel",
      "steward-data-daniel",
    )
    // The freshly created repo is now readable — the redirect back to the
    // board won't bounce into the wizard.
    expect(await repoExistsOr503("token", DATA_REPO)).toBe(true)
  })

  it("degrades a name-collision 422 to an actionable 422, not the generic crash", async () => {
    // The failure the user actually fixes: a repo of that name already exists,
    // so GitHub 422s the create. It must reach the boundary as a route error
    // with a self-service message, never the raw GitHubError generic crash.
    failGenerate({ status: 422 })

    const thrown = (await createDataRepoOr503(
      "token",
      TEMPLATE,
      "daniel",
      "steward-data-daniel",
    ).catch((e) => e)) as { init?: ResponseInit; data?: string }
    expect(thrown).not.toBeInstanceOf(GitHubError)
    expect(thrown.init?.status).toBe(422)
    expect(thrown.data).toContain("daniel/steward-data-daniel")
  })

  it("degrades a template-not-found 404 to an actionable 404, not a retry loop", async () => {
    // A private template hides from an out-of-org token as 404. Classifying it
    // as the transient 503 traps the user in a "try again" that never succeeds,
    // so it must reach the boundary as a distinct 404 that names the template.
    failGenerate({ status: 404 })

    const thrown = (await createDataRepoOr503(
      "token",
      TEMPLATE,
      "daniel",
      "steward-data-daniel",
    ).catch((e) => e)) as { init?: ResponseInit; data?: string }
    expect(thrown).not.toBeInstanceOf(GitHubError)
    expect(thrown.init?.status).toBe(404)
    expect(thrown.data).toContain(TEMPLATE)
  })

  it("degrades a dead-token 401 to a 401 re-auth page", async () => {
    // A revoked token 401s the create too — the boundary must pair it with a
    // sign-out (status 401), not the transient-outage refresh.
    failGenerate({ status: 401 })

    const thrown = (await createDataRepoOr503(
      "token",
      TEMPLATE,
      "daniel",
      "steward-data-daniel",
    ).catch((e) => e)) as { init?: ResponseInit }
    expect(thrown).not.toBeInstanceOf(GitHubError)
    expect(thrown.init?.status).toBe(401)
  })

  it("degrades a transient create failure to a 503 refresh, not a crash", async () => {
    // A 5xx/rate-limit/network blip on the create (a POST, so never retried)
    // becomes the same "try again" 503 the loaders produce — no repo was made,
    // so retrying is safe.
    failGenerate({ status: 500 })

    const thrown = (await createDataRepoOr503(
      "token",
      TEMPLATE,
      "daniel",
      "steward-data-daniel",
    ).catch((e) => e)) as { init?: ResponseInit }
    expect(thrown).not.toBeInstanceOf(GitHubError)
    expect(thrown.init?.status).toBe(503)
  })
})

describe("loadDashboardStructureOr503", () => {
  it("degrades a transient config-load failure to a 503 refresh page", async () => {
    seedRepo(DATA_REPO, {})
    failPath(DATA_REPO, "data/routines.yaml", { status: 503 })

    const thrown = (await loadDashboardStructureOr503(
      "token",
      MAIN_BOARD,
    ).catch((e) => e)) as { init?: ResponseInit }
    expect(thrown).not.toBeInstanceOf(GitHubError)
    expect(thrown.init?.status).toBe(503)
  })

  it("degrades a dead-token 401 to a 401 re-auth page", async () => {
    seedRepo(DATA_REPO, {})
    failPath(DATA_REPO, "data/routines.yaml", { status: 401 })

    const thrown = (await loadDashboardStructureOr503(
      "token",
      MAIN_BOARD,
    ).catch((e) => e)) as { init?: ResponseInit }
    expect(thrown).not.toBeInstanceOf(GitHubError)
    expect(thrown.init?.status).toBe(401)
  })
})

// The board's orphan test (ADR-0042): a routine is only "not on the grid" if
// no board in the repo places it, so the answer has to come from every layout.
describe("streamPlacements", () => {
  it("maps each routine to the boards that place it", async () => {
    seedConfig()
    seedRepo(DATA_REPO, {
      "data/dashboards/corza.yaml": `grid: { columns: 4, rowHeight: 150 }
widgets:
  - routine: corza-prs
    position: { col: 1, row: 1 }
    size: { cols: 2, rows: 2 }
  - routine: daily-plan
    position: { col: 3, row: 1 }
    size: { cols: 2, rows: 2 }
`,
    })

    // Board order follows listDashboards' sort, so: corza before main.
    expect(await streamPlacements("token", DATA_REPO)).toEqual({
      // Placed twice — a routine may be arranged on any number of boards.
      "daily-plan": ["corza", "main"],
      "corza-prs": ["corza"],
    })
  })

  // A hole in the map is indistinguishable from an orphan, and the board acts
  // on that answer (it offers to delete the routine from the repo). So an
  // unreadable layout has to poison the whole result rather than quietly drop
  // its board's placements.
  it("returns null when any board's layout can't be read", async () => {
    seedConfig()
    seedRepo(DATA_REPO, {
      "data/dashboards/corza.yaml": `grid: { columns: 4, rowHeight: 150 }
widgets:
  - routine: corza-prs
    position: { col: 1, row: 1 }
    size: { cols: 2, rows: 2 }
`,
    })
    failPath(DATA_REPO, "data/dashboards/corza.yaml", { status: 500 })

    expect(await streamPlacements("token", DATA_REPO)).toBeNull()
  })

  it("returns null when the repo has no readable dashboards dir", async () => {
    seedRepo(DATA_REPO, { "data/routines.yaml": ROUTINES_YAML })

    expect(await streamPlacements("token", DATA_REPO)).toBeNull()
  })
})

describe("loadArtifactVersion", () => {
  const SLUG = "daily-plan"
  const PATH = "w/daily-plan/index.html"

  it("reads a run's artifact body at its receipt commit", async () => {
    seedRepo(DATA_REPO, { [PATH]: "<p>v1</p>" }, "c0ffee1")

    const version = await loadArtifactVersion(
      "token",
      DATA_REPO,
      SLUG,
      "c0ffee1",
    )

    expect(version).toEqual({ html: "<p>v1</p>" })
  })

  it("returns null html when the widget didn't exist at that commit", async () => {
    // The path exists on another ref, but not at the requested commit — a
    // receipt from before the widget, or after a deletion.
    seedRepo(DATA_REPO, { [PATH]: "<p>v1</p>" }, "artifacts")

    const version = await loadArtifactVersion(
      "token",
      DATA_REPO,
      SLUG,
      "deadbee",
    )

    expect(version).toEqual({ html: null })
  })

  it("degrades a 5xx to unreachable rather than throwing", async () => {
    seedRepo(DATA_REPO, { [PATH]: "<p>v1</p>" }, "c0ffee1")
    failPath(DATA_REPO, PATH, { status: 502, endpoint: "contents" })

    const version = await loadArtifactVersion(
      "token",
      DATA_REPO,
      SLUG,
      "c0ffee1",
    )

    expect(version).toEqual({ html: null, unreachable: true })
  })
})

/**
 * The rail's failure modes all look the same on screen: a board that lost its
 * section renders as an ungrouped board, a repo whose collaborators failed
 * renders as a solo private repo, a repo whose freshness failed renders as
 * never-published. Each is a plausible rail, which is why `degraded` — the
 * flag that keeps a result out of the SWR cache — has to distinguish "this is
 * the answer" from "we could not read the answer".
 */
describe("loadSidebar", () => {
  beforeEach(() => __resetRepoCache())

  const SECTIONED_YAML = `section: clients
${DASHBOARD_YAML}`

  function seedRail() {
    seedRepo(DATA_REPO, {
      "data/routines.yaml": ROUTINES_YAML,
      "data/repo.yaml": "name: Personal\nsections:\n  - clients\n",
      "data/dashboards/main.yaml": DASHBOARD_YAML,
      "data/dashboards/corza.yaml": SECTIONED_YAML,
    })
  }

  it("groups boards by their section, and is not degraded", async () => {
    seedRail()

    const sidebar = await loadSidebar("token", LOGIN)

    expect(sidebar.degraded).toBe(false)
    expect(sidebar.repos[0].sections).toEqual(["clients"])
    expect(sidebar.repos[0].dashboards).toEqual([
      expect.objectContaining({ slug: "corza", section: "clients" }),
      expect.objectContaining({ slug: "main", section: null }),
    ])
  })

  it("degrades when a board's section read fails, rather than silently ungrouping it", async () => {
    // The reported bug: a transient failure on one board's layout dropped it
    // out of its section, and the resulting rail was cached as authoritative.
    seedRail()
    failPath(DATA_REPO, "data/dashboards/corza.yaml", {
      status: 503,
      endpoint: "contents",
    })

    const sidebar = await loadSidebar("token", LOGIN)

    // Still renders — best-effort, never a failed rail...
    expect(sidebar.repos[0].dashboards).toEqual([
      expect.objectContaining({ slug: "corza", section: null }),
      expect.objectContaining({ slug: "main", section: null }),
    ])
    // ...but marked, so streamSidebar won't cache this shape.
    expect(sidebar.degraded).toBe(true)
  })

  it("treats a board with no layout file as genuinely ungrouped, not degraded", async () => {
    // The other side of the same coin: absent is an answer, and a rail built
    // from answers must stay cacheable.
    seedRail()
    seedRepo(DATA_REPO, { "data/dashboards/orphan.yaml": "" })
    failPath(DATA_REPO, "data/dashboards/orphan.yaml", {
      status: 404,
      endpoint: "contents",
    })

    const sidebar = await loadSidebar("token", LOGIN)

    expect(sidebar.degraded).toBe(false)
    expect(sidebar.repos[0].dashboards).toContainEqual(
      expect.objectContaining({ slug: "orphan", section: null }),
    )
  })

  it("degrades when the section order cannot be read", async () => {
    // Losing repo.yaml reshuffles every section into alphabetical order —
    // invisible on screen, so it must not be cached.
    seedRail()
    failPath(DATA_REPO, "data/repo.yaml", { status: 503, endpoint: "contents" })

    const sidebar = await loadSidebar("token", LOGIN)

    expect(sidebar.repos[0].sections).toEqual([])
    expect(sidebar.degraded).toBe(true)
  })

  it("degrades when collaborators fail transiently, but not for a plain reader's 403", async () => {
    seedRail()
    seedRepoMeta(DATA_REPO, { collaborators: "forbidden" })

    const reader = await loadSidebar("token", LOGIN)

    expect(reader.repos[0].collaborators).toBeNull()
    expect(reader.degraded).toBe(false)

    __resetRepoCache()
    seedRepoMeta(DATA_REPO, { collaborators: "unavailable" })

    const flaky = await loadSidebar("token", LOGIN)

    expect(flaky.repos[0].collaborators).toBeNull()
    expect(flaky.degraded).toBe(true)
  })

  it("degrades when freshness cannot be read, rather than dating every board unknown", async () => {
    seedRail()
    failPath(DATA_REPO, "", { status: 503, endpoint: "commits" })

    const sidebar = await loadSidebar("token", LOGIN)

    expect(
      sidebar.repos[0].dashboards.every((board) => board.lastRunAt === null),
    ).toBe(true)
    expect(sidebar.degraded).toBe(true)
  })
})
