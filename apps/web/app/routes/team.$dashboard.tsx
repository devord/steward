import { redirect } from "react-router"

import { slugSchema } from "@bulletin/schema"

import type { Route } from "./+types/team.$dashboard"
import { boardHref } from "../lib/repos.ts"
import { listDataRepos, resolveHomeRepo } from "../lib/repos.server.ts"
import { requireAuth } from "../lib/session.server.ts"

/**
 * Legacy team-board URL, pre-ADR-0023. Forwards to the canonical route when
 * exactly one shared repo holds a board of this slug; home otherwise.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const auth = await requireAuth(request)
  if (!slugSchema.safeParse(params.dashboard).success) {
    throw redirect("/", 301)
  }
  const { repos } = await listDataRepos(
    auth.token,
    auth.login,
    auth.dataRepo,
  ).catch(() => ({ repos: [] }))
  const shared = repos.filter((repo) => repo.isShared)
  if (shared.length !== 1) throw redirect("/", 301)
  const home = resolveHomeRepo(auth.login, auth.dataRepo)
  throw redirect(boardHref(shared[0].full, params.dashboard, home), 301)
}
