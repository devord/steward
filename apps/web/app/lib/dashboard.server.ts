import {
  type DashboardFile,
  type Routine,
  type RoutinesFile,
  dashboardFileSchema,
  dashboardPath,
  DASHBOARDS_DIR,
  parseDashboardFile,
  parseRepoFile,
  parseRoutinesFile,
  REPO_FILE_PATH,
  routineHost,
  triggerFileSchema,
  triggerPath,
} from "@steward/schema"

import { data } from "react-router"

import type { RunReceipt } from "./runs.ts"
import type { DiscoveredTemplate } from "./templates.ts"
import {
  type Collaborator,
  getFile,
  getLastCommitDate,
  GitHubError,
  listArtifactPublishDates,
  listCollaborators,
  listDirectory,
  listPathCommits,
  repoExists,
} from "./github.server.ts"
import { listDataRepos } from "./repos.server.ts"
import { isStale } from "./routine-status.ts"
import { invalidateSwr, swr, tokenKey } from "./swr.server.ts"
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
  /** Claude account email that owns the cloud routine, from its trigger file
      (ADR-0029). undefined for triggers committed before the field existed. */
  claudeAccount?: string
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
  routines: RoutinesFile
  dashboard: DashboardFile
  /** Sibling dashboards in the same repo, for the switcher. */
  dashboards: string[]
  /** Base blob SHAs config was loaded at — drafts key off these (ADR-0003). */
  baseShas: { routines: string | null; dashboard: string | null }
  /** Raw file bodies, so the Sync panel diffs against exactly what's on main. */
  baseFiles: { routines: string | null; dashboard: string | null }
}

export interface DashboardView extends DashboardBase {
  /** Routine templates for the add-routine picker — the board's data repo
      read live, plus the bundled built-ins (ADR-0021). Streamed on the route
      loaders (ADR-0030); resolved here only for loadDashboard callers. */
  templates: DiscoveredTemplate[]
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

/**
 * listDashboards plus each board's section, for the rail: one extra
 * ETag-cached read per board, behind the sidebar's SWR window. Every read is
 * best-effort — a missing or malformed layout file is just "ungrouped, no
 * freshness" (the row shows its slug), never a failed group.
 *
 * Ordered by slug — the row's label (ADR-0039), so the rail reads as sorted.
 */
async function listSidebarBoards(
  token: string,
  repo: string,
): Promise<RawSidebarBoard[] | null> {
  const slugs = await listDashboards(token, repo)
  if (!slugs) return null
  const boards = await Promise.all(
    slugs.map(async (slug) => {
      // One read yields the row's section and (kept for freshness, ADR-0035)
      // the routine slugs its widgets render — a malformed or missing file
      // degrades both (ungrouped, no freshness); the row shows its slug.
      const meta = await getFile(token, repo, dashboardPath(slug), "main")
        .then((raw) => (raw ? parseDashboardFile(raw.text) : null))
        .catch(() => null)
      return {
        slug,
        section: meta?.section ?? null,
        routineSlugs: meta?.widgets.map((widget) => widget.routine) ?? [],
      }
    }),
  )
  return boards.sort((a, b) =>
    a.slug.localeCompare(b.slug, undefined, { sensitivity: "base" }),
  )
}

/** How many artifacts-branch commits the rail scans for freshness — one page
    (ADR-0035). A slug not published within this window reads "unknown". */
const FRESHNESS_COMMITS = 100

/**
 * Roll a board's widgets up into its rail freshness (ADR-0035): the age is its
 * *stalest* widget's last publish (the most-behind content), and `stale` is
 * true if *any* widget is overdue against its own routine's schedule
 * (`isStale`). Widgets with no known publish date (never run, or beyond the
 * scanned window) contribute no age and, lacking a `lastRunAt`, are never
 * "stale" on their own (ADR-0016) — the board reads unknown, never wrong.
 */
function rollUpFreshness(
  routineSlugs: string[],
  publishDates: Map<string, string> | null,
  routinesBySlug: Map<string, Routine>,
  now: number,
): { lastRunAt: string | null; stale: boolean } {
  let oldest: string | null = null
  let stale = false
  for (const slug of routineSlugs) {
    const date = publishDates?.get(slug) ?? null
    if (
      date != null &&
      (oldest == null || Date.parse(date) < Date.parse(oldest))
    ) {
      oldest = date
    }
    const routine = routinesBySlug.get(slug)
    if (routine && isStale(routine, date, now)) stale = true
  }
  return { lastRunAt: oldest, stale }
}

/** One board row in the rail. */
export interface SidebarBoard {
  slug: string
  /** Section this board sits in (the layout file's `section`). null →
      ungrouped: the board leads its repo group in the unlabeled section. */
  section: string | null
  /** Freshness age: the board's *stalest* widget's last publish, ISO
      (ADR-0035) — a board is only as fresh as its most-behind content. null →
      unknown (no widget, none run, or beyond the read window): the row shows
      a faint dot and no age. */
  lastRunAt: string | null
  /** Any widget overdue against its routine's cron schedule (`isStale`,
      ADR-0016/0035). Reddens the board's freshness dot; false for fresh,
      manual, and never-run boards. */
  stale: boolean
}

/** listSidebarBoards' internal row: the layout facts plus the routine slugs its
    widgets render, kept from the same read so loadSidebar can roll up freshness
    (ADR-0035) without a second parse. loadSidebar turns it into a
    {@link SidebarBoard}, adding `lastRunAt`/`stale`. */
interface RawSidebarBoard {
  slug: string
  section: string | null
  routineSlugs: string[]
}

/** One rail group: a data repo and its boards. */
export interface SidebarRepo {
  /** `owner/name`. */
  repo: string
  /** Short repo name — the group label when no display name is set. */
  name: string
  /** Display name from the repo's data/repo.yaml (ADR-0026). null → unset
      or unreadable: the group falls back to the short name / "Personal". */
  displayName: string | null
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
  /** Gates the rename affordance — the display name is a commit, so it
      needs push access. null → unknown: affordance withheld. */
  viewerCanPush: boolean | null
  /** Boards, by slug. `[]` — the repo is alive with no boards yet (git prunes
      `data/dashboards/` with the last file): the group stays, carrying its
      create-first row. */
  dashboards: SidebarBoard[]
  /** Section order for this repo (data/repo.yaml `sections`, ADR-0034/0039).
      Carries sequence only — membership rides each board's `section`. `[]` →
      no order authored: sections fall back to alphabetical. */
  sections: string[]
}

export interface SidebarData {
  repos: SidebarRepo[]
  /** false → discovery degraded: groups may be missing. The rail renders a
      quiet notice, never an error. */
  complete: boolean
  /** true → data behind the rail failed to load transiently: a repo's board
      listing (an empty group here is indistinguishable from a real one) or
      partial discovery. Best-effort is still returned to render, but a
      degraded rail is never cached (streamSidebar), so the next navigation
      retries live instead of stranding the gap for the SWR window. */
  degraded: boolean
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
  const now = Date.now()
  const listing = await listDataRepos(token, login, override)
  // A failed board listing (rate limit, 5xx, network) stays isolated to its
  // own repo group per ADR-0023, but it marks the whole load degraded so the
  // empty group it produces is never cached as if the repo simply had no
  // boards (streamSidebar). Collaborators/repo.yaml are best-effort by
  // contract — their absence is expected, not a degrade.
  let degraded = false
  const repos = await Promise.all(
    listing.repos.map(async (repo) => {
      const [boards, collaborators, repoFile, publishDates, routines] =
        await Promise.all([
          // A failed board listing marks the whole load degraded (never cached),
          // so its empty group isn't mistaken for a repo with no boards.
          listSidebarBoards(token, repo.full).catch(() => {
            degraded = true
            return null
          }),
          // Best-effort by contract (403 for plain readers → null).
          listCollaborators(token, repo.full),
          // Best-effort too: an absent or malformed repo.yaml is just "no
          // display name", never a failed rail.
          getFile(token, repo.full, REPO_FILE_PATH, "main")
            .then((raw) => (raw ? parseRepoFile(raw.text) : null))
            .catch(() => null),
          // Freshness inputs (ADR-0035), both best-effort — a flaky read just
          // degrades every board's dot to "unknown", never a failed rail (so,
          // unlike the board listing, these don't mark the load degraded):
          // one artifacts-branch page dates each widget's last publish,
          listArtifactPublishDates(token, repo.full, FRESHNESS_COMMITS).catch(
            () => null,
          ),
          // and routines.yaml carries the schedules `isStale` judges against.
          getFile(token, repo.full, "data/routines.yaml", "main")
            .then((raw) => (raw ? parseRoutinesFile(raw.text) : null))
            .catch(() => null),
        ])
      const routinesBySlug = new Map(
        (routines?.routines ?? []).map((routine) => [routine.slug, routine]),
      )
      const dashboards: SidebarBoard[] = (boards ?? []).map(
        ({ routineSlugs, ...board }) => ({
          ...board,
          ...rollUpFreshness(routineSlugs, publishDates, routinesBySlug, now),
        }),
      )
      return {
        repo: repo.full,
        name: repo.name,
        displayName: repoFile?.name ?? null,
        isHome: repo.isHome,
        private: repo.private,
        collaborators,
        viewerIsAdmin: repo.viewerIsAdmin,
        viewerCanPush: repo.viewerCanPush,
        dashboards,
        sections: repoFile?.sections ?? [],
      }
    }),
  )
  return { repos, complete: listing.complete, degraded }
}

/** SWR key prefix for one viewer's sidebar entries (ADR-0030). */
function sidebarKeyPrefix(token: string): string {
  return `sidebar:${tokenKey(token)}`
}

/** How long a served rail may lag reality before a background refresh. */
const SIDEBAR_TTL_MS = 60_000

/**
 * loadSidebar for route loaders (ADR-0030): served through the SWR cache —
 * the rail is chrome, and a rail up to a minute behind is invisible next to
 * paying its two GitHub round-trip waves on every navigation — and returned
 * as a promise the routes stream, never await. Failures degrade to an empty
 * rail with the quiet incomplete notice, never a failed page: the content
 * loader owns the real 401/503 degrade. Mutations that change what the rail
 * lists call {@link invalidateSidebarCache}.
 */
export function streamSidebar(
  token: string,
  login: string,
  override?: string,
): Promise<SidebarData> {
  return swr(
    `${sidebarKeyPrefix(token)}:${override ?? ""}`,
    SIDEBAR_TTL_MS,
    () => loadSidebar(token, login, override),
    SIDEBAR_TTL_MS * 10,
    // Only a fully-successful rail is cached. A degraded load is still returned
    // so the render stays best-effort, but writing it would let SWR serve that
    // empty rail stale for the whole max-age window — and a refresh (which
    // repairs only in the background) would keep showing it, the exact bug
    // where the rail's boards vanish and only re-auth or another navigation
    // brings them back. Skipping the write makes the next navigation retry live
    // and self-heal.
    (data) => data.complete && !data.degraded,
  ).catch(() => ({ repos: [], complete: false, degraded: true }))
}

/**
 * Drop the viewer's cached rail. Every mutation that changes what the rail
 * lists calls this — board create/delete (dashboards.ts), repo
 * create/register/rename (data-repos.ts, setup.tsx) — so the change shows on
 * the very next load instead of after the SWR window.
 */
export function invalidateSidebarCache(token: string): void {
  invalidateSwr(sidebarKeyPrefix(token))
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
  const [routinesRaw, dashboardRaw, dashboards] = await Promise.all([
    // Pin the ref so the loader and /sync read the *same* ETag-cache entry:
    // reading with no ref keys a separate entry that can hold a different
    // SHA for the same file, which surfaced as a false "base moved"
    // (ADR-0003).
    getFile(token, ref.repo, "data/routines.yaml", "main"),
    getFile(token, ref.repo, dashboardPath(ref.dashboard), "main"),
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
    routines,
    dashboard,
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
      // The routine id and owning account ride in the trigger file body —
      // parsed out for the claude.ai link, the fire path, and the pool's
      // account column (ADR-0029). A malformed trigger just leaves them
      // undefined (the affordances are suppressed), never fails the cell.
      let routineId: string | undefined
      let claudeAccount: string | undefined
      if (trigger.status === "fulfilled" && trigger.value) {
        try {
          const parsed = triggerFileSchema.parse(JSON.parse(trigger.value.text))
          routineId = parsed.routine
          claudeAccount = parsed.account
        } catch {
          routineId = undefined
        }
      }
      const triggerFields = {
        ...(hasTrigger !== undefined ? { hasTrigger } : {}),
        ...(routineId !== undefined ? { routineId } : {}),
        ...(claudeAccount !== undefined ? { claudeAccount } : {}),
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
 * The whole board in one awaited pass — structure plus templates plus
 * artifacts. Route loaders stream the latter two instead
 * (loadDashboardStructureOr503 + streamed discoverTemplates/loadArtifacts,
 * ADR-0030); this stays for tests and any caller that wants everything
 * resolved up front.
 */
export async function loadDashboard(
  token: string,
  ref: BoardRef,
): Promise<DashboardView> {
  const base = await loadDashboardStructure(token, ref)
  const [templates, artifacts] = await Promise.all([
    discoverTemplates(token, ref.repo),
    loadArtifacts(token, ref, base.routines),
  ])
  return { ...base, templates, artifacts }
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

/** How much run history the detail view reads — one commits-API page. */
export const RUNS_LIMIT = 30

export interface RoutineRuns {
  /** Publish receipts, newest first (ADR-0033). Empty → never ran. */
  receipts: RunReceipt[]
  /** The read hit RUNS_LIMIT — older receipts exist beyond this page. */
  capped: boolean
  /** GitHub couldn't serve the history right now — render the retry line,
      never an error page (the same per-cell degrade loadArtifacts uses). */
  unreachable?: boolean
}

/**
 * A routine's run history: the commits touching its artifact on the
 * artifacts branch — every run's mandatory last step is exactly one such
 * commit (ADR-0002/0026), so this reads the receipts themselves rather than
 * keeping a parallel run log honest. Streamed by the detail route
 * (ADR-0030); failures degrade in-band, so the promise never rejects.
 */
export async function loadRoutineRuns(
  token: string,
  repo: string,
  slug: string,
): Promise<RoutineRuns> {
  try {
    const commits = await listPathCommits(
      token,
      repo,
      `w/${slug}/index.html`,
      "artifacts",
      RUNS_LIMIT,
    )
    const receipts = (commits ?? []).map((commit) => ({
      sha: commit.sha,
      htmlUrl: commit.htmlUrl,
      at: commit.date,
      author: commit.author,
    }))
    return { receipts, capped: receipts.length >= RUNS_LIMIT }
  } catch {
    return { receipts: [], capped: false, unreachable: true }
  }
}

export interface ArtifactVersion {
  /** The artifact's HTML as published at that commit, unframed — the client
      theme-injects it exactly as the board does. null → the file didn't exist
      at that commit (a receipt from before the path, or a deleted widget). */
  html: string | null
  /** GitHub couldn't serve that blob right now (5xx) — the dialog shows a
      retry line, never an error page (the same per-cell degrade the board and
      run history use). */
  unreachable?: boolean
}

/**
 * One run's published artifact — `w/<slug>/index.html` read at a specific
 * commit `sha` (ADR-0002). The run history (loadRoutineRuns) lists the
 * receipts; this fetches the render behind one of them, so a run can be
 * browsed or two runs compared side by side without leaving the app. On
 * demand only: the detail route streams the receipts, then a resource route
 * pulls each version's body when the viewer opens it.
 */
export async function loadArtifactVersion(
  token: string,
  repo: string,
  slug: string,
  sha: string,
): Promise<ArtifactVersion> {
  try {
    const file = await getFile(token, repo, `w/${slug}/index.html`, sha)
    return { html: file?.text ?? null }
  } catch {
    return { html: null, unreachable: true }
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
