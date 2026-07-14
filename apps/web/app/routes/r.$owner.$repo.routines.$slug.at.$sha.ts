import { slugSchema } from "@steward/schema"
import { data } from "react-router"

import type { Route } from "./+types/r.$owner.$repo.routines.$slug.at.$sha"
import { loadArtifactVersion } from "../lib/dashboard.server.ts"
import { requireDataRepo } from "../lib/repos.server.ts"
import { requireAuth } from "../lib/session.server.ts"

/** A commit SHA as GitHub gives it — full 40-hex, but accept any ≥7 prefix so
    a short SHA from a link still resolves. Anything else is a crafted path. */
const SHA = /^[0-9a-f]{7,40}$/

/**
 * One run's published artifact, on demand (ADR-0038): the
 * body of `w/<slug>/index.html` at commit `:sha` on the artifacts branch. The
 * routine detail view streams the run receipts, then fetches a version through
 * here when the viewer opens it or picks two to compare. Read with the
 * clicker's own token and gated by requireDataRepo (ADR-0023), so it reaches
 * exactly the repos the board already does — no new surface. Returns
 * {@link ArtifactVersion}; the client theme-injects and sandboxes the HTML the
 * same way the board does.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const auth = await requireAuth(request)

  const slug = slugSchema.safeParse(params.slug)
  const sha = params.sha
  if (!slug.success || sha == null || !SHA.test(sha)) {
    throw data("Bad version reference.", { status: 400 })
  }

  const repo = await requireDataRepo(
    auth.token,
    auth.login,
    `${params.owner}/${params.repo}`,
    auth.dataRepo,
  )

  return loadArtifactVersion(auth.token, repo.full, slug.data, sha)
}
