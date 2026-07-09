import {
  type CatalogFile,
  type DashboardFile,
  type Routine,
  catalogFileSchema,
  parseDashboardFile,
  parseRoutinesFile,
} from "@bulletin/schema"

import { env } from "./env.server.ts"
import { getFile, getLastCommitDate, repoExists } from "./github.server.ts"

export interface WidgetView {
  routine: Routine
  position: { col: number; row: number }
  size: { cols: number; rows: number }
  /** null → never published: render the placeholder card (ADR-0002). */
  artifactHtml: string | null
  /** ISO date of the last publish commit, the "ran Xh ago" footer. */
  lastRunAt: string | null
}

export interface DashboardView {
  dataRepo: string
  grid: DashboardFile["grid"]
  widgets: WidgetView[]
  /** Routines with no widget on the grid (shown in the routines list). */
  unplacedRoutines: Routine[]
  catalog: CatalogFile
  /** Base blob SHAs config was loaded at — drafts key off these (ADR-0003). */
  baseShas: { routines: string | null; dashboard: string | null }
  /** Raw file bodies, so drafts can diff against exactly what's on main. */
  baseFiles: { routines: string | null; dashboard: string | null }
}

export function resolveDataRepo(login: string, override?: string): string {
  return override ?? `${login}/${env().BULLETIN_DATA_REPO_PREFIX}${login}`
}

export async function dataRepoExists(token: string, dataRepo: string) {
  return repoExists(token, dataRepo)
}

/**
 * Assemble everything the dashboard needs in one loader pass: config from
 * the data repo's main, the catalog from the shared repo, and per-widget
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
    : { grid: { columns: 4, rowHeight: 150 }, widgets: [] }
  const catalog = catalogRaw
    ? catalogFileSchema.parse(JSON.parse(catalogRaw.text))
    : { skills: [] }

  const bySlug = new Map(routines.routines.map((r) => [r.slug, r]))
  const placed = new Set(dashboard.widgets.map((w) => w.routine))

  const widgets = await Promise.all(
    dashboard.widgets.flatMap((widget) => {
      const routine = bySlug.get(widget.routine)
      // A widget pointing at a deleted routine renders nothing rather than
      // crashing the grid; the sync panel is where the user repairs config.
      if (!routine) return []
      return [
        (async (): Promise<WidgetView> => {
          const path = `w/${widget.routine}/index.html`
          const [artifact, lastRunAt] = await Promise.all([
            getFile(token, dataRepo, path, "artifacts"),
            getLastCommitDate(token, dataRepo, path, "artifacts"),
          ])
          return {
            routine,
            position: widget.position,
            size: widget.size,
            artifactHtml: artifact?.text ?? null,
            lastRunAt,
          }
        })(),
      ]
    }),
  )

  return {
    dataRepo,
    grid: dashboard.grid,
    widgets,
    unplacedRoutines: routines.routines.filter((r) => !placed.has(r.slug)),
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
