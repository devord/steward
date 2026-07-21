import { z } from "zod"

import { routineCategorySchema } from "./category.ts"

/** Kebab-case identifier; doubles as the artifact path `w/<slug>/index.html`. */
export const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be kebab-case")

/** `owner/repo` GitHub reference — a cloud routine source repo (ADR-0018). */
export const repoRefSchema = z
  .string()
  .regex(/^[^/\s]+\/[^/\s]+$/, "must be owner/repo")

/**
 * Where a routine's runs execute (ADR-0012). Left unset in YAML it means
 * `cloud` — the schema keeps it optional (rather than defaulting) so
 * serialization doesn't stamp `host: cloud` onto every entry.
 */
export const routineHostSchema = z.enum(["cloud", "local"])

/** `min(1)` alone admits whitespace; absent is the honest blank. */
const nonBlank = z
  .string()
  .min(1)
  .refine((text) => text.trim().length > 0, "must not be blank")

export const routineSchema = z.object({
  slug: slugSchema,
  name: z.string().min(1),
  /**
   * Routine template id — `templates/routines/<id>.md` in the data repo
   * (private/team) or the steward repo (built-in), resolved by the
   * run-routine dispatcher, hard-failing on a bad reference (ADR-0021).
   * Required: a freeform routine names the `custom` built-in, whose
   * whole procedure is "follow `instructions`" (ADR-0022).
   */
  template: z.string().min(1),
  /**
   * Band this routine's widget sits in, on every board that hosts it
   * (ADR-0044). A category describes what the widget *is*, so it lives
   * with the routine rather than on each placement — one routine, one
   * identity, however many boards render it (ADR-0042).
   *
   * Tri-state: a name overrides the template, `null` opts out of banding
   * deliberately, absent inherits the template's `widget.category`.
   *
   * Materialized on write — the wizard and the edit dialog persist the
   * resolved value — so a board can band from `routines.yaml` alone, which
   * the loader awaits, instead of waiting on the streamed template read
   * (ADR-0030). Inheritance is the fallback that makes routines predating
   * this field band anyway, with no migration.
   */
  category: routineCategorySchema.optional(),
  /**
   * Cron expression (5-field). Absent → manual-only: updated via the
   * app's Update button (cloud API trigger) or an interactive CLI run
   * (ADR-0016). Structural validation lives in routines:sync.
   */
  schedule: z.string().min(1).optional(),
  host: routineHostSchema.optional(),
  /**
   * Per-routine guidance passed to the template by the run-routine
   * dispatcher — for the `custom` template, the whole content brief
   * (ADR-0022). Lives here (not in the cloud routine's prompt) so edits
   * are versioned and never require touching the cloud resource.
   * Non-empty when present: absent is the honest "no guidance".
   */
  instructions: nonBlank.optional(),
  /**
   * Answers to the template's declared `widget.params` (ADR-0020), keyed
   * by param key: a string for `string`/`select` params, a list for
   * `repos` params. Passed to the template by the run-routine dispatcher
   * alongside `instructions`. Untyped here on purpose — the param
   * contract lives in the template's frontmatter, which this file can't
   * see.
   */
  params: z
    .record(z.string().min(1), z.union([nonBlank, z.array(nonBlank).min(1)]))
    .optional(),
  /**
   * GitHub login of the account whose Claude account owns this routine's
   * cloud resource — schedule and API trigger alike (ADR-0010/0016).
   * Meaningful in a team repo, where routines:sync only enacts entries
   * whose runner matches the syncing user; personal pools leave it unset.
   */
  runner: z.string().min(1).optional(),
  /**
   * Extra source repos a cloud run needs, beyond the two routines:sync
   * always attaches: the contract repo (contract skills + built-in
   * templates, ADR-0021) and this data repo. A cloud session can only
   * reach repos attached as sources — cross-owner adds are refused at
   * runtime — so anything else the run reads (e.g. repos a template
   * watches) must be listed here; the wizard mirrors `repos`-type param
   * answers in automatically (ADR-0018/0020). Cloud-only: local runs
   * read the machine's checkouts.
   */
  repos: z.array(repoRefSchema).optional(),
  /**
   * MCP connector allowlist for a cloud run, by the connector's account
   * name (e.g. `GitHub`, `Google_Calendar`). Absent or empty → no
   * connectors: the run gets none rather than inheriting the account's
   * full set (ADR-0018). Cloud-only: local runs inherit the machine's MCP
   * servers.
   */
  connectors: z.array(z.string().min(1)).optional(),
  enabled: z.boolean().default(true),
})

/** Shape of data/routines.yaml in a user's data repo. */
export const routinesFileSchema = z.object({
  routines: z.array(routineSchema),
})

export type RoutineHost = z.infer<typeof routineHostSchema>
export type Routine = z.infer<typeof routineSchema>
export type RoutinesFile = z.infer<typeof routinesFileSchema>

/** Effective host — unset means cloud (ADR-0012). */
export function routineHost(routine: Routine): RoutineHost {
  return routine.host ?? "cloud"
}

/** Manual-only routine: no cron to fire or to be stale against (ADR-0016). */
export function isManual(routine: Routine): boolean {
  return routine.schedule == null
}

/**
 * The full source-repo set a cloud run of `routine` must be created with
 * (ADR-0018): the always-attached `base` (the contract repo + the data
 * repo, which routines:sync knows) unioned with the routine's declared
 * `repos` extras, order-preserving and de-duplicated. The base comes first
 * so it can never be dropped by a YAML edit.
 */
export function cloudSources(routine: Routine, base: string[]): string[] {
  return [...new Set([...base, ...(routine.repos ?? [])])]
}

/**
 * Path of a cloud routine's API-trigger token file in the data repo
 * (ADR-0016). Trigger-only scoped, so readable by exactly the set entitled
 * to trigger: everyone who can read the repo.
 */
export function triggerPath(slug: string): string {
  return `data/triggers/${slugSchema.parse(slug)}.json`
}

/** Shape of data/triggers/<slug>.json (ADR-0016). */
export const triggerFileSchema = z.object({
  /** Cloud routine id the fire endpoint addresses. */
  routine: z.string().min(1),
  /** Trigger-only scoped bearer token, minted in the Claude web UI. */
  token: z.string().min(1),
  /**
   * Claude account email that owns the cloud routine — the account the
   * trigger was minted under (ADR-0029). `runner:` names a GitHub login,
   * which can't tell one person's Claude accounts apart; this can.
   * Optional: triggers committed before ADR-0029 don't carry it.
   */
  account: nonBlank.optional(),
})

export type TriggerFile = z.infer<typeof triggerFileSchema>
