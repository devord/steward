import { parseRoutineTemplate } from "@steward/schema"

import type { DiscoveredTemplate } from "./templates.ts"
import { getFile, listTreePaths } from "./github.server.ts"
import { swr, tokenKey } from "./swr.server.ts"

/**
 * Routine-template discovery (ADR-0015/0021): built-ins ship in the app
 * bundle (they live in this very repo), and the board's data repo is read
 * live — one tree listing plus a frontmatter fetch per candidate, all
 * ETag-cached by the GitHub client, so repeat wizard opens cost only 304s.
 */

/** `templates/routines/<id>.md` — the one placement rule (ADR-0021). */
const TEMPLATE_MD = /^templates\/routines\/([a-z0-9-]+)\.md$/

// Built-in templates, inlined at build time from this repo's
// templates/routines/ — no API call, no env var, no access check, and the
// picker's built-ins always match the deployed app version.
const builtinFiles = import.meta.glob("../../../../templates/routines/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
})

const builtins: DiscoveredTemplate[] = Object.entries(builtinFiles).flatMap(
  ([path, text]) => {
    const id = /([a-z0-9-]+)\.md$/.exec(path)?.[1]
    const template =
      id && typeof text === "string" ? parseRoutineTemplate(id, text) : null
    return template ? [{ ...template, source: "builtin" as const }] : []
  },
)

async function discoverFrom(
  token: string,
  repo: string,
): Promise<DiscoveredTemplate[]> {
  const paths = await listTreePaths(token, repo)
  if (!paths) return []
  const candidates = paths.flatMap((path) => {
    const id = TEMPLATE_MD.exec(path)?.[1]
    return id ? [{ id, path }] : []
  })
  const templates = await Promise.all(
    candidates.map(async ({ id, path }) => {
      // Per-candidate isolation: one flaky file read (a transient 5xx
      // surfacing as a GitHubError) must not reject the whole batch and
      // hide the repo's other templates.
      try {
        const file = await getFile(token, repo, path)
        if (!file) return null
        const template = parseRoutineTemplate(id, file.text)
        return template ? { ...template, source: "repo" as const } : null
      } catch {
        return null
      }
    }),
  )
  return templates.filter((template) => template != null)
}

/**
 * The picker's templates: the board's own data repo first — its templates
 * are scoped to that repo's boards and shadow same-named built-ins — then
 * the bundled built-ins, available everywhere (ADR-0021/0023). A data repo
 * that can't be read degrades to built-ins only: discovery inherits the
 * viewer's permissions.
 */
export async function discoverTemplates(
  token: string,
  dataRepo: string,
): Promise<DiscoveredTemplate[]> {
  const own = await discoverFrom(token, dataRepo).catch(() => [])
  const builtinIds = new Set(builtins.map((template) => template.id))
  const seen = new Set(own.map((template) => template.id))
  return [
    // A repo template that shadows a built-in is flagged, not duplicated —
    // the shadowed built-in stays out of the list (it can't be picked).
    ...own.map((template) =>
      builtinIds.has(template.id) ? { ...template, shadows: true } : template,
    ),
    ...builtins.filter((template) => !seen.has(template.id)),
  ]
}

/** How long a served picker may lag a template commit pushed to the repo. */
const TEMPLATES_TTL_MS = 60_000

/**
 * discoverTemplates for route loaders (ADR-0030): SWR-cached — templates
 * change by commits outside the app, so there is no in-app mutation to
 * invalidate on and the TTL is the whole liveness story — and streamed, so
 * the tree listing + per-candidate reads never sit on the paint path. Never
 * rejects (discoverTemplates already degrades to built-ins only).
 */
export function streamTemplates(
  token: string,
  dataRepo: string,
): Promise<DiscoveredTemplate[]> {
  return swr(`templates:${tokenKey(token)}:${dataRepo}`, TEMPLATES_TTL_MS, () =>
    discoverTemplates(token, dataRepo),
  )
}
