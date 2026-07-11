import { z } from "zod"

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

export const routineSchema = z
  .object({
    slug: slugSchema,
    name: z.string().min(1),
    /**
     * Skill name, resolved by Claude Code in the run environment
     * (ADR-0014). Absent → a prompt-only routine: the dispatcher runs
     * `instructions` directly under the contract skills (ADR-0013).
     */
    skill: z.string().min(1).optional(),
    /**
     * Cron expression (5-field). Absent → manual-only: updated via the
     * app's Update button (cloud API trigger) or an interactive CLI run
     * (ADR-0016). Structural validation lives in routines:sync.
     */
    schedule: z.string().min(1).optional(),
    host: routineHostSchema.optional(),
    /**
     * Per-routine guidance passed to the skill by the run-routine
     * dispatcher — or, with no `skill:`, the routine's whole content brief.
     * Lives here (not in the cloud routine's prompt) so edits are versioned
     * and never require touching the cloud resource. Non-empty when present:
     * a blank prompt would satisfy the skill-or-instructions refine below
     * while giving the dispatcher nothing to run.
     */
    instructions: z.string().min(1).optional(),
    /**
     * GitHub login of the account whose Claude account owns this routine's
     * cloud resource — schedule and API trigger alike (ADR-0010/0016).
     * Meaningful in a team repo, where routines:sync only enacts entries
     * whose runner matches the syncing user; personal pools leave it unset.
     */
    runner: z.string().min(1).optional(),
    /**
     * Extra source repos a cloud run needs, beyond the two routines:sync
     * always attaches: the contract repo (run-routine/widget-artifact/
     * publish-widget) and this data repo. A cloud session can only reach
     * repos attached as sources — cross-owner adds are refused at runtime —
     * so a routine whose `skill:` is a plugin skill must list the plugin
     * repo here (e.g. `Form-Factory/plugins`) (ADR-0018). Cloud-only: local
     * runs read the machine's checkouts.
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
  .refine((routine) => routine.skill != null || routine.instructions != null, {
    message: "a routine needs a skill, instructions, or both",
    path: ["instructions"],
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
})

export type TriggerFile = z.infer<typeof triggerFileSchema>
