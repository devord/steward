import { cn } from "../ui/cn.ts"

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
    <div className="flex flex-col gap-2">
      <table className="w-auto border-collapse font-mono text-xs">
        <tbody>
          {spec.labels.map((rowLabel, r) => (
            <tr key={rowLabel}>
              <th
                scope="row"
                className="text-ink-dim max-w-[18ch] truncate pr-2 text-right font-normal whitespace-nowrap"
              >
                {rowLabel}
              </th>
              {spec.labels.map((colLabel, c) => {
                if (r === c) {
                  return (
                    <td key={colLabel} className="p-px">
                      <span className="bg-bg2/40 block size-4 rounded-xs" />
                    </td>
                  )
                }
                const v = at.get(`${r}:${c}`) ?? 0
                const isMarked = marked.has(`${r}:${c}`)
                return (
                  <td key={colLabel} className="p-px">
                    <span
                      className={cn(
                        "bg-orange block size-4 rounded-xs",
                        isMarked && "ring-ink ring-1",
                      )}
                      // Opacity rather than a stepped palette: the ramp stays
                      // one hue by construction, and it re-points with the
                      // theme like everything else.
                      style={{
                        opacity: v === 0 ? 0.06 : 0.15 + (v / peak) * 0.85,
                      }}
                      title={`${rowLabel} ↔ ${colLabel}: ${v}`}
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
              {spec.labels[m.a]} ↔ {spec.labels[m.b]}: {m.label}
            </span>
          ))}
        </p>
      ) : null}
    </div>
  )
}
