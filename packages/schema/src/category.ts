import { z } from "zod"

import type { Routine } from "./routine.ts"

/**
 * Ceiling for a category name — a band heading, not a paragraph. Matches
 * `SECTION_NAME_MAX`: the same kind of label, one tier down (ADR-0044).
 */
export const CATEGORY_NAME_MAX = 40

/**
 * Distinct categories a board needs before it bands at all (ADR-0044).
 * Below the floor the grid renders flat and headingless — a lone
 * "Engineering" band sitting above five uncategorized widgets reads worse
 * than the plain grid it replaced, and a template gaining a category must
 * never make an unrelated board look broken.
 */
export const CATEGORY_BAND_FLOOR = 2

/**
 * A category name wherever one is authored — a template's default or a
 * routine's override. Blank is not a category; absence is how a template
 * says it has none.
 */
export const categoryNameSchema = z
  .string()
  .min(1)
  .max(CATEGORY_NAME_MAX)
  .refine((text) => text.trim().length > 0, "must not be blank")

/**
 * A routine's `category:` field. Tri-state, and each state is load-bearing
 * (ADR-0044):
 *
 * - **a name** — this routine's band, overriding whatever its template says
 * - **`null`** — deliberately no band; the explicit opt-out
 * - **absent** — inherit the template's `widget.category`
 *
 * `null` exists because inheritance made absence mean "ask the template",
 * which left nothing to mean "I looked, and the answer is none".
 */
export const routineCategorySchema = categoryNameSchema.nullable()

/**
 * The band a routine's widget belongs to, or `null` for none (ADR-0044).
 *
 * `templateCategory` is the routine's template's own `widget.category` —
 * the value inherited when the routine names none. Pass `undefined` when
 * the template hasn't been read: a board's templates arrive on the stream
 * (ADR-0030) while `routines.yaml` is awaited, and a materialized
 * `category` answers on its own, which is the point of writing it forward.
 */
export function resolveCategory(
  routine: Pick<Routine, "category">,
  templateCategory: string | null | undefined,
): string | null {
  // Distinguishes an explicit null (opt-out) from absence (inherit) — the
  // one place the tri-state is actually read.
  if (routine.category !== undefined) return routine.category
  return templateCategory ?? null
}

/**
 * Band order for one board (ADR-0044) — ADR-0034's section rule ported one
 * tier down. Names the repo's `categories:` lists render in that order;
 * names it omits sort after them, alphabetically; and a listed name no
 * routine uses contributes nothing, so there is never an empty band.
 *
 * The uncategorized band is not in here: it leads, unlabeled, and the
 * caller places it.
 */
export function orderCategories(
  present: Iterable<string>,
  order: readonly string[] | undefined,
): string[] {
  const remaining = new Set(present)
  const listed: string[] = []
  for (const name of order ?? []) {
    // delete() reports membership and consumes in one step, so a name
    // listed twice in repo.yaml can't emit two bands.
    if (remaining.delete(name)) listed.push(name)
  }
  return [...listed, ...[...remaining].sort((a, b) => a.localeCompare(b))]
}
