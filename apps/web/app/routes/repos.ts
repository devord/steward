import { GitHubError, listUserRepos } from "../lib/github.server.ts"
import { getAuth } from "../lib/session.server.ts"

export interface RepoSearchResult {
  repos: string[]
}

/**
 * Typeahead behind the wizard's repo pickers (ADR-0020): substring-match
 * `?q=` against the viewer's own repos, recently-pushed first. Suggestions
 * only — the pickers accept any typed `owner/repo`, so an anonymous
 * session, a rate-limited call, or a repo outside the viewer's first ~200
 * degrade to typing, never to a blocked field.
 */
export async function loader({ request }: { request: Request }) {
  const auth = await getAuth(request)
  if (!auth) return { repos: [] } satisfies RepoSearchResult
  const query =
    new URL(request.url).searchParams.get("q")?.trim().toLowerCase() ?? ""
  let names: string[]
  try {
    names = await listUserRepos(auth.token)
  } catch (error) {
    if (error instanceof GitHubError) {
      return { repos: [] } satisfies RepoSearchResult
    }
    throw error
  }
  const matches = query
    ? names.filter((name) => name.toLowerCase().includes(query))
    : names
  return { repos: matches.slice(0, 8) } satisfies RepoSearchResult
}
