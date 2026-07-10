import {
  type DashboardFile,
  type RoutinesFile,
  dashboardFileSchema,
  dashboardPath,
  DASHBOARDS_DIR,
  isManual,
  parseDashboardFile,
  parseRoutinesFile,
  routineHost,
  triggerPath,
} from "@bulletin/schema"

import { data } from "react-router"

import type { BoardScope } from "./board.ts"
import type { DiscoveredSkill } from "./skills.ts"
import { env } from "./env.server.ts"
import {
  getFile,
  getLastCommitDate,
  GitHubError,
  listDirectory,
  repoExists,
} from "./github.server.ts"
import { discoverRoutineSkills } from "./skills.server.ts"

export interface ArtifactInfo {
  /** null → never published: render the placeholder card (ADR-0002). */
  html: string | null
  /** ISO date of the last publish commit, the "ran Xh ago" footer. */
  lastRunAt: string | null
  /** GitHub couldn't serve this artifact right now (5xx) — the widget
      renders an "unreachable" state instead of failing the whole board. */
  unreachable?: boolean
  /** For a manual cloud routine: whether its API trigger file exists, so the
      tile can tell "press update" from "set the trigger up first" (ADR-0016).
      undefined → not a manual cloud routine, or the check couldn't run. */
  hasTrigger?: boolean
}

/**
 * Which board a request targets. `repo` is always derived server-side from
 * the session login or BULLETIN_TEAM_REPO — never from client input — so a
 * request can only ever reach repos the resolution rules name (ADR-0010).
 */
export interface BoardRef {
  scope: BoardScope
  repo: string
  /** Dashboard slug; the layout file is data/dashboards/<slug>.yaml. */
  dashboard: string
}

/**
 * Everything a board needs to render its chrome and grid *except* the widget
 * artifacts — routines, layout, discovered skills, sibling boards. Fast
 * enough to await
 * on the request path (a handful of GitHub reads), so redirects and 404s stay
 * in the loader. The artifacts, many more round trips, stream in after
 * (loadArtifacts) so the frame paints without waiting on them.
 */
export interface DashboardBase {
  dataRepo: string
  scope: BoardScope
  dashboardSlug: string
  /** Display name from the layout file; UI falls back to the slug. */
  dashboardName: string | null
  routines: RoutinesFile
  dashboard: DashboardFile
  /** Routine-capable skills for the add-routine picker, read live from the
      board's data repo and the plugins repo (ADR-0015). */
  skills: DiscoveredSkill[]
  /** Sibling dashboards in the same repo, for the switcher. */
  dashboards: string[]
  /** Base blob SHAs config was loaded at — drafts key off these (ADR-0003). */
  baseShas: { routines: string | null; dashboard: string | null }
  /** Raw file bodies, so the Sync panel diffs against exactly what's on main. */
  baseFiles: { routines: string | null; dashboard: string | null }
}

export interface DashboardView extends DashboardBase {
  /** Keyed by routine slug. The client joins these with the draft config,
      so a draft that reshapes the grid still finds its artifacts. */
  artifacts: Record<string, ArtifactInfo>
}

export function resolveDataRepo(login: string, override?: string): string {
  return override ?? `${login}/${env().BULLETIN_DATA_REPO_PREFIX}${login}`
}

/** The org-owned team data repo (ADR-0010), or null when not configured. */
export function resolveTeamRepo(): string | null {
  return env().BULLETIN_TEAM_REPO ?? null
}

export function dataRepoExists(token: string, dataRepo: string) {
  return repoExists(token, dataRepo)
}

/**
 * Dashboard slugs in a repo — the data/dashboards/ dir listing is the index
 * (no separate index file to drift). Returns null when the dir, repo, or
 * access is missing so callers can degrade to "no boards here".
 */
export async function listDashboards(
  token: string,
  repo: string,
): Promise<string[] | null> {
  const entries = await listDirectory(token, repo, DASHBOARDS_DIR)
  if (!entries) return null
  return entries
    .filter((entry) => entry.type === "file" && entry.name.endsWith(".yaml"))
    .map((entry) => entry.name.slice(0, -".yaml".length))
    .sort()
}

/**
 * The board's structure (config from the data repo's main, skills discovered
 * live across source repos, sibling boards) — everything but the artifacts.
 * Route loaders await this so redirect/404 decisions stay on the request path.
 */
export async function loadDashboardStructure(
  token: string,
  ref: BoardRef,
): Promise<DashboardBase> {
  const plugins = env().BULLETIN_PLUGINS_REPO
  const [routinesRaw, dashboardRaw, skills, dashboards] = await Promise.all([
    // Pin the ref so the loader and /sync read the *same* ETag-cache entry:
    // reading with no ref keys a separate entry that can hold a different SHA
    // for the same file, which surfaced as a false "base moved" (ADR-0003).
    getFile(token, ref.repo, "data/routines.yaml", "main"),
    getFile(token, ref.repo, dashboardPath(ref.dashboard), "main"),
    discoverRoutineSkills(token, [
      // The board's own repo first — its skills shadow same-named shared
      // ones. On a team board that repo is shared, hence the team badge.
      { repo: ref.repo, source: ref.scope === "team" ? "team" : "private" },
      ...(plugins ? [{ repo: plugins, source: "team" as const }] : []),
    ]),
    listDashboards(token, ref.repo),
  ])

  const routines = routinesRaw
    ? parseRoutinesFile(routinesRaw.text)
    : { routines: [] }
  const dashboard = dashboardRaw
    ? parseDashboardFile(dashboardRaw.text)
    : // Schema defaults fill grid.columns/rowHeight — one source of truth.
      dashboardFileSchema.parse({ grid: {}, widgets: [] })

  return {
    dataRepo: ref.repo,
    scope: ref.scope,
    dashboardSlug: ref.dashboard,
    dashboardName: dashboard.name ?? null,
    routines,
    dashboard,
    skills,
    dashboards: dashboards ?? [ref.dashboard],
    baseShas: {
      routines: routinesRaw?.sha ?? null,
      dashboard: dashboardRaw?.sha ?? null,
    },
    baseFiles: {
      routines: routinesRaw?.text ?? null,
      dashboard: dashboardRaw?.text ?? null,
    },
  }
}

/**
 * Per-routine artifact body + freshness from the artifacts branch, keyed by
 * slug. Loaders return this promise *unawaited* so the grid streams (the
 * WidgetCard skeleton fills each cell until its artifact lands). One widget's
 * artifact failing (GitHub 5xx flap) degrades that cell, never the board.
 */
export async function loadArtifacts(
  token: string,
  ref: BoardRef,
  routines: RoutinesFile,
): Promise<Record<string, ArtifactInfo>> {
  const artifacts: Record<string, ArtifactInfo> = {}
  await Promise.all(
    routines.routines.map(async (routine) => {
      const { slug } = routine
      const path = `w/${slug}/index.html`
      // A manual cloud routine's update button fires an API trigger — the
      // tile needs to know whether that trigger exists (ADR-0016) to tell
      // "press update" from "set it up first". Only those routines carry one.
      const wantsTrigger = routineHost(routine) === "cloud" && isManual(routine)
      // Body and freshness are fetched independently so a commits-API hiccup
      // never discards artifact HTML that loaded fine. And every per-widget
      // failure is isolated — HTTP 5xx, a network drop, an abort/timeout — so
      // one bad cell can't reject the batch and take the whole board down.
      const [body, lastRun, trigger] = await Promise.allSettled([
        getFile(token, ref.repo, path, "artifacts"),
        getLastCommitDate(token, ref.repo, path, "artifacts"),
        wantsTrigger
          ? getFile(token, ref.repo, triggerPath(slug), "main")
          : Promise.resolve(null),
      ])
      // Only a failed *body* fetch means the artifact is unreachable; a
      // missing commit date is just absent freshness, not a dead cell. A
      // failed trigger check leaves hasTrigger undefined (never "missing").
      const hasTrigger = wantsTrigger
        ? trigger.status === "fulfilled"
          ? trigger.value != null
          : undefined
        : undefined
      artifacts[slug] =
        body.status === "fulfilled"
          ? {
              html: body.value?.text ?? null,
              lastRunAt: lastRun.status === "fulfilled" ? lastRun.value : null,
              ...(hasTrigger !== undefined ? { hasTrigger } : {}),
            }
          : {
              html: null,
              lastRunAt: null,
              unreachable: true,
              ...(hasTrigger !== undefined ? { hasTrigger } : {}),
            }
    }),
  )
  return artifacts
}

/**
 * loadDashboardStructure for route loaders: config that can't load at all
 * (GitHub outage) becomes a clear 503 instead of an anonymous error page.
 * Artifact-level failures degrade per-widget in loadArtifacts and never reach
 * this catch.
 */
export async function loadDashboardStructureOr503(
  token: string,
  ref: BoardRef,
): Promise<DashboardBase> {
  try {
    return await loadDashboardStructure(token, ref)
  } catch (error) {
    if (error instanceof GitHubError) {
      throw data(
        "GitHub's API is having trouble right now, so your config couldn't load. The dashboard will be back on the next refresh once GitHub recovers.",
        { status: 503 },
      )
    }
    throw error
  }
}

/**
 * The whole board in one awaited pass — structure plus artifacts. Route
 * loaders stream instead (loadDashboardStructureOr503 + loadArtifacts); this
 * stays for tests and any caller that wants everything resolved up front.
 */
export async function loadDashboard(
  token: string,
  ref: BoardRef,
): Promise<DashboardView> {
  const base = await loadDashboardStructure(token, ref)
  const artifacts = await loadArtifacts(token, ref, base.routines)
  return { ...base, artifacts }
}
