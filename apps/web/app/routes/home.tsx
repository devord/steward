import { redirect } from "react-router"

import type { Route } from "./+types/home"
import { DashboardBoard } from "../components/dashboard-board.tsx"
import { Landing } from "../components/landing.tsx"
import { DEFAULT_DASHBOARD } from "../lib/repos.ts"
import {
  loadArtifacts,
  loadDashboardStructureOr503,
  loadSidebarOr503,
  repoExistsOr503,
} from "../lib/dashboard.server.ts"
import { resolveHomeRepo } from "../lib/repos.server.ts"
import { getAuth } from "../lib/session.server.ts"

export function meta({ loaderData }: Route.MetaArgs) {
  const description =
    "Reports that update themselves — a dashboard of living widgets, each one regenerated on schedule by a routine and published to a GitHub repo you own."
  return [
    { title: "Steward" },
    { name: "description", content: description },
    { property: "og:title", content: "Steward" },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "Steward" },
    // Scrapers need an absolute image URL; when the loader errored there is
    // no origin to build one from, so omit the image rather than emit a
    // relative URL scrapers would resolve against their own domain.
    ...(loaderData
      ? [
          { property: "og:image", content: `${loaderData.origin}/og.png` },
          { property: "og:image:width", content: "1200" },
          { property: "og:image:height", content: "630" },
          { name: "twitter:card", content: "summary_large_image" },
        ]
      : []),
  ]
}

export async function loader({ request }: Route.LoaderArgs) {
  const origin = new URL(request.url).origin
  const auth = await getAuth(request)
  if (!auth) return { kind: "anonymous" as const, origin }

  const dataRepo = resolveHomeRepo(auth.login, auth.dataRepo)
  if (!(await repoExistsOr503(auth.token, dataRepo))) throw redirect("/setup")

  const ref = { repo: dataRepo, shared: false, dashboard: DEFAULT_DASHBOARD }
  const [view, sidebar] = await Promise.all([
    loadDashboardStructureOr503(auth.token, ref),
    loadSidebarOr503(auth.token, auth.login, auth.dataRepo),
  ])
  // Widget bodies stream in after the chrome + grid paint — returning the
  // promise unawaited defers it (ADR-0002); the board renders skeleton cells
  // until it resolves.
  const artifacts = loadArtifacts(auth.token, ref, view.routines)
  return {
    kind: "dashboard" as const,
    origin,
    login: auth.login,
    displayName: auth.name ?? null,
    now: Date.now(),
    view,
    artifacts,
    sidebar,
  }
}

export default function Home({ loaderData }: Route.ComponentProps) {
  if (loaderData.kind === "anonymous") return <Landing />
  // Key by board identity so the board remounts cleanly per board (consistent
  // with the /d and /team routes).
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
