import {
  type CatalogFile,
  type DashboardFile,
  type RoutinesFile,
  catalogFileSchema,
  dashboardFileSchema,
  dashboardPath,
  DASHBOARDS_DIR,
  parseDashboardFile,
  parseRoutinesFile,
} from "@bulletin/schema"

import { data } from "react-router"

import type { BoardScope } from "./board.ts"
import { env } from "./env.server.ts"
import {
  getFile,
  getLastCommitDate,
  GitHubError,
  listDirectory,
  repoExists,
} from "./github.server.ts"

export interface ArtifactInfo {
  /** null → never published: render the placeholder card (ADR-0002). */
  html: string | null
  /** ISO date of the last publish commit, the "ran Xh ago" footer. */
  lastRunAt: string | null
  /** GitHub couldn't serve this artifact right now (5xx) — the widget
      renders an "unreachable" state instead of failing the whole board. */
  unreachable?: boolean
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

export interface DashboardView {
  dataRepo: string
  scope: BoardScope
  dashboardSlug: string
  /** Display name from the layout file; UI falls back to the slug. */
  dashboardName: string | null
  routines: RoutinesFile
  dashboard: DashboardFile
  /** Keyed by routine slug. The client joins these with the draft config,
      so a draft that reshapes the grid still finds its artifacts. */
  artifacts: Record<string, ArtifactInfo>
  catalog: CatalogFile
  /** Sibling dashboards in the same repo, for the switcher. */
  dashboards: string[]
  /** Base blob SHAs config was loaded at — drafts key off these (ADR-0003). */
  baseShas: { routines: string | null; dashboard: string | null }
  /** Raw file bodies, so the Sync panel diffs against exactly what's on main. */
  baseFiles: { routines: string | null; dashboard: string | null }
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
 * loadDashboard for route loaders: config that can't load at all (GitHub
 * outage) becomes a clear 503 instead of an anonymous error page.
 * Artifact-level failures degrade per-widget inside loadDashboard and
 * never reach the catch.
 */
export async function loadDashboardOr503(
  token: string,
  ref: BoardRef,
): Promise<DashboardView> {
  try {
    return await loadDashboard(token, ref)
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
 * Assemble everything the dashboard needs in one loader pass: config from
 * the data repo's main, the catalog from the shared repo, and per-routine
 * artifact + freshness from the artifacts branch.
 */
export async function loadDashboard(
  token: string,
  ref: BoardRef,
): Promise<DashboardView> {
  const [routinesRaw, dashboardRaw, catalogRaw, dashboards] = await Promise.all(
    [
      getFile(token, ref.repo, "data/routines.yaml"),
      getFile(token, ref.repo, dashboardPath(ref.dashboard)),
      getFile(token, env().BULLETIN_SHARED_REPO, "catalog/skills.json"),
      listDashboards(token, ref.repo),
    ],
  )

  const routines = routinesRaw
    ? parseRoutinesFile(routinesRaw.text)
    : { routines: [] }
  const dashboard = dashboardRaw
    ? parseDashboardFile(dashboardRaw.text)
    : // Schema defaults fill grid.columns/rowHeight — one source of truth.
      dashboardFileSchema.parse({ grid: {}, widgets: [] })
  const catalog = catalogRaw
    ? catalogFileSchema.parse(JSON.parse(catalogRaw.text))
    : { skills: [] }

  const artifacts: Record<string, ArtifactInfo> = {}
  await Promise.all(
    routines.routines.map(async ({ slug }) => {
      const path = `w/${slug}/index.html`
      try {
        const [artifact, lastRunAt] = await Promise.all([
          getFile(token, ref.repo, path, "artifacts"),
          getLastCommitDate(token, ref.repo, path, "artifacts"),
        ])
        artifacts[slug] = { html: artifact?.text ?? null, lastRunAt }
      } catch (error) {
        // One widget's artifact failing (GitHub 5xx flap) must not take
        // down the whole board — degrade that cell, keep the rest.
        if (!(error instanceof GitHubError)) throw error
        artifacts[slug] = { html: null, lastRunAt: null, unreachable: true }
      }
    }),
  )

  return {
    dataRepo: ref.repo,
    scope: ref.scope,
    dashboardSlug: ref.dashboard,
    dashboardName: dashboard.name ?? null,
    routines,
    dashboard,
    artifacts,
    catalog,
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
