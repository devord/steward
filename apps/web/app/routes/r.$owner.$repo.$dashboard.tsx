import { data, redirect } from "react-router"

import { slugSchema } from "@steward/schema"

import type { Route } from "./+types/r.$owner.$repo.$dashboard"
import { DashboardBoard } from "../components/dashboard-board.tsx"
import { DEFAULT_DASHBOARD } from "../lib/repos.ts"
import {
  loadArtifacts,
  loadDashboardStructureOr503,
  streamSidebar,
} from "../lib/dashboard.server.ts"
import { requireDataRepo, resolveHomeRepo } from "../lib/repos.server.ts"
import { requireAuth } from "../lib/session.server.ts"
import { streamTemplates } from "../lib/templates.server.ts"

export function meta({ params }: Route.MetaArgs) {
  return [{ title: `Steward — ${params.repo}/${params.dashboard}` }]
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
  // The rail streams (ADR-0030), fired before the gate: it's per-viewer, not
  // per-board, so even a 404 below leaves nothing wasted — the read lands in
  // the SWR cache the next page serves from.
  const sidebar = streamSidebar(auth.token, auth.login, auth.dataRepo)
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
  const view = await loadDashboardStructureOr503(auth.token, ref)
  // A named board must actually exist — a missing file here is a typo.
  if (view.baseShas.dashboard === null) {
    throw data("not found", { status: 404 })
  }
  // Fire artifacts + templates only after the existence checks pass, so a 404
  // never leaves a dangling per-board request. Streamed (ADR-0002/0030),
  // not awaited.
  const artifacts = loadArtifacts(auth.token, ref, view.routines)
  const templates = streamTemplates(auth.token, repo.full)
  return {
    login: auth.login,
    displayName: auth.name ?? null,
    now: Date.now(),
    view,
    artifacts,
    templates,
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
      templates={loaderData.templates}
      login={loaderData.login}
      displayName={loaderData.displayName}
      now={loaderData.now}
      sidebar={loaderData.sidebar}
    />
  )
}
