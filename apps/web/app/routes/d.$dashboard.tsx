import { data, redirect } from "react-router"

import { slugSchema } from "@bulletin/schema"

import type { Route } from "./+types/d.$dashboard"
import { DashboardBoard } from "../components/dashboard-board.tsx"
import { DEFAULT_DASHBOARD } from "../lib/board.ts"
import {
  dataRepoExists,
  listDashboards,
  loadDashboardOr503,
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

  const teamRepo = resolveTeamRepo()
  const [view, teamDashboards] = await Promise.all([
    loadDashboardOr503(auth.token, {
      scope: "personal",
      repo: dataRepo,
      dashboard: params.dashboard,
    }),
    teamRepo
      ? listDashboards(auth.token, teamRepo).catch(() => null)
      : Promise.resolve(null),
  ])
  // Unlike `/` (which tolerates a repo predating the dashboards dir), a
  // named board must actually exist — a missing file here is a typo.
  if (view.baseShas.dashboard === null) {
    throw data("not found", { status: 404 })
  }
  return { login: auth.login, now: Date.now(), view, teamDashboards }
}

export default function PersonalDashboard({
  loaderData,
}: Route.ComponentProps) {
  return (
    <DashboardBoard
      view={loaderData.view}
      login={loaderData.login}
      now={loaderData.now}
      personalDashboards={loaderData.view.dashboards}
      teamDashboards={loaderData.teamDashboards}
    />
  )
}
