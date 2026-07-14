import type { SidebarBoard } from "./dashboard.server.ts"

/** One rail section: a heading and the boards under it, ready to render. */
export interface BoardSection {
  /** Section label, or null for the unlabeled lead section that holds the
      repo's ungrouped boards (where the default `main` normally sits). */
  label: string | null
  boards: SidebarBoard[]
}

/**
 * Partition a repo's boards into the sections the rail draws, in render order
 * (ADR-0034). Membership is each board's own `section`; `order` (the repo's
 * `sections` list) carries only the sequence.
 *
 * - Ungrouped boards lead, in one unlabeled section — so a repo with no
 *   sections authored yields a single label-less section and the rail renders
 *   exactly as it did before grouping existed (no sub-headings, no regression).
 * - Labeled sections follow: those named in `order` first, in that order, then
 *   any section a board names but `order` omits, alphabetically. A name in
 *   `order` that no board uses contributes nothing (never an empty heading).
 * - Board order within each section is preserved from the input (the caller
 *   sorts by slug), so sections read sorted without re-sorting here.
 */
export function sectionBoards(
  boards: SidebarBoard[],
  order: string[],
): BoardSection[] {
  const ungrouped: SidebarBoard[] = []
  // Insertion-ordered so unlisted sections fall back to the boards' own
  // (slug-sorted) first-seen order before the alphabetical tiebreak below.
  const sectioned = new Map<string, SidebarBoard[]>()
  for (const board of boards) {
    if (board.section == null) {
      ungrouped.push(board)
      continue
    }
    const bucket = sectioned.get(board.section)
    if (bucket) bucket.push(board)
    else sectioned.set(board.section, [board])
  }

  // Listed sections first (only those that actually have boards), in the
  // authored order; then the rest alphabetically.
  const listed = order.filter((label) => sectioned.has(label))
  const rest = [...sectioned.keys()]
    .filter((label) => !listed.includes(label))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))

  const sections: BoardSection[] = []
  if (ungrouped.length > 0) sections.push({ label: null, boards: ungrouped })
  for (const label of [...listed, ...rest]) {
    sections.push({ label, boards: sectioned.get(label) ?? [] })
  }
  return sections
}

/**
 * The repo's `sections` order list (data/repo.yaml, ADR-0034/0039) after a
 * section is renamed or removed — the ordering half of a section edit, run
 * alongside rewriting each board's own `section` (membership rides there, not
 * here). `rename` maps the old name to the new in place, then dedupes, so a
 * rename onto a name already in the list merges to one entry keeping the
 * earlier slot (the allow-merge case). `remove` drops the name. Order is
 * otherwise preserved. A name not in the list is a no-op — the list carries
 * only sequence, so an unlisted section simply had none. Returns a new array;
 * the input is untouched.
 */
export function reorderAfterSectionEdit(
  order: string[],
  edit: { rename: { from: string; to: string } } | { remove: string },
): string[] {
  if ("remove" in edit) return order.filter((label) => label !== edit.remove)
  const { from, to } = edit.rename
  const mapped = order.map((label) => (label === from ? to : label))
  return mapped.filter((label, i) => mapped.indexOf(label) === i)
}
