import type { Route } from "./+types/r.$owner.$repo.spend"
import { SpendView } from "../components/spend-view.tsx"
import {
  loadRoutinesPoolOr503,
  streamRepoSpend,
  streamSidebar,
} from "../lib/dashboard.server.ts"
import { requireDataRepo } from "../lib/repos.server.ts"
import { requireAuth } from "../lib/session.server.ts"
import { streamTemplates } from "../lib/templates.server.ts"

export function meta({ params }: Route.MetaArgs) {
  return [{ title: `Steward — ${params.repo}/spend` }]
}

/**
 * What a data repo's routines cost (ADR-0061): the publish ledger the pool's
 * average already reads, rolled up by routine, by runner and by band over the
 * repo's spend window.
 *
 * The routines file is awaited — it is one read, and it carries the names,
 * runners and bands every roll-up groups by. The ledger itself streams
 * (ADR-0030): it is up to ten commits pages, and the page frame has nothing
 * to wait for.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const auth = await requireAuth(request)
  const sidebar = streamSidebar(auth.token, auth.login, auth.dataRepo)
  const repo = await requireDataRepo(
    auth.token,
    auth.login,
    `${params.owner}/${params.repo}`,
    auth.dataRepo,
  )
  const pool = await loadRoutinesPoolOr503(auth.token, repo.full)

  return {
    login: auth.login,
    displayName: auth.name ?? null,
    now: Date.now(),
    repo: { full: repo.full, name: repo.name },
    routines: pool.routines.routines,
    sidebar,
    // Band defaults for routines that inherit one from their template
    // (ADR-0044) — only the band roll-up reads them, so they stream.
    templates: streamTemplates(auth.token, repo.full),
    spend: streamRepoSpend(auth.token, repo.full),
  }
}

export default function SpendRoute({ loaderData }: Route.ComponentProps) {
  return (
    <SpendView
      key={loaderData.repo.full}
      repo={loaderData.repo}
      sidebar={loaderData.sidebar}
      login={loaderData.login}
      displayName={loaderData.displayName}
      now={loaderData.now}
      routines={loaderData.routines}
      templates={loaderData.templates}
      spend={loaderData.spend}
    />
  )
}
