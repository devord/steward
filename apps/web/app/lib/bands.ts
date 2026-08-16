import type { Routine, Widget } from "@steward/schema"
import {
  CATEGORY_BAND_FLOOR,
  orderCategories,
  resolveCategory,
} from "@steward/schema"

/**
 * Grouping a board's widgets into category bands (ADR-0044).
 *
 * A board is per *subject* (`corza`) and a widget is a *kind* (`pulse`);
 * a band groups kinds into "Project Management", "Engineering". Each band
 * renders as its own grid instance, because RGL's vertical compactor floats
 * items up until they collide and has no notion of a boundary — one grid
 * with headings between rows would let an Engineering widget drift into the
 * band above it the first time a neighbour is removed (ADR-0041).
 */

export interface PlacedCell {
  widget: Widget
  routine: Routine
}

export interface Band {
  /** The band's heading, or null for the unlabeled band that leads a board. */
  category: string | null
  cells: PlacedCell[]
}

/**
 * A board's cells split into bands, in render order: the uncategorized band
 * leads unlabeled (where every widget sits today), then labeled bands in the
 * repo's authored order — ADR-0034's section rules, one tier down.
 *
 * Below {@link CATEGORY_BAND_FLOOR} distinct categories the whole board
 * collapses to one unlabeled band, which renders exactly as it does today. A
 * built-in template gaining a category must not leave an unrelated board
 * showing a one-widget heading above five headingless widgets — that reads as
 * breakage, not as organization.
 *
 * `templateCategories` maps template id → its default band. It carries the
 * bundled built-ins from the loader at first paint and gains repo templates
 * when the template stream lands (ADR-0030); a routine with a materialized
 * `category` never consults it at all.
 */
export function buildBands(
  cells: PlacedCell[],
  templateCategories: Record<string, string>,
  categoryOrder: readonly string[],
): Band[] {
  const categoryFor = (cell: PlacedCell) =>
    resolveCategory(cell.routine, templateCategories[cell.routine.template])

  const grouped = new Map<string | null, PlacedCell[]>()
  for (const cell of cells) {
    const category = categoryFor(cell)
    const bucket = grouped.get(category)
    if (bucket) bucket.push(cell)
    else grouped.set(category, [cell])
  }

  const labelled = [...grouped.keys()].filter((key) => key !== null)
  if (labelled.length < CATEGORY_BAND_FLOOR) {
    return [{ category: null, cells }]
  }

  const uncategorized = grouped.get(null)
  return [
    ...(uncategorized ? [{ category: null, cells: uncategorized }] : []),
    ...orderCategories(labelled, categoryOrder).map((category) => ({
      category,
      cells: grouped.get(category) ?? [],
    })),
  ]
}

/**
 * The repo's `categories:` list (data/repo.yaml, ADR-0044) after one band is
 * moved past a neighbour — the ordering gesture the board's band menu commits.
 *
 * `present` is every category the repo's routines resolve to, already in
 * render order (`orderCategories` over the authored list). `neighbour` is the
 * band sitting next to `name` **on the board in view**, which is usually not
 * its neighbour repo-wide: each board shows a subset, so swapping adjacent
 * entries of the authored list would routinely move nothing the reader can
 * see. Moving past the *displayed* neighbour is the gesture; the repo-wide
 * list absorbs it, and names this board never shows keep their relative
 * places.
 *
 * The whole present set comes back, not only the names already listed.
 * `categories:` carries just the sequence it names and everything else sorts
 * alphabetically after it, so a first nudge has to materialize the rest or the
 * unlisted bands would jump the moment one band moved. ADR-0039's
 * parse-boundary move, one tier down: the first in-app edit writes the file
 * forward and no migration is needed.
 */
export function moveCategory(
  present: readonly string[],
  name: string,
  neighbour: string,
): string[] {
  const from = present.indexOf(name)
  const to = present.indexOf(neighbour)
  // A name absent from the list (or moved past itself) has no move to make —
  // return the order untouched rather than inventing a slot for it.
  if (from < 0 || to < 0 || from === to) return [...present]
  const rest = present.filter((entry) => entry !== name)
  const at = rest.indexOf(neighbour)
  // Moving up (the neighbour precedes it) lands before the neighbour; moving
  // down lands after. The two swap places as displayed, whatever sits between
  // them repo-wide.
  const cut = from > to ? at : at + 1
  return [...rest.slice(0, cut), name, ...rest.slice(cut)]
}

/**
 * Merge the streamed repo templates' categories over the bundled built-in
 * ones (ADR-0021's shadowing order: a repo template shadows a same-named
 * built-in). Returns the base map unchanged when the stream hasn't landed,
 * so the identity is stable and the board's band memo doesn't churn.
 */
export function mergeTemplateCategories(
  builtin: Record<string, string>,
  streamed: { id: string; widget: { category?: string } }[] | null,
) {
  if (!streamed?.length) return builtin
  const merged = { ...builtin }
  for (const template of streamed) {
    if (template.widget.category) merged[template.id] = template.widget.category
  }
  return merged
}
