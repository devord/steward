import { data } from "react-router"

import type { Route } from "./+types/r.$owner.$repo.routines.$slug"
import { RoutineRunsView } from "../components/routine-runs-view.tsx"
import {
  loadArtifacts,
  loadRoutineRuns,
  loadRoutinesPoolOr503,
  streamSidebar,
} from "../lib/dashboard.server.ts"
import { requireDataRepo, resolveHomeRepo } from "../lib/repos.server.ts"
import { requireAuth } from "../lib/session.server.ts"

export function meta({ params }: Route.MetaArgs) {
  return [{ title: `Steward — ${params.repo}/routines/${params.slug}` }]
}

/**
 * One routine of a repo's pool (ADR-0033): its facts, and its run history —
 * the publish receipts on the artifacts branch. The routine itself must
 * resolve on the request path (unknown slug → 404); the receipts and the
 * artifact/trigger info stream in after the page paints (ADR-0030), the
 * same split the pool view makes.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const auth = await requireAuth(request)
  // Per-viewer chrome, fired before the gate (ADR-0030).
  const sidebar = streamSidebar(auth.token, auth.login, auth.dataRepo)
  const repo = await requireDataRepo(
    auth.token,
    auth.login,
    `${params.owner}/${params.repo}`,
    auth.dataRepo,
  )
  const home = resolveHomeRepo(auth.login, auth.dataRepo)

  const pool = await loadRoutinesPoolOr503(auth.token, repo.full)
  const routine = pool.routines.routines.find((r) => r.slug === params.slug)
  // Only committed routines have a detail page — a draft-only routine lives
  // in the pool view's localStorage, invisible to this loader by design.
  if (!routine) throw data("No such routine.", { status: 404 })

  const runs = loadRoutineRuns(auth.token, repo.full, routine.slug)
  // The same per-routine artifact + trigger read the pool streams, narrowed
  // to this one slug — state chip, freshness, and the claude.ai link's id.
  const artifacts = loadArtifacts(
    auth.token,
    { repo: repo.full, shared: repo.isShared, dashboard: "" },
    { routines: [routine] },
  )

  return {
    login: auth.login,
    displayName: auth.name ?? null,
    now: Date.now(),
    repo: { full: repo.full, name: repo.name, isShared: repo.isShared },
    homeRepo: home,
    sidebar,
    routine,
    boards: pool.boardsByRoutine[routine.slug] ?? [],
    runs,
    artifacts,
  }
}

export default function RoutineRunsRoute({ loaderData }: Route.ComponentProps) {
  return (
    <RoutineRunsView
      key={`${loaderData.repo.full}/${loaderData.routine.slug}`}
      repo={loaderData.repo}
      homeRepo={loaderData.homeRepo}
      sidebar={loaderData.sidebar}
      login={loaderData.login}
      displayName={loaderData.displayName}
      now={loaderData.now}
      routine={loaderData.routine}
      boards={loaderData.boards}
      artifacts={loaderData.artifacts}
      runs={loaderData.runs}
    />
  )
}
