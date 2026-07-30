import { cn } from "../ui/cn.ts"

/**
 * What a line *is*, which is what a routine gets to say. The kit owns every
 * visual consequence — hue, weight, dash, marker, label — so a chart cannot
 * drift into four competing identities one routine at a time.
 *
 * This is an **emphasis** chart, not a categorical one: one hue plus gray
 * (`dataviz` · choosing-a-form, "one series is the point, rest are context").
 * The context lines reading as gray is the intent. Do not "fix" them into
 * hues — it would spend an accent budget that belongs elsewhere on the page
 * and turn a legible chart into four things shouting.
 */
export type SeriesRole = "hero" | "ceiling" | "target" | "ghost"

const ROLE: Record<
  SeriesRole,
  {
    stroke: string
    width: number
    dash?: string
    step?: boolean
    marker?: boolean
  }
> = {
  /** The series that is the point. The chart's one loud line. */
  hero: { stroke: "stroke-orange", width: 2, marker: true },
  /** A moving ceiling — steps where the thing being counted changed. */
  ceiling: { stroke: "stroke-ink-dim", width: 2, step: true },
  /**
   * A target slope. Dashed because it is not-yet-realised, which is the
   * standing convention. `dataviz` forbids dashed *gridlines and axes*; the
   * two rules get confused, and someone will eventually try to "fix" this
   * into a solid line.
   */
  target: { stroke: "stroke-ink", width: 2, dash: "6 4" },
  /**
   * Shown, never counted — the hero drawn at its optimistic ceiling. It wears
   * the hero's hue at lower weight rather than a colour of its own, because
   * it is not a fourth identity.
   *
   * `ink-faint` was the obvious alternative and is measurably wrong: against
   * the ceiling line's `ink-dim` it scores an OKLab ΔE of 7.1 unsimulated,
   * far under the normal-vision floor of 15 — the one floor a secondary
   * encoding does not excuse.
   */
  ghost: {
    stroke:
      "stroke-[color-mix(in_oklab,var(--color-orange)_55%,var(--color-bg1))]",
    width: 1.5,
    dash: "2 3",
  },
}

export interface SeriesLine {
  id: string
  /** Direct end-label — "16 landed", "needs 11.2/wk". */
  label: string
  role: SeriesRole
  /** Cumulative points, sorted by x. */
  points: { x: string; y: number }[]
}

export interface SeriesSpec {
  /** ISO date bounds of the x axis. */
  from: string
  to: string
  /** The now marker. */
  today?: string
  /** y ceiling. Defaults to the largest point across every line. */
  max?: number
  lines: SeriesLine[]
  /** Axis captions, e.g. a step's net delta. */
  captions?: { x: string; text: string }[]
}

// A fixed viewBox scaled to the container. `vector-effect` keeps every stroke
// at its specified width regardless — without it a 2px line is only 2px at one
// container size, which is the whole point of specifying it.
const W = 800
const H = 260
const PAD = { top: 12, right: 96, bottom: 28, left: 40 }

const day = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`)

/**
 * The burn-up: cumulative counts against a moving ceiling and a target slope.
 *
 * **One y-scale by construction.** Every line is the same unit — a count — so
 * the no-dual-axis rule holds structurally rather than by discipline. A second
 * measure would need a second chart, not a second axis.
 *
 * **Static.** Geometry is computed here and emitted as paths; the artifact
 * fetches nothing and runs nothing. `dataviz` asks for a hover layer by
 * default and this ships without one: the static render is fully honest, every
 * line is direct-labelled at its end, and the numbers are also in the table
 * beside it. A crosshair is a SHOULD here rather than a MUST, and it would be
 * the first behaviour in a kit component that the board does not already
 * inject.
 */
export function Series({ spec }: { spec: SeriesSpec }) {
  const x0 = day(spec.from)
  const x1 = day(spec.to)
  const span = Math.max(1, x1 - x0)
  const peak =
    spec.max ??
    Math.max(1, ...spec.lines.flatMap((l) => l.points.map((p) => p.y)))

  const px = (iso: string) =>
    PAD.left + ((day(iso) - x0) / span) * (W - PAD.left - PAD.right)
  const py = (v: number) =>
    H - PAD.bottom - (v / peak) * (H - PAD.top - PAD.bottom)

  const path = (l: SeriesLine) => {
    const pts = l.points.map((p) => [px(p.x), py(p.y)] as const)
    if (!pts.length) return ""
    if (!ROLE[l.role].step) {
      return pts.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ")
    }
    // stepAfter: the value holds until the next recorded change, which is what
    // a membership count actually does between runs. Interpolating would draw
    // a gradual scope change that never happened.
    let d = `M${pts[0][0]} ${pts[0][1]}`
    for (let i = 1; i < pts.length; i++) {
      d += ` L${pts[i][0]} ${pts[i - 1][1]} L${pts[i][0]} ${pts[i][1]}`
    }
    return d
  }

  // Clean intervals rather than exact maxima: a y axis labelled 0 / 13 / 27 /
  // 40 reads as arithmetic nobody chose.
  const step = Math.max(1, Math.ceil(peak / 4))
  const ticks: number[] = []
  for (let v = 0; v <= peak; v += step) ticks.push(v)

  // End labels are placed per line, so two lines running close put their
  // labels on top of each other — the ghost line sits just above the hero by
  // definition, so this is the normal case rather than the unlucky one. Walk
  // them in vertical order and push each down to clear the last.
  //
  // Text metrics are approximate on purpose: this only has to separate labels,
  // and measuring glyphs would mean shipping a font table to do it exactly.
  const GAP = 14
  const CHAR = 4.2
  const ends = spec.lines
    .map((l) => {
      const last = l.points.at(-1)
      return last ? { line: l, x: px(last.x), y: py(last.y), at: last } : null
    })
    .filter((e) => e !== null)
    .sort((a, b) => a.y - b.y)
  let floor = -Infinity
  for (const e of ends) {
    e.y = Math.max(e.y, floor + GAP)
    floor = e.y
  }

  return (
    <figure className="m-0 flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        className="h-auto w-full overflow-visible"
        role="img"
        aria-label={`Burn-up: ${spec.lines.map((l) => l.label).join(", ")}`}
      >
        {/* Solid hairlines one step off the surface. Never dashed — that is
            the rule the target line is often mistaken for. */}
        {ticks.map((v) => (
          <g key={v}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={py(v)}
              y2={py(v)}
              className="stroke-border-dim"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={PAD.left - 8}
              y={py(v) + 4}
              textAnchor="end"
              className="fill-ink-dim font-mono text-xs tabular-nums"
            >
              {v}
            </text>
          </g>
        ))}

        {spec.today ? (
          <g>
            <line
              x1={px(spec.today)}
              x2={px(spec.today)}
              y1={PAD.top}
              y2={H - PAD.bottom}
              className="stroke-ink-faint"
              strokeWidth={1}
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={px(spec.today)}
              y={H - PAD.bottom + 18}
              textAnchor="middle"
              className="fill-ink-dim font-mono text-xs"
            >
              today
            </text>
          </g>
        ) : null}

        <text
          x={PAD.left}
          y={H - PAD.bottom + 18}
          className="fill-ink-dim font-mono text-xs"
        >
          {spec.from.slice(0, 10)}
        </text>
        <text
          x={W - PAD.right}
          y={H - PAD.bottom + 18}
          textAnchor="end"
          className="fill-ink-dim font-mono text-xs"
        >
          {spec.to.slice(0, 10)}
        </text>

        {spec.lines.map((l) => {
          const r = ROLE[l.role]
          const last = l.points.at(-1)
          const end = ends.find((e) => e.line.id === l.id)
          const overflows = !!end && end.x + 10 + l.label.length * CHAR > W - 4
          return (
            <g key={l.id}>
              <path
                d={path(l)}
                fill="none"
                className={cn(r.stroke)}
                strokeWidth={r.width}
                strokeDasharray={r.dash}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
              {r.marker && last ? (
                // A ring in the page surface, so the end marker stays legible
                // where it crosses another line. Anchored to the real point,
                // never to the nudged label.
                <circle
                  cx={px(last.x)}
                  cy={py(last.y)}
                  r={4}
                  className="fill-orange stroke-bg1"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
              {end ? (
                // Direct-labelled at the endpoint. Four lines or fewer, so
                // every one gets a label and identity never rests on colour.
                // Flips to the inside rather than running off the plot when a
                // long label would overflow the right margin.
                <text
                  x={overflows ? W - 4 : end.x + 10}
                  y={end.y + 4}
                  textAnchor={overflows ? "end" : undefined}
                  className="fill-ink-dim font-mono text-xs"
                >
                  {l.label}
                </text>
              ) : null}
            </g>
          )
        })}
      </svg>

      {/* Present whenever there are two or more lines, on top of the direct
          labels and the four line styles. Three channels, so the chart
          survives greyscale and full colour-vision deficiency without leaning
          on any one of them. */}
      {spec.lines.length > 1 ? (
        <figcaption className="text-ink-dim flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs">
          {spec.lines.map((l) => (
            <span key={l.id} className="inline-flex items-center gap-1.5">
              <svg width="18" height="8" aria-hidden="true">
                <line
                  x1="0"
                  x2="18"
                  y1="4"
                  y2="4"
                  className={cn(ROLE[l.role].stroke)}
                  strokeWidth={ROLE[l.role].width}
                  strokeDasharray={ROLE[l.role].dash}
                  strokeLinecap="round"
                />
              </svg>
              {l.label}
            </span>
          ))}
        </figcaption>
      ) : null}
    </figure>
  )
}
