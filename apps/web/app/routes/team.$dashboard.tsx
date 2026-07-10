import { data, redirect } from "react-router"

import { slugSchema } from "@bulletin/schema"

import type { Route } from "./+types/team.$dashboard"
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
  return [{ title: `Bulletin — team/${params.dashboard}` }]
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const auth = await requireAuth(request)
  const teamRepo = resolveTeamRepo()
  if (!teamRepo || !slugSchema.safeParse(params.dashboard).success) {
    throw data("not found", { status: 404 })
  }
  // Repo missing or no access → `/team` explains and offers the fix; a
  // team URL must never bounce a viewer into the personal /setup wizard.
  if (!(await dataRepoExists(auth.token, teamRepo))) throw redirect("/team")

  // The switcher's personal group: best-effort, never blocks a team board
  // (a brand-new member may not even have a personal repo yet).
  const personalRepo = resolveDataRepo(auth.login, auth.dataRepo)
  const ref = {
    scope: "team" as const,
    repo: teamRepo,
    dashboard: params.dashboard,
  }
  const [view, personalDashboards] = await Promise.all([
    loadDashboardStructureOr503(auth.token, ref),
    listDashboards(auth.token, personalRepo).catch(() => null),
  ])
  // Unknown board → the /team index picks a real one (or the empty state).
  if (view.baseShas.dashboard === null) throw redirect("/team")

  // Streamed after the redirect check so an unknown board never fires it.
  const artifacts = loadArtifacts(auth.token, ref, view.routines)
  return {
    login: auth.login,
    now: Date.now(),
    view,
    artifacts,
    personalDashboards: personalDashboards ?? [DEFAULT_DASHBOARD],
  }
}

export default function TeamDashboard({ loaderData }: Route.ComponentProps) {
  // Key by board identity so switching slugs under this same route remounts
  // the board — a clean slate instead of the previous board's draft/resolved.
  return (
    <DashboardBoard
      key={`${loaderData.view.dataRepo}:${loaderData.view.dashboardSlug}`}
      view={loaderData.view}
      artifacts={loaderData.artifacts}
      login={loaderData.login}
      now={loaderData.now}
      personalDashboards={loaderData.personalDashboards}
      teamDashboards={loaderData.view.dashboards}
    />
  )
}
