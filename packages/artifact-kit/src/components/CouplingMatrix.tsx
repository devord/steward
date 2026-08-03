import { cn } from "../ui/cn.ts"
import { Icon, INLINE_GLYPH } from "../ui/icon.tsx"

export interface MatrixSpec {
  /** Row and column labels — the same set, in the same order. */
  labels: string[]
  /** Upper- or lower-triangle cells; the component mirrors them. */
  cells: { a: number; b: number; value: number }[]
  /** Pairs worth naming, drawn with a ring rather than a hotter fill. */
  marks?: { a: number; b: number; label: string }[]
}

/**
 * Co-change as a field: which pairs move together, and how hard.
 *
 * **Sequential, one hue, light to dark.** Magnitude is the only thing encoded,
 * so it takes a single ramp — never a rainbow, and never a categorical set,
 * which would claim each pair is a different *kind* of thing rather than a
 * different amount of one.
 *
 * **The diagonal is blank, not zero.** A module co-changes with itself on
 * every commit; drawing that would put the darkest cells on the one axis
 * carrying no information and set the scale against a number that means
 * nothing.
 *
 * **A named pair gets a ring, not a hotter colour.** The fill already spends
 * itself on magnitude; marking significance with more of the same fill makes
 * two different claims in one channel, and the reader cannot tell which one a
 * dark cell is making.
 *
 * **Columns are numbered, and the number rides on the row label.** A square
 * matrix has to name both axes or a hot cell is a fact the reader cannot
 * repeat, and rotated column text is the one layout a headless author cannot
 * check. An index in the header and the same index beside the row label reads
 * `4 ↔ 7` off the grid and resolves both ends against the same list.
 *
 * **The field tiles.** Cells sit flush at a fixed width, because the whole
 * reason to draw a matrix rather than list the pairs is that a *cluster* is
 * visible at a glance — and a cluster needs adjacency. Every empty cell is
 * drawn too: the grid is the structure the eye reads the cluster against, so
 * a field of floating dots on the surface colour is not a sparser matrix, it
 * is no matrix at all.
 */
export function CouplingMatrix({ spec }: { spec: MatrixSpec }) {
  const peak = Math.max(1, ...spec.cells.map((c) => c.value))
  const at = new Map<string, number>()
  for (const c of spec.cells) {
    // Mirrored, so a triangle in and a full field out — the emitter should not
    // have to say the same pair twice.
    at.set(`${c.a}:${c.b}`, c.value)
    at.set(`${c.b}:${c.a}`, c.value)
  }
  const marked = new Set(
    (spec.marks ?? []).flatMap((m) => [`${m.a}:${m.b}`, `${m.b}:${m.a}`]),
  )

  return (
    <div className="flex flex-col items-start gap-2">
      {/* `self-start` and a fixed column width, because a table left to stretch
          in a flex column spreads 16px cells over 58px columns and the field
          stops reading as one. */}
      <table className="w-auto table-fixed border-collapse font-mono text-xs">
        <thead>
          <tr>
            <td className="p-px" />
            {spec.labels.map((colLabel, c) => (
              <th
                key={colLabel}
                scope="col"
                className="text-ink-faint w-5 p-px text-center font-normal"
                title={colLabel}
              >
                {c + 1}
                <span className="sr-only"> {colLabel}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {spec.labels.map((rowLabel, r) => (
            <tr key={rowLabel}>
              <th
                scope="row"
                className="text-ink-dim max-w-[18ch] truncate py-px pr-2 text-right font-normal whitespace-nowrap"
              >
                <span className="text-ink-faint">{r + 1}</span> {rowLabel}
              </th>
              {spec.labels.map((colLabel, c) => {
                if (r === c) {
                  return (
                    <td key={colLabel} className="p-px">
                      {/* The spine: the module against itself, quiet but drawn,
                          so the diagonal orients the eye instead of reading as
                          a column that failed to render. */}
                      <span className="bg-bg3 block size-5 rounded-xs" />
                    </td>
                  )
                }
                const v = at.get(`${r}:${c}`) ?? 0
                const isMarked = marked.has(`${r}:${c}`)
                return (
                  <td key={colLabel} className="p-px">
                    <span
                      className={cn(
                        "block size-5 rounded-xs",
                        // An empty pair is the grid, not a 6%-opacity accent:
                        // it has to survive on both themes or the field loses
                        // the structure the cluster is read against.
                        v === 0 ? "bg-bg2" : "bg-orange",
                        isMarked && "ring-ink ring-1",
                      )}
                      // Opacity rather than a stepped palette: the ramp stays
                      // one hue by construction, and it re-points with the
                      // theme like everything else.
                      style={
                        v === 0
                          ? undefined
                          : { opacity: 0.2 + (v / peak) * 0.8 }
                      }
                      // One phrasing, and no codepoint outside the injected
                      // font subset. It used to read `A ↔ B: 12` while the
                      // sr-only line below said `A and B: 12` — two sentences
                      // for one fact, and the hover one leaning on a glyph the
                      // artifact cannot guarantee.
                      title={`${rowLabel} and ${colLabel}: ${v}`}
                    >
                      <span className="sr-only">
                        {rowLabel} and {colLabel}: {v}
                      </span>
                    </span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {spec.marks?.length ? (
        <p className="text-ink-dim m-0 font-mono text-xs">
          {spec.marks.map((m, i) => (
            <span key={m.label}>
              {i > 0 ? " · " : ""}
              {/* Drawn, not typed, in both pairs: U+2194 is outside the latin
                  subset the board injects, so it arrived from a fallback face
                  with its own advance and baseline. See INLINE_GLYPH. The
                  `title` above stays text — an OS tooltip is not our type. */}
              <span className="text-ink-faint">
                {m.a + 1}
                <Icon
                  name="move-horizontal"
                  className={`${INLINE_GLYPH} mx-0.5`}
                />
                {m.b + 1}
              </span>{" "}
              {spec.labels[m.a]}
              <Icon name="move-horizontal" className={`${INLINE_GLYPH} mx-1`} />
              <span className="sr-only"> and </span>
              {spec.labels[m.b]}: {m.label}
            </span>
          ))}
        </p>
      ) : null}
    </div>
  )
}
