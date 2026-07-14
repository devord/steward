import { parse, stringify } from "yaml"

import { type DashboardFile, dashboardFileSchema } from "./dashboard.ts"
import { type RepoFile, repoFileSchema } from "./repo.ts"
import { type RoutinesFile, routinesFileSchema } from "./routine.ts"

/** Parse + validate data/routines.yaml. Throws ZodError/YAMLParseError. */
export function parseRoutinesFile(text: string): RoutinesFile {
  return routinesFileSchema.parse(parse(text))
}

/**
 * Rename a legacy YAML key to its canonical successor when the object carries
 * the old name but not the new one (ADR-0039: `group`→`section`,
 * `groups`→`sections`). Left untouched otherwise, so a file already using the
 * new key — or carrying both — keeps the canonical value. Serialization only
 * ever emits the new key, so any edited file rewrites forward.
 */
function renameLegacyKey(value: unknown, from: string, to: string): unknown {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return value
  }
  const record: Record<string, unknown> = { ...value }
  if (from in record && !(to in record)) {
    record[to] = record[from]
    delete record[from]
  }
  return record
}

/** Parse + validate data/dashboards/<slug>.yaml. Throws ZodError/YAMLParseError. */
export function parseDashboardFile(text: string): DashboardFile {
  return dashboardFileSchema.parse(
    renameLegacyKey(parse(text), "group", "section"),
  )
}

/** Parse + validate data/repo.yaml. An empty file is a valid empty config. */
export function parseRepoFile(text: string): RepoFile {
  return repoFileSchema.parse(
    renameLegacyKey(parse(text) ?? {}, "groups", "sections"),
  )
}

/**
 * Serialize back to YAML. Validates first so a hand-built object can't
 * round-trip an invalid file into the data repo. Output is deterministic —
 * the sync diff (ADR-0003) depends on serialization being stable.
 */
/** No line wrapping: folded long strings would make output width-dependent. */
const STRINGIFY_OPTIONS = { lineWidth: 0 }

export function serializeRoutinesFile(file: RoutinesFile): string {
  return stringify(routinesFileSchema.parse(file), STRINGIFY_OPTIONS)
}

export function serializeDashboardFile(file: DashboardFile): string {
  return stringify(dashboardFileSchema.parse(file), STRINGIFY_OPTIONS)
}

export function serializeRepoFile(file: RepoFile): string {
  return stringify(repoFileSchema.parse(file), STRINGIFY_OPTIONS)
}
