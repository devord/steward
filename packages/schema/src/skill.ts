import { parse } from "yaml"
import { z } from "zod"

import { widgetSizeSchema } from "./dashboard.ts"
import { slugSchema } from "./routine.ts"

/**
 * The `widget:` frontmatter block a skill adds to its SKILL.md to opt into
 * the add-routine picker (ADR-0015). Skills without it are not
 * routine-capable. Everything beyond `artifact` is a picker hint — missing
 * details fall back to wizard defaults.
 */
export const widgetMetaSchema = z.object({
  /** One-line description of what the artifact shows. */
  artifact: z.string().min(1),
  sizes: z
    .object({
      default: widgetSizeSchema,
      min: widgetSizeSchema.optional(),
    })
    .optional(),
  /** Suggested default cron schedule (5-field). */
  schedule: z.string().min(1).optional(),
})

/** One routine-capable skill as the picker consumes it, read live from a
    source repo's SKILL.md frontmatter (ADR-0015). */
export const routineSkillSchema = z.object({
  /** Skill directory name; what routines.yaml's `skill:` field references. */
  id: slugSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  widget: widgetMetaSchema,
})

const frontmatterSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().min(1),
  widget: widgetMetaSchema.optional(),
})

/**
 * Extract a skill's picker entry from its SKILL.md text. Returns null when
 * the file has no frontmatter, invalid frontmatter, or no valid `widget:`
 * block — discovery skips it either way; a central catalog that could fail
 * a build on one bad skill no longer exists (ADR-0015).
 */
export function parseRoutineSkill(
  id: string,
  skillMd: string,
): RoutineSkill | null {
  // Tolerate a UTF-8 BOM and CRLF line endings — a Windows-committed
  // SKILL.md must not silently vanish from the picker.
  const match = skillMd.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!match) return null
  let raw: unknown
  try {
    raw = parse(match[1] ?? "")
  } catch {
    return null
  }
  const frontmatter = frontmatterSchema.safeParse(raw)
  if (!frontmatter.success || frontmatter.data.widget == null) return null
  const candidate = {
    id,
    name: frontmatter.data.name ?? id,
    description: frontmatter.data.description,
    widget: frontmatter.data.widget,
  }
  const validated = routineSkillSchema.safeParse(candidate)
  return validated.success ? validated.data : null
}

export type WidgetMeta = z.infer<typeof widgetMetaSchema>
export type RoutineSkill = z.infer<typeof routineSkillSchema>
