import { z } from "zod"

/** Kebab-case identifier; doubles as the artifact path `w/<slug>/index.html`. */
export const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be kebab-case")

export const routineSchema = z.object({
  slug: slugSchema,
  name: z.string().min(1),
  /** Skill id from the shared repo's catalog/skills.json. */
  skill: z.string().min(1),
  /** Cron expression (5-field). Structural validation lands with routines:sync. */
  schedule: z.string().min(1),
  /**
   * Optional per-routine guidance passed to the skill by the run-routine
   * dispatcher. Lives here (not in the cloud routine's prompt) so edits are
   * versioned and never require touching the cloud resource.
   */
  instructions: z.string().optional(),
  /**
   * GitHub login of the account whose Claude schedule owns this routine.
   * Meaningful in a team repo, where routines:sync only enacts entries whose
   * runner matches the syncing user; personal pools leave it unset.
   */
  runner: z.string().min(1).optional(),
  enabled: z.boolean().default(true),
})

/** Shape of data/routines.yaml in a user's data repo. */
export const routinesFileSchema = z.object({
  routines: z.array(routineSchema),
  /**
   * Repo-level opt-in for the "Run now" button and its `workflow_dispatch`
   * trigger (ADR-0012). Off by default: manual runs spend a stored Claude
   * credential, so the capability is enabled deliberately, per data repo,
   * and only takes effect once the run-routine workflow + secret exist.
   */
  manualRun: z.boolean().default(false),
})

export type Routine = z.infer<typeof routineSchema>
export type RoutinesFile = z.infer<typeof routinesFileSchema>
