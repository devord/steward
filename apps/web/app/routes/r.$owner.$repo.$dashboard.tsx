import { data, redirect } from "react-router"

import { slugSchema } from "@bulletin/schema"

import type { Route } from "./+types/r.$owner.$repo.$dashboard"
import { DashboardBoard } from "../components/dashboard-board.tsx"
import { DEFAULT_DASHBOARD } from "../lib/repos.ts"
import {
  loadArtifacts,
  loadDashboardStructureOr503,
  loadSidebarOr503,
} from "../lib/dashboard.server.ts"
import { requireDataRepo, resolveHomeRepo } from "../lib/repos.server.ts"
import { requireAuth } from "../lib/session.server.ts"

export function meta({ params }: Route.MetaArgs) {
  return [{ title: `Bulletin — ${params.repo}/${params.dashboard}` }]
}

/**
 * The canonical board route (ADR-0023): any dashboard in any discovered data
 * repo. Only the home repo's default board lives elsewhere — at `/`, which
 * this loader bounces to so every board keeps one canonical URL.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const auth = await requireAuth(request)
  if (!slugSchema.safeParse(params.dashboard).success) {
    throw data("not found", { status: 404 })
  }
  // requireDataRepo is the whole gate: a repo that isn't a topic-tagged data
  // repo the viewer can read 404s here, indistinguishable from absent.
  const repo = await requireDataRepo(
    auth.token,
    auth.login,
    `${params.owner}/${params.repo}`,
    auth.dataRepo,
  )
  const home = resolveHomeRepo(auth.login, auth.dataRepo)
  if (repo.full === home && params.dashboard === DEFAULT_DASHBOARD) {
    throw redirect("/")
  }

  const ref = {
    repo: repo.full,
    shared: repo.isShared,
    dashboard: params.dashboard,
  }
  const [view, sidebar] = await Promise.all([
    loadDashboardStructureOr503(auth.token, ref),
    loadSidebarOr503(auth.token, auth.login, auth.dataRepo),
  ])
  // A named board must actually exist — a missing file here is a typo.
  if (view.baseShas.dashboard === null) {
    throw data("not found", { status: 404 })
  }
  // Fire artifacts only after the existence checks pass, so a 404 never
  // leaves a dangling request. Streamed (ADR-0002), not awaited.
  const artifacts = loadArtifacts(auth.token, ref, view.routines)
  return {
    login: auth.login,
    displayName: auth.name ?? null,
    now: Date.now(),
    view,
    artifacts,
    sidebar,
  }
}

export default function RepoDashboard({ loaderData }: Route.ComponentProps) {
  // Key by board identity so switching boards under this same route remounts
  // the board — a clean slate for draft/last-commit/resolved state instead of
  // briefly painting (or persisting) the previous board's.
  return (
    <DashboardBoard
      key={`${loaderData.view.dataRepo}:${loaderData.view.dashboardSlug}`}
      view={loaderData.view}
      artifacts={loaderData.artifacts}
      login={loaderData.login}
      displayName={loaderData.displayName}
      now={loaderData.now}
      sidebar={loaderData.sidebar}
    />
  )
}
