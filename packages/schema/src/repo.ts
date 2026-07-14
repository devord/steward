import { z } from "zod"

/** Path of a data repo's own metadata file (ADR-0026). Optional — a repo
    without one just renders under its short repo name. */
export const REPO_FILE_PATH = "data/repo.yaml"

/** Ceiling for the display name — a rail heading, not a paragraph. */
export const REPO_NAME_MAX = 50

/** Shape of data/repo.yaml in a data repo (ADR-0026). */
export const repoFileSchema = z.object({
  /**
   * Display name for the repo's rail group, shared with everyone who reads
   * the repo (it lives in the repo, versioned like the rest of the config).
   * Relabels the group only — the `owner/repo` slug stays visible in the
   * access popover, and identifiers (URLs, payloads, prompts) never use it.
   */
  name: z
    .string()
    .min(1)
    .max(REPO_NAME_MAX)
    .refine((text) => text.trim().length > 0, "must not be blank")
    .optional(),
  /**
   * Order of the rail's dashboard sections (ADR-0034, ADR-0039). Membership
   * rides on each board's own `section` field; this list carries only the
   * sequence. Listed sections render in this order; a section a board names
   * but this list omits sorts after, alphabetically. Names not matching any
   * board's `section` are ignored — a harmless leftover, never an error.
   */
  sections: z.array(z.string().min(1)).optional(),
})

export type RepoFile = z.infer<typeof repoFileSchema>
