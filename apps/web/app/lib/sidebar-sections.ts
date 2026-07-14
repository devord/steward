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
 * (ADR-0034). Membership is each board's own `group`; `order` (the repo's
 * `groups` list) carries only the sequence.
 *
 * - Ungrouped boards lead, in one unlabeled section — so a repo with no
 *   sections authored yields a single label-less section and the rail renders
 *   exactly as it did before grouping existed (no sub-headings, no regression).
 * - Labeled sections follow: those named in `order` first, in that order, then
 *   any section a board names but `order` omits, alphabetically. A name in
 *   `order` that no board uses contributes nothing (never an empty heading).
 * - Board order within each section is preserved from the input (the caller
 *   sorts by display label), so sections read sorted without re-sorting here.
 */
export function groupBoards(
  boards: SidebarBoard[],
  order: string[],
): BoardSection[] {
  const ungrouped: SidebarBoard[] = []
  // Insertion-ordered so unlisted sections fall back to the boards' own
  // (label-sorted) first-seen order before the alphabetical tiebreak below.
  const grouped = new Map<string, SidebarBoard[]>()
  for (const board of boards) {
    if (board.group == null) {
      ungrouped.push(board)
      continue
    }
    const bucket = grouped.get(board.group)
    if (bucket) bucket.push(board)
    else grouped.set(board.group, [board])
  }

  // Listed sections first (only those that actually have boards), in the
  // authored order; then the rest alphabetically.
  const listed = order.filter((label) => grouped.has(label))
  const rest = [...grouped.keys()]
    .filter((label) => !listed.includes(label))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))

  const sections: BoardSection[] = []
  if (ungrouped.length > 0) sections.push({ label: null, boards: ungrouped })
  for (const label of [...listed, ...rest]) {
    sections.push({ label, boards: grouped.get(label) ?? [] })
  }
  return sections
}
