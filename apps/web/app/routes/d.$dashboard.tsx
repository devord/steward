import { data, redirect } from "react-router"

import { slugSchema } from "@bulletin/schema"

import type { Route } from "./+types/d.$dashboard"
import { boardHref } from "../lib/repos.ts"
import { resolveHomeRepo } from "../lib/repos.server.ts"
import { requireAuth } from "../lib/session.server.ts"

/**
 * Legacy personal-board URL, pre-ADR-0023. Boards now live at the canonical
 * `/r/:owner/:repo/:dashboard` (or `/` for the home default); this stub
 * forwards saved links permanently.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const auth = await requireAuth(request)
  if (!slugSchema.safeParse(params.dashboard).success) {
    throw data("not found", { status: 404 })
  }
  const home = resolveHomeRepo(auth.login, auth.dataRepo)
  throw redirect(boardHref(home, params.dashboard, home), 301)
}
