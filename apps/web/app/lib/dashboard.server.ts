import {
  type DashboardFile,
  type RoutinesFile,
  dashboardFileSchema,
  dashboardPath,
  DASHBOARDS_DIR,
  parseDashboardFile,
  parseRoutinesFile,
  routineHost,
  triggerFileSchema,
  triggerPath,
} from "@steward/schema"

import { data } from "react-router"

import type { DiscoveredTemplate } from "./templates.ts"
import {
  type Collaborator,
  getFile,
  getLastCommitDate,
  GitHubError,
  listCollaborators,
  listDirectory,
  repoExists,
} from "./github.server.ts"
import { listDataRepos } from "./repos.server.ts"
import { discoverTemplates } from "./templates.server.ts"

export interface ArtifactInfo {
  /** null → never published: render the placeholder card (ADR-0002). */
  html: string | null
  /** Blob SHA of the artifact file, straight from the contents API — it tracks
      the branch tip immediately, so the client clears a pending run the moment
      the SHA changes (pending-runs.ts). null → never published or unreachable. */
  sha: string | null
  /** ISO date of the last publish commit, the "ran Xh ago" footer. */
  lastRunAt: string | null
  /** GitHub couldn't serve this artifact right now (5xx) — the widget
      renders an "unreachable" state instead of failing the whole board. */
  unreachable?: boolean
  /** For a manual cloud routine: whether its API trigger file exists, so the
      tile can tell "press update" from "set the trigger up first" (ADR-0016).
      undefined → not a manual cloud routine, or the check couldn't run. */
  hasTrigger?: boolean
  /** The cloud routine's id, read from its trigger file — the same id the fire
      API addresses (ADR-0016) and the claude.ai routine page keys on. Present
      only for a cloud routine whose trigger file exists and parses; undefined
      otherwise (local, no trigger, or an unreadable/legacy trigger). */
  routineId?: string
}

/**
 * Which board a request targets. `repo` always passes the registry gate
 * (requireDataRepo, ADR-0023) before it gets here — a client-supplied repo
 * can only ever be a topic-tagged data repo the viewer's token can read.
 */
export interface BoardRef {
  repo: string
  /** Not the viewer's home repo — an org repo or another user's repo shared
      with them. Drives the runner rule and the template-source badge. */
  shared: boolean
  /** Dashboard slug; the layout file is data/dashboards/<slug>.yaml. */
  dashboard: string
}

/**
 * Everything a board needs to render its chrome and grid *except* the widget
 * artifacts — routines, layout, discovered templates, sibling boards. Fast
 * enough to await
 * on the request path (a handful of GitHub reads), so redirects and 404s stay
 * in the loader. The artifacts, many more round trips, stream in after
 * (loadArtifacts) so the frame paints without waiting on them.
 */
export interface DashboardBase {
  dataRepo: string
  /** Mirrors {@link BoardRef.shared} for the client (runner rule, badges). */
  isShared: boolean
  dashboardSlug: string
  /** Display name from the layout file; UI falls back to the slug. */
  dashboardName: string | null
  routines: RoutinesFile
  dashboard: DashboardFile
  /** Routine templates for the add-routine picker — the board's data repo
      read live, plus the bundled built-ins (ADR-0021). */
  templates: DiscoveredTemplate[]
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

export function dataRepoExists(token: string, dataRepo: string) {
  return repoExists(token, dataRepo)
}

/**
 * The shared GitHub-outage degrade: a 503 the root ErrorBoundary renders as a
 * "back on the next refresh" page instead of the generic crash. `loader`-path
 * callers throw this whenever a GitHub read can't complete for a transient
 * reason (ADR: degrade, not crash).
 */
function githubOutage503(): never {
  throw data(
    "GitHub's API is having trouble right now, so your config couldn't load. The dashboard will be back on the next refresh once GitHub recovers.",
    { status: 503 },
  )
}

/**
 * The dead-session degrade: a revoked or expired token 401s on every read, so
 * "back on the next refresh" is a lie — refreshing replays the same dead token
 * forever. That's not a transient outage; it's a session the user must re-auth.
 * The root ErrorBoundary always renders a working sign-out, so this state is an
 * escape hatch, not a trap.
 */
function sessionExpired401(): never {
  throw data(
    "Your GitHub session has expired or was revoked, so your config couldn't load. Sign out and sign in again to reconnect.",
    { status: 401 },
  )
}

/**
 * Turn a GitHub read failure into the right loader degrade: a 401 is a dead
 * token (re-auth), every other GitHubError — 5xx, rate-limit 403, timeout,
 * network blip — is the transient class that recovers on the next refresh.
 * Non-GitHub errors are re-thrown to the generic crash boundary.
 */
function degradeGitHubError(error: unknown): never {
  if (error instanceof GitHubError) {
    if (error.status === 401) sessionExpired401()
    githubOutage503()
  }
  throw error
}

/**
 * repoExists for route loaders: a transient GitHub failure (5xx, rate limit,
 * network blip, timeout) becomes a 503 refresh page rather than the generic
 * crash — or a false "repo missing" that would bounce an existing user into
 * the setup wizard mid-outage. A dead token (401) becomes a 401 re-auth page
 * instead. A definitive 404 still returns false.
 */
export async function repoExistsOr503(
  token: string,
  repo: string,
): Promise<boolean> {
  try {
    return await repoExists(token, repo)
  } catch (error) {
    degradeGitHubError(error)
  }
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

/** One rail group: a data repo and its boards. */
export interface SidebarRepo {
  /** `owner/name`. */
  repo: string
  /** Short repo name — the group label. */
  name: string
  isHome: boolean
  /** null → visibility unknown (metadata degraded); UI omits the badge. */
  private: boolean | null
  /** Who has access — the group header's avatar stack. null → not listable
      (the viewer lacks push access, or the call flaked): stack omitted.
      Access control itself is GitHub's; this is a mirror, never a gate. */
  collaborators: Collaborator[] | null
  /** Gates where the header's external link lands: repo access settings
      for admins, the repo page otherwise. null → unknown. */
  viewerIsAdmin: boolean | null
  /** Board slugs. `[]` — the repo is alive with no boards yet (git prunes
      `data/dashboards/` with the last file): the group stays, carrying its
      create-first row. */
  dashboards: string[]
}

export interface SidebarData {
  repos: SidebarRepo[]
  /** false → discovery degraded: groups may be missing. The rail renders a
      quiet notice, never an error. */
  complete: boolean
}

/**
 * Everything the rail lists: every discovered data repo (ADR-0023) with its
 * boards, home first. Each repo's board listing is failure-isolated — one
 * flaky repo degrades to its own empty group, never the whole rail.
 */
export async function loadSidebar(
  token: string,
  login: string,
  override?: string,
): Promise<SidebarData> {
  const listing = await listDataRepos(token, login, override)
  const repos = await Promise.all(
    listing.repos.map(async (repo) => {
      const [dashboards, collaborators] = await Promise.all([
        listDashboards(token, repo.full).catch(() => null),
        // Best-effort by contract (403 for plain readers → null).
        listCollaborators(token, repo.full),
      ])
      return {
        repo: repo.full,
        name: repo.name,
        isHome: repo.isHome,
        private: repo.private,
        collaborators,
        viewerIsAdmin: repo.viewerIsAdmin,
        dashboards: dashboards ?? [],
      }
    }),
  )
  return { repos, complete: listing.complete }
}

/**
 * loadSidebar for route loaders: a dead token degrades to the 401 re-auth
 * page, a transient GitHub failure to the 503 refresh page — same contract
 * as loadDashboardStructureOr503.
 */
export async function loadSidebarOr503(
  token: string,
  login: string,
  override?: string,
): Promise<SidebarData> {
  try {
    return await loadSidebar(token, login, override)
  } catch (error) {
    degradeGitHubError(error)
  }
}

/**
 * The board's structure (config from the data repo's main, templates from
 * the data repo + built-ins, sibling boards) — everything but the artifacts.
 * Route loaders await this so redirect/404 decisions stay on the request path.
 */
export async function loadDashboardStructure(
  token: string,
  ref: BoardRef,
): Promise<DashboardBase> {
  const [routinesRaw, dashboardRaw, templates, dashboards] = await Promise.all([
    // Pin the ref so the loader and /sync read the *same* ETag-cache entry:
    // reading with no ref keys a separate entry that can hold a different
    // SHA for the same file, which surfaced as a false "base moved"
    // (ADR-0003).
    getFile(token, ref.repo, "data/routines.yaml", "main"),
    getFile(token, ref.repo, dashboardPath(ref.dashboard), "main"),
    // The board's own repo — its templates are scoped to this repo's
    // boards and shadow same-named built-ins (ADR-0023).
    discoverTemplates(token, ref.repo),
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
    isShared: ref.shared,
    dashboardSlug: ref.dashboard,
    dashboardName: dashboard.name ?? null,
    routines,
    dashboard,
    templates,
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
      // A cloud routine's run-now controls fire an API trigger — the tile
      // needs to know whether that trigger exists (ADR-0016) to tell "run it
      // now" from "set it up first". Manual routines can't run without one;
      // scheduled ones use it for the first-run and Update affordances.
      const wantsTrigger = routineHost(routine) === "cloud"
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
      // The routine id rides in the trigger file body — parse it out for the
      // claude.ai link and the fire path. A malformed trigger just leaves it
      // undefined (the link is suppressed), never fails the cell.
      let routineId: string | undefined
      if (trigger.status === "fulfilled" && trigger.value) {
        try {
          routineId = triggerFileSchema.parse(
            JSON.parse(trigger.value.text),
          ).routine
        } catch {
          routineId = undefined
        }
      }
      const triggerFields = {
        ...(hasTrigger !== undefined ? { hasTrigger } : {}),
        ...(routineId !== undefined ? { routineId } : {}),
      }
      artifacts[slug] =
        body.status === "fulfilled"
          ? {
              html: body.value?.text ?? null,
              sha: body.value?.sha ?? null,
              lastRunAt: lastRun.status === "fulfilled" ? lastRun.value : null,
              ...triggerFields,
            }
          : {
              html: null,
              sha: null,
              lastRunAt: null,
              unreachable: true,
              ...triggerFields,
            }
    }),
  )
  return artifacts
}

/**
 * loadDashboardStructure for route loaders: config that can't load at all
 * becomes a clear degrade instead of an anonymous error page — a 503 refresh
 * page for a GitHub outage, or a 401 re-auth page for a dead token. Artifact-
 * level failures degrade per-widget in loadArtifacts and never reach this catch.
 */
export async function loadDashboardStructureOr503(
  token: string,
  ref: BoardRef,
): Promise<DashboardBase> {
  try {
    return await loadDashboardStructure(token, ref)
  } catch (error) {
    degradeGitHubError(error)
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

/**
 * The routine pool of one data repo (ADR-0025): every routine in
 * data/routines.yaml plus, for each, which boards place it — the map the pool
 * view uses to surface orphans (a routine on no board) and route to where a
 * routine renders. Structure only; freshness/state streams in via loadArtifacts
 * exactly as the board does, so the table paints before the artifact reads land.
 */
export interface RoutinesPool {
  routines: RoutinesFile
  /** routines.yaml blob SHA + body — the pool view's draft base (ADR-0003). */
  baseSha: string | null
  baseFile: string | null
  /** Board slugs each routine is placed on, keyed by routine slug. A slug
      absent here (or mapped to []) is an orphan: in the pool, on no board. */
  boardsByRoutine: Record<string, string[]>
  /** Every board slug in the repo — the add-to-board picker's options. */
  dashboards: string[]
}

export async function loadRoutinesPool(
  token: string,
  repo: string,
): Promise<RoutinesPool> {
  const [routinesRaw, slugs] = await Promise.all([
    getFile(token, repo, "data/routines.yaml", "main"),
    listDashboards(token, repo),
  ])
  const routines = routinesRaw
    ? parseRoutinesFile(routinesRaw.text)
    : { routines: [] }
  const dashboards = slugs ?? []

  // Read each board's layout to learn placements. One flaky board degrades to
  // "placements unknown for that board" (dropped from the map), never a failed
  // page — the same failure-isolation the sidebar's per-repo listing uses.
  const layouts = await Promise.all(
    dashboards.map((slug) =>
      getFile(token, repo, dashboardPath(slug), "main")
        .then((raw) =>
          raw ? { slug, file: parseDashboardFile(raw.text) } : null,
        )
        .catch(() => null),
    ),
  )
  const boardsByRoutine: Record<string, string[]> = {}
  for (const layout of layouts) {
    if (!layout) continue
    for (const widget of layout.file.widgets) {
      ;(boardsByRoutine[widget.routine] ??= []).push(layout.slug)
    }
  }

  return {
    routines,
    baseSha: routinesRaw?.sha ?? null,
    baseFile: routinesRaw?.text ?? null,
    boardsByRoutine,
    dashboards,
  }
}

/** loadRoutinesPool for route loaders: same degrade contract as the board
    loaders — a dead token becomes the 401 re-auth page, any other transient
    GitHub failure the 503 refresh page. */
export async function loadRoutinesPoolOr503(
  token: string,
  repo: string,
): Promise<RoutinesPool> {
  try {
    return await loadRoutinesPool(token, repo)
  } catch (error) {
    degradeGitHubError(error)
  }
}
