import { parse } from "yaml"
import { z } from "zod"

import { widgetSizeSchema } from "./dashboard.ts"
import { slugSchema } from "./routine.ts"

/**
 * One input a template asks of the person adding a routine (ADR-0020) —
 * the wizard renders it as a real form field and stores the answer in the
 * routine's `params:` map, keyed by `key`.
 */
export const widgetParamSchema = z
  .object({
    /** Key in the routine's `params:` map. */
    key: slugSchema,
    /** Field label, Sentence case. */
    label: z.string().min(1),
    /**
     * `string` — free text; `select` — one of `options`; `repos` — a list
     * of `owner/repo` references, which the wizard also unions into the
     * routine's `repos:` so a cloud run can read them (ADR-0018/0020).
     */
    type: z.enum(["string", "select", "repos"]).default("string"),
    required: z.boolean().default(false),
    placeholder: z.string().min(1).optional(),
    /** One line under the field explaining what the value does. */
    hint: z.string().min(1).optional(),
    /** `select` only: the closed set of values. */
    options: z.array(z.string().min(1)).min(1).optional(),
  })
  .refine((param) => param.type !== "select" || param.options != null, {
    message: "a select param needs options",
    path: ["options"],
  })

/**
 * The `widget:` frontmatter block that makes a `templates/routines/<id>.md`
 * file a routine template (ADR-0015/0021). Files without it are invisible
 * to the picker. Everything beyond `artifact` is a picker hint — missing
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
  /** Inputs the wizard collects for this template (ADR-0020). */
  params: z
    .array(widgetParamSchema)
    .refine(
      (params) => new Set(params.map((p) => p.key)).size === params.length,
      { message: "param keys must be unique" },
    )
    .optional(),
  /**
   * MCP connector names the template's cloud runs typically need (e.g.
   * `Google_Calendar`) — picking the template pre-fills the routine's
   * `connectors:` allowlist, which otherwise defaults to none (ADR-0018).
   */
  connectors: z.array(z.string().min(1)).optional(),
  /**
   * Key of the param that carries the routine's *subject* — the thing an
   * instance is about (repo-pulse's `repos`). The wizard slugs instances
   * `<subject>-<kind>` (`corza-pulse`) instead of after the template, so
   * routines from one template don't collide on a counter (ADR-0040). Must
   * name a declared param. Absent = the template has no natural subject
   * (the `custom` built-in); the wizard falls back to a name-seeded slug.
   */
  subjectParam: z.string().min(1).optional(),
  /**
   * The stem appended after the subject in an instance slug — repo-pulse's
   * `pulse` yields `corza-pulse` (ADR-0040). Defaults to the template id's
   * last hyphen segment (`repo-pulse` → `pulse`), so most templates need
   * not set it; resolve via `templateKind`.
   */
  kind: slugSchema.optional(),
})

/** One routine template as the picker consumes it — parsed from
    `templates/routines/<id>.md` frontmatter (ADR-0021). */
export const routineTemplateSchema = z.object({
  /** File basename; what routines.yaml's `template:` field references. */
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
 * Extract a template's picker entry from its markdown text. Returns null
 * when the file has no frontmatter, invalid frontmatter, or no valid
 * `widget:` block — discovery skips it either way; a central catalog that
 * could fail a build on one bad file no longer exists (ADR-0015).
 */
export function parseRoutineTemplate(
  id: string,
  templateMd: string,
): RoutineTemplate | null {
  // Tolerate a UTF-8 BOM and CRLF line endings — a Windows-committed
  // template must not silently vanish from the picker.
  const match = templateMd.match(
    /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/,
  )
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
  const validated = routineTemplateSchema.safeParse(candidate)
  return validated.success ? validated.data : null
}

/**
 * The slug stem for a template's instances (ADR-0040): its explicit
 * `widget.kind`, else the template id's last hyphen segment (`repo-pulse`
 * → `pulse`). The wizard slugs a routine `<subject>-<kind>`.
 */
export function templateKind(template: RoutineTemplate): string {
  if (template.widget.kind) return template.widget.kind
  const segments = template.id.split("-").filter(Boolean)
  return segments.at(-1) ?? template.id
}

export type WidgetParam = z.infer<typeof widgetParamSchema>
export type WidgetMeta = z.infer<typeof widgetMetaSchema>
export type RoutineTemplate = z.infer<typeof routineTemplateSchema>
