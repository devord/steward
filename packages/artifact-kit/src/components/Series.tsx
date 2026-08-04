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
   *
   * It is also the one role excluded from the y scale — see `peak` below.
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
  /** y ceiling. Defaults to a clean step above the largest *observed* point. */
  max?: number
  lines: SeriesLine[]
  /** Axis captions, e.g. a step's net delta. */
  captions?: { x: string; text: string }[]
}

/**
 * The space the paths are drawn in. **Not pixels and no longer an aspect.**
 *
 * The SVG stretches to the plot rect (`preserveAspectRatio="none"`), so these
 * are only the units the geometry is expressed in; the rect's real size is CSS.
 * Every label is placed as a percentage of the same two numbers, which is why
 * nothing here has to know the render width.
 */
const W = 1000
const H = 400

/**
 * Vertical clearance between two stacked end labels, in percent of the plot.
 *
 * Percent because the labels are real 12px HTML and the plot is a CSS clamp —
 * there is no build-time pixel height to work in. Calibrated at the clamp's
 * floor: 9% of 160px is ~14px, so the gap only ever grows on a taller chart.
 */
const GAP = 9

const day = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`)

/** The next 1 / 2 / 5 × 10ⁿ at or above `raw`. */
function niceStep(raw: number) {
  const mag = 10 ** Math.floor(Math.log10(raw))
  const norm = raw / mag
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag
}

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
 *
 * **The SVG draws marks; HTML carries every glyph and rule.** That split is
 * the whole layout, and it is not a style preference — a fixed viewBox scaled
 * to `width: 100%` puts text in *user units*, so `text-xs` rendered at 12 × the
 * container's scale factor: ~30px labels on a wide board, beside identical
 * `text-xs` HTML at 12px, and a chart 2.5× taller than it was drawn. Strokes
 * escaped that via `vector-effect`; text had no equivalent. `Throughput` and
 * `TimeGrid` already split this way — this is the kit's pattern, not a new one.
 */
export function Series({ spec }: { spec: SeriesSpec }) {
  const x0 = day(spec.from)
  const x1 = day(spec.to)
  const span = Math.max(1, x1 - x0)

  /**
   * The y ceiling answers to the data, never to the projection.
   *
   * A `target` slope is where the line *would* have to go; letting it set the
   * scale spent the top fifth of the plot on a number nobody is claiming and
   * squashed scope and landed into the bottom third. It clips at the top edge
   * instead, which is the honest reading — a pace that leaves the chart is off
   * the chart. If every line is a target there is nothing else to scale to, so
   * they set it themselves.
   */
  const scaled = spec.lines.filter((l) => l.role !== "target")
  const observed = (scaled.length ? scaled : spec.lines).flatMap((l) =>
    l.points.map((p) => p.y),
  )
  const raw = Math.max(1, spec.max ?? 1, ...observed)
  // Clean intervals rather than exact maxima: a y axis labelled 0 / 17 / 34 /
  // 51 reads as arithmetic nobody chose, and `ceil(peak / 4)` lands on a clean
  // one only by luck. Snap the step, then lift the ceiling to a whole number
  // of them so the top gridline frames the plot instead of floating under it.
  const step = Math.max(1, niceStep(raw / 4))
  const peak = spec.max ?? Math.ceil(raw / step) * step

  /** 0–1 across the plot, left to right. */
  const fx = (iso: string) => (day(iso) - x0) / span
  /** 0–1 down the plot, so it is already a `top`. */
  const fy = (v: number) => 1 - v / peak
  const pct = (f: number) => `${(f * 100).toFixed(3)}%`

  const path = (l: SeriesLine) => {
    const pts = l.points.map((p) => [fx(p.x) * W, fy(p.y) * H] as const)
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

  const ticks: number[] = []
  for (let v = 0; v <= peak + 1e-9; v += step) ticks.push(v)

  // End labels are placed per line, so two lines running close put their
  // labels on top of each other — the ghost line sits just above the hero by
  // definition, so this is the normal case rather than the unlucky one. Walk
  // them in vertical order and push each down to clear the last.
  const ends = spec.lines
    .map((l) => {
      const last = l.points.at(-1)
      if (!last) return null
      // A target can end above the plot. Its label pins to the top edge; the
      // line itself is what gets clipped.
      return {
        id: l.id,
        label: l.label,
        top: Math.min(1, Math.max(0, fy(last.y))),
      }
    })
    .filter((e) => e !== null)
    .sort((a, b) => a.top - b.top)
  let floor = -Infinity
  for (const e of ends) {
    e.top = Math.max(e.top * 100, floor + GAP) / 100
    floor = e.top * 100
  }

  const hero = spec.lines.find((l) => ROLE[l.role].marker)
  const heroAt = hero?.points.at(-1)

  // `ch` in a monospace column *is* the advance width, so these are measured,
  // not estimated. The previous guess — 4.2 user units against Geist Mono's
  // real 7.2 at font-size 12 — is why "needs 108.5/wk" ran past the canvas and
  // was cropped by the widget card. A column that sizes to its longest label
  // cannot clip one.
  const tickCh = Math.max(1, ...ticks.map((v) => String(v).length))
  const labelCh = Math.max(1, ...spec.lines.map((l) => l.label.length))

  return (
    <figure className="m-0 flex flex-col gap-2">
      <div className="grid grid-cols-[auto_1fr_auto] gap-x-2">
        {/* y axis */}
        <div
          className="text-ink-dim relative font-mono text-xs tabular-nums"
          style={{ width: `${tickCh}ch` }}
        >
          {ticks.map((v) => (
            <span
              key={v}
              className="absolute right-0 -translate-y-1/2"
              style={{ top: pct(fy(v)) }}
            >
              {v}
            </span>
          ))}
        </div>

        {/* plot */}
        {/* Height only, and deliberately not `aspect-ratio`. The proportion is
            the same one the chart was drawn at — 30vw is ~10:3 — but an aspect
            is bidirectional, and a floored one sets a *minimum width* too:
            `min-h-40` at 16/5 demanded 512px of plot, so a 340px tile and a
            620px tile both overflowed the grid and cropped their own end
            labels off the right edge. A height cannot feed back into width.

            `vw` is the tile's own viewport — artifacts are iframed, so this
            reads per-tile rather than per-window. The cap keeps a wide board
            from spending 600px on a band; the floor is what makes the band
            tile-viable at all, and a known floor is one the fit pass can
            reason about instead of cropping in silence (ADR-0019). */}
        <div className="relative h-[clamp(10rem,30vw,22rem)] w-full">
          {/* Solid hairlines one step off the surface. Never dashed — that is
              the rule the target line is often mistaken for. Real CSS borders,
              so they are 1px at every width and cannot be stretched by the
              plot's aspect. */}
          {ticks.map((v) => (
            <div
              key={v}
              aria-hidden="true"
              className="border-border-dim absolute inset-x-0 border-t"
              style={{ top: pct(fy(v)) }}
            />
          ))}

          {spec.today ? (
            <div
              aria-hidden="true"
              className="border-ink-faint absolute inset-y-0 border-l border-dashed"
              style={{ left: pct(fx(spec.today)) }}
            />
          ) : null}

          {/* No `overflow-visible`: an SVG root clips to its viewBox by
              default, and that clip is what keeps a target slope inside the
              plot instead of drawing over the band above it. */}
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
            role="img"
            aria-label={`Burn-up: ${spec.lines.map((l) => l.label).join(", ")}`}
          >
            {spec.lines.map((l) => {
              const r = ROLE[l.role]
              return (
                <path
                  key={l.id}
                  d={path(l)}
                  fill="none"
                  className={cn(r.stroke)}
                  strokeWidth={r.width}
                  strokeDasharray={r.dash}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              )
            })}
          </svg>

          {/* A ring in the page surface, so the end marker stays legible where
              it crosses another line. HTML rather than a `<circle>`: the plot
              scales non-uniformly, and a circle in that space is an ellipse.
              Anchored to the real point, never to the nudged label. */}
          {heroAt ? (
            <div
              aria-hidden="true"
              className="bg-orange ring-bg1 absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2"
              style={{ left: pct(fx(heroAt.x)), top: pct(fy(heroAt.y)) }}
            />
          ) : null}
        </div>

        {/* Direct-labelled at the endpoint. Four lines or fewer, so every one
            gets a label and identity never rests on colour. */}
        <div
          className="text-ink-dim relative font-mono text-xs"
          style={{ width: `${labelCh}ch` }}
        >
          {ends.map((e) => (
            <span
              key={e.id}
              className="absolute left-0 -translate-y-1/2 whitespace-nowrap"
              style={{ top: pct(e.top) }}
            >
              {e.label}
            </span>
          ))}
        </div>

        {/* x axis. Flex, not three absolute spans: absolute ones do not know
            about each other, so a `today` late in the window printed straight
            through the end date — `2026-0today8-06` on every tile narrow
            enough to matter. Flex items cannot overlap, so the gap is a floor
            rather than a hope.

            The spacer's basis is what keeps `today` on its own rule despite
            that: it subtracts the start label and half of `today` (both known
            widths, and `ch` in a mono column *is* the advance), so the label's
            centre lands at exactly `fx` of the row. It is also the only
            shrinkable item, so when the row runs out the caption slides off
            the rule instead of colliding with the date. */}
        <div />
        <div className="text-ink-dim mt-1 flex gap-2 font-mono text-xs">
          <span className="shrink-0">{spec.from.slice(0, 10)}</span>
          {spec.today ? (
            <>
              <span
                aria-hidden="true"
                className="min-w-0 shrink"
                style={{
                  flexBasis: `calc(${(fx(spec.today) * 100).toFixed(3)}% - ${
                    spec.from.slice(0, 10).length + 2.5
                  }ch - 0.5rem)`,
                }}
              />
              <span className="shrink-0">today</span>
            </>
          ) : null}
          <span className="ml-auto shrink-0">{spec.to.slice(0, 10)}</span>
        </div>
        <div />
      </div>

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
