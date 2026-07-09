import {
  type CatalogFile,
  type DashboardFile,
  type RoutinesFile,
  catalogFileSchema,
  dashboardFileSchema,
  parseDashboardFile,
  parseRoutinesFile,
} from "@bulletin/schema"

import { env } from "./env.server.ts"
import {
  getFile,
  getLastCommitDate,
  GitHubError,
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

export interface DashboardView {
  dataRepo: string
  routines: RoutinesFile
  dashboard: DashboardFile
  /** Keyed by routine slug. The client joins these with the draft config,
      so a draft that reshapes the grid still finds its artifacts. */
  artifacts: Record<string, ArtifactInfo>
  catalog: CatalogFile
  /** Base blob SHAs config was loaded at — drafts key off these (ADR-0003). */
  baseShas: { routines: string | null; dashboard: string | null }
  /** Raw file bodies, so the Sync panel diffs against exactly what's on main. */
  baseFiles: { routines: string | null; dashboard: string | null }
}

export function resolveDataRepo(login: string, override?: string): string {
  return override ?? `${login}/${env().BULLETIN_DATA_REPO_PREFIX}${login}`
}

export function dataRepoExists(token: string, dataRepo: string) {
  return repoExists(token, dataRepo)
}

/**
 * Assemble everything the dashboard needs in one loader pass: config from
 * the data repo's main, the catalog from the shared repo, and per-routine
 * artifact + freshness from the artifacts branch.
 */
export async function loadDashboard(
  token: string,
  dataRepo: string,
): Promise<DashboardView> {
  const [routinesRaw, dashboardRaw, catalogRaw] = await Promise.all([
    getFile(token, dataRepo, "data/routines.yaml"),
    getFile(token, dataRepo, "data/dashboard.yaml"),
    getFile(token, env().BULLETIN_SHARED_REPO, "catalog/skills.json"),
  ])

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
          getFile(token, dataRepo, path, "artifacts"),
          getLastCommitDate(token, dataRepo, path, "artifacts"),
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
    dataRepo,
    routines,
    dashboard,
    artifacts,
    catalog,
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
