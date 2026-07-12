import { redirect } from "react-router"

import type { Route } from "./+types/team"
import { DEFAULT_DASHBOARD, boardHref } from "../lib/repos.ts"
import { listDataRepos, resolveHomeRepo } from "../lib/repos.server.ts"
import { requireAuth } from "../lib/session.server.ts"

/**
 * Legacy team-scope URL, pre-ADR-0023. "The team repo" is now just a shared
 * data repo discovered by topic: when exactly one shared repo is visible the
 * old link still lands somewhere sensible; otherwise home disambiguates.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request)
  const { repos } = await listDataRepos(
    auth.token,
    auth.login,
    auth.dataRepo,
  ).catch(() => ({ repos: [] }))
  const shared = repos.filter((repo) => repo.isShared)
  if (shared.length !== 1) throw redirect("/", 301)
  const home = resolveHomeRepo(auth.login, auth.dataRepo)
  throw redirect(boardHref(shared[0].full, DEFAULT_DASHBOARD, home), 301)
}
