import type { Route } from "./+types/r.$owner.$repo.routines"
import { RoutinesView } from "../components/routines-view.tsx"
import {
  loadArtifacts,
  loadRoutinesPoolOr503,
  loadSidebarOr503,
} from "../lib/dashboard.server.ts"
import { requireDataRepo, resolveHomeRepo } from "../lib/repos.server.ts"
import { requireAuth } from "../lib/session.server.ts"
import { discoverTemplates } from "../lib/templates.server.ts"

export function meta({ params }: Route.MetaArgs) {
  return [{ title: `Steward — ${params.repo}/routines` }]
}

/**
 * A data repo's routine pool (ADR-0025): the whole routines.yaml pool as one
 * table — its live/stale/manual/disabled state, its schedule and host, and
 * which boards place each routine (orphans, on no board, surface here and
 * nowhere else). The one writable surface for routines.yaml that isn't scoped
 * to a single board; placement stays with the boards.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const auth = await requireAuth(request)
  // requireDataRepo is the whole gate — a repo that isn't a topic-tagged data
  // repo the viewer can read 404s here, indistinguishable from absent.
  const repo = await requireDataRepo(
    auth.token,
    auth.login,
    `${params.owner}/${params.repo}`,
    auth.dataRepo,
  )
  const home = resolveHomeRepo(auth.login, auth.dataRepo)

  const [pool, sidebar, templates] = await Promise.all([
    loadRoutinesPoolOr503(auth.token, repo.full),
    loadSidebarOr503(auth.token, auth.login, auth.dataRepo),
    // The add/edit dialog's picker — this repo's templates plus the built-ins
    // (ADR-0021), same source the board's add-routine flow reads.
    discoverTemplates(auth.token, repo.full),
  ])

  // Freshness/state streams in after the table paints, exactly as the board
  // streams widget bodies (ADR-0002) — the artifact + trigger reads are the
  // many round trips, the table structure is the handful.
  const artifacts = loadArtifacts(
    auth.token,
    { repo: repo.full, shared: repo.isShared, dashboard: "" },
    pool.routines,
  )

  return {
    login: auth.login,
    displayName: auth.name ?? null,
    now: Date.now(),
    repo: { full: repo.full, name: repo.name, isShared: repo.isShared },
    homeRepo: home,
    sidebar,
    templates,
    pool: {
      routines: pool.routines,
      baseSha: pool.baseSha,
      baseFile: pool.baseFile,
      boardsByRoutine: pool.boardsByRoutine,
      dashboards: pool.dashboards,
    },
    artifacts,
  }
}

export default function RoutinesRoute({ loaderData }: Route.ComponentProps) {
  return (
    <RoutinesView
      key={loaderData.repo.full}
      repo={loaderData.repo}
      homeRepo={loaderData.homeRepo}
      sidebar={loaderData.sidebar}
      templates={loaderData.templates}
      login={loaderData.login}
      displayName={loaderData.displayName}
      now={loaderData.now}
      pool={loaderData.pool}
      artifacts={loaderData.artifacts}
    />
  )
}
