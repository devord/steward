/**
 * Repo addressing for the N-data-repo model (ADR-0023): every board lives in
 * some data repo the viewer can read; which repos those are is discovered by
 * GitHub topic, and sharing is repo permissions — nothing else. Shared by
 * server loaders and client navigation.
 */

import { DEFAULT_DASHBOARD } from "./board.ts"

export interface RepoRef {
  owner: string
  name: string
  /** `owner/name` — the canonical string form used in URLs and payloads. */
  full: string
}

/** A discovered data repo, decorated for the switcher and access UI. */
export interface DataRepo extends RepoRef {
  /** The viewer's home repo — `<login>/<prefix><login>` (or the session
      override). Anchors `/`, the setup wizard, and the top of the rail. */
  isHome: boolean
  /** null → metadata fetch degraded; UI omits the badge. */
  private: boolean | null
  /** Anything that isn't the viewer's home repo: org repos, other users'
      repos shared with the viewer. Drives the runner rule (ADR-0023). */
  isShared: boolean
  /** Whether the viewer can administer the repo — gates the "manage access"
      link target. null → unknown (metadata degraded). */
  viewerIsAdmin: boolean | null
}

/** Which board a request targets. */
export interface RepoBoardRef {
  repo: RepoRef
  /** Dashboard slug; the layout file is data/dashboards/<slug>.yaml. */
  dashboard: string
}

const REPO_RE = /^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/

/** Parse `owner/name`; null when it isn't a plausible GitHub repo. */
export function parseRepo(full: string): RepoRef | null {
  const match = REPO_RE.exec(full)
  if (!match) return null
  const [, owner, name] = match
  return { owner, name, full: `${owner}/${name}` }
}

/**
 * Route of a board. `/` keeps owning the home repo's default dashboard;
 * every other board — any repo, any slug — lives under the one canonical
 * `/r/:owner/:repo/:dashboard` shape.
 */
export function repoBoardHref(ref: RepoBoardRef, homeRepo: string): string {
  if (ref.repo.full === homeRepo && ref.dashboard === DEFAULT_DASHBOARD) {
    return "/"
  }
  return `/r/${ref.repo.owner}/${ref.repo.name}/${ref.dashboard}`
}
