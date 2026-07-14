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

/** A template's picker preview render, beside its markdown (ADR-0037) — a
    repo template's optional sibling; the built-ins keep theirs as the
    `docs/samples/<id>.html` archetypes globbed below. */
const TEMPLATE_SAMPLE = /^templates\/routines\/([a-z0-9-]+)\.sample\.html$/

// Built-in templates, inlined at build time from this repo's
// templates/routines/ — no API call, no env var, no access check, and the
// picker's built-ins always match the deployed app version.
const builtinFiles = import.meta.glob("../../../../templates/routines/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
})

// The built-ins' picker previews: their canonical design archetypes in
// docs/samples/ double as the sample renders (ADR-0037), keyed to the
// template by basename and inlined the same way — one file, one source of
// truth, no separate copy to drift.
const builtinSampleFiles = import.meta.glob("../../../../docs/samples/*.html", {
  query: "?raw",
  import: "default",
  eager: true,
})

const builtinSamples = new Map<string, string>(
  Object.entries(builtinSampleFiles).flatMap(([path, text]) => {
    const id = /([a-z0-9-]+)\.html$/.exec(path)?.[1]
    return id && typeof text === "string" ? [[id, text]] : []
  }),
)

const builtins: DiscoveredTemplate[] = Object.entries(builtinFiles).flatMap(
  ([path, text]) => {
    const id = /([a-z0-9-]+)\.md$/.exec(path)?.[1]
    const template =
      id && typeof text === "string" ? parseRoutineTemplate(id, text) : null
    if (!template) return []
    const sample = builtinSamples.get(template.id)
    return [
      { ...template, source: "builtin" as const, ...(sample && { sample }) },
    ]
  },
)

async function discoverFrom(
  token: string,
  repo: string,
): Promise<DiscoveredTemplate[]> {
  const paths = await listTreePaths(token, repo)
  if (!paths) return []
  // Sample siblings are read from the same tree listing, so a template with
  // no preview costs no extra fetch — only those that ship one are read.
  const samplePaths = new Map<string, string>(
    paths.flatMap((path) => {
      const id = TEMPLATE_SAMPLE.exec(path)?.[1]
      return id ? [[id, path]] : []
    }),
  )
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
        if (!template) return null
        // The preview is best-effort decoration: a failed or missing sample
        // read leaves the card previewless, never drops the template.
        const samplePath = samplePaths.get(id)
        const sample = samplePath
          ? await getFile(token, repo, samplePath)
              .then((f) => f?.text)
              .catch(() => undefined)
          : undefined
        return {
          ...template,
          source: "repo" as const,
          ...(sample && { sample }),
        }
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
