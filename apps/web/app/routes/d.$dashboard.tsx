import { data, redirect } from "react-router"

import { slugSchema } from "@bulletin/schema"

import type { Route } from "./+types/d.$dashboard"
import { DashboardBoard } from "../components/dashboard-board.tsx"
import { DEFAULT_DASHBOARD } from "../lib/board.ts"
import {
  listTeamDashboards,
  loadArtifacts,
  loadDashboardStructureOr503,
  repoExistsOr503,
  resolveDataRepo,
} from "../lib/dashboard.server.ts"
import { requireAuth } from "../lib/session.server.ts"

export function meta({ params }: Route.MetaArgs) {
  return [{ title: `Bulletin — ${params.dashboard}` }]
}

/** A personal dashboard other than the default (which `/` owns). */
export async function loader({ request, params }: Route.LoaderArgs) {
  const auth = await requireAuth(request)
  if (!slugSchema.safeParse(params.dashboard).success) {
    throw data("not found", { status: 404 })
  }
  // The default board lives at `/` — one canonical URL per board.
  if (params.dashboard === DEFAULT_DASHBOARD) throw redirect("/")

  const dataRepo = resolveDataRepo(auth.login, auth.dataRepo)
  if (!(await repoExistsOr503(auth.token, dataRepo))) throw redirect("/setup")

  const ref = {
    scope: "personal" as const,
    repo: dataRepo,
    dashboard: params.dashboard,
  }
  const [view, teamDashboards] = await Promise.all([
    loadDashboardStructureOr503(auth.token, ref),
    listTeamDashboards(auth.token),
  ])
  // Unlike `/` (which tolerates a repo predating the dashboards dir), a
  // named board must actually exist — a missing file here is a typo.
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
    teamDashboards,
  }
}

export default function PersonalDashboard({
  loaderData,
}: Route.ComponentProps) {
  // Key by board identity so switching slugs under this same route remounts
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
      personalDashboards={loaderData.view.dashboards}
      teamDashboards={loaderData.teamDashboards}
    />
  )
}
