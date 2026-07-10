import { data, redirect } from "react-router"

import { slugSchema } from "@bulletin/schema"

import type { Route } from "./+types/d.$dashboard"
import { DashboardBoard } from "../components/dashboard-board.tsx"
import { DEFAULT_DASHBOARD } from "../lib/board.ts"
import {
  dataRepoExists,
  listDashboards,
  loadArtifacts,
  loadDashboardStructureOr503,
  resolveDataRepo,
  resolveTeamRepo,
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
  if (!(await dataRepoExists(auth.token, dataRepo))) throw redirect("/setup")

  const ref = {
    scope: "personal" as const,
    repo: dataRepo,
    dashboard: params.dashboard,
  }
  const teamRepo = resolveTeamRepo()
  const [view, teamDashboards] = await Promise.all([
    loadDashboardStructureOr503(auth.token, ref),
    teamRepo
      ? listDashboards(auth.token, teamRepo).catch(() => null)
      : Promise.resolve(null),
  ])
  // Unlike `/` (which tolerates a repo predating the dashboards dir), a
  // named board must actually exist — a missing file here is a typo.
  if (view.baseShas.dashboard === null) {
    throw data("not found", { status: 404 })
  }
  // Fire artifacts only after the existence checks pass, so a 404 never
  // leaves a dangling request. Streamed (ADR-0002), not awaited.
  const artifacts = loadArtifacts(auth.token, ref, view.routines)
  return { login: auth.login, now: Date.now(), view, artifacts, teamDashboards }
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
      now={loaderData.now}
      personalDashboards={loaderData.view.dashboards}
      teamDashboards={loaderData.teamDashboards}
    />
  )
}
