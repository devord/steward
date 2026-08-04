import { PALETTE } from "../tokens/palette.ts"
import { TYPE_FLOOR } from "./conform.ts"

/**
 * The kit's finish, applied over whatever flint derived (ADR-0062).
 *
 * The seam the whole decision draws: a routine names the **form**, and
 * everything about how that form *draws* is decided here, once, for every
 * chart. Without this a board of seventeen widgets is seventeen chart
 * identities — which is the drift ADR-0050 exists to prevent, arriving by a
 * new route.
 *
 * Flint's docs warn that editing its output leaves you with something that is
 * "no longer a portable Flint spec". Portable there means swappable to
 * ECharts, Plotly or Excel. We compile to Vega-Lite and nothing else, so the
 * warning costs us nothing — and that is exactly what makes the finish
 * possible. The first spike render came back competent and characterless: no
 * now-marker, no end dot, raw field names as axis titles, eleven dense
 * mixed-format date ticks. All of it was recoverable through Vega-Lite's own
 * vocabulary.
 */

/** The mono stack, matching `--font-mono` in the generated tokens. */
export const MONO =
  '"Geist Mono Variable", ui-monospace, "SF Mono", Menlo, monospace'

/**
 * An **emphasis** palette, not a categorical one: one hue plus grays.
 *
 * Inherited wholesale from `Series.tsx`, whose docstring is the reasoning —
 * one series is the point, the rest are context, and painting the context in
 * hues spends an accent budget that belongs elsewhere on the page. Flint will
 * happily hand back six competing colours; this is what it gets instead.
 *
 * Ordered, and consumed in order: the first series a routine names is the one
 * the chart is about.
 */
export const SERIES_INK: readonly string[] = [
  PALETTE.orange,
  PALETTE["ink-dim"],
  PALETTE.ink,
  PALETTE.yellow,
  PALETTE.aqua,
  PALETTE.blue,
]

/** Dash patterns, so identity never rests on colour alone. */
export const SERIES_DASH: readonly (readonly number[])[] = [
  [1, 0],
  [1, 0],
  [6, 4],
  [2, 3],
  [4, 2],
  [1, 2],
]

/**
 * Clamp every type size to the artifact floor.
 *
 * Applied to the **spec**, not the output, and that ordering is load-bearing:
 * Vega lays out against the size it believes it will paint, so a stylesheet
 * that merely enlarges the text afterwards leaves the labels positioned for
 * 10px and colliding at 12.
 */
export function clampType(node: unknown): void {
  if (Array.isArray(node)) {
    for (const v of node) clampType(v)
    return
  }
  if (typeof node !== "object" || node === null) return
  // `Reflect.set` rather than an index write: the repo forbids type assertions
  // outside tests (`consistent-type-assertions: never`), and a narrowed
  // `object` has no index signature to write through.
  for (const [k, v] of Object.entries(node)) {
    if (/[Ff]ontSize$/.test(k) && typeof v === "number")
      Reflect.set(node, k, Math.max(TYPE_FLOOR, v))
    else clampType(v)
  }
}

/**
 * The Vega-Lite `config` every kit chart carries.
 *
 * Everything that decides ink, weight and type lives here rather than on any
 * one chart, so a design fix is one edit instead of one per form.
 */
export function kitConfig(): Record<string, unknown> {
  return {
    font: MONO,
    background: null,
    axis: {
      labelFont: MONO,
      titleFont: MONO,
      labelFontSize: TYPE_FLOOR,
      titleFontSize: TYPE_FLOOR,
      labelColor: PALETTE["ink-dim"],
      titleColor: PALETTE["ink-dim"],
      // Solid hairlines one step off the surface. Never dashed — that is the
      // convention a target slope owns, and the two get confused.
      gridColor: PALETTE["border-dim"],
      domainColor: PALETTE["border-dim"],
      tickColor: PALETTE["border-dim"],
      gridOpacity: 1,
      tickSize: 4,
    },
    legend: {
      labelFont: MONO,
      titleFont: MONO,
      labelFontSize: TYPE_FLOOR,
      titleFontSize: TYPE_FLOOR,
      labelColor: PALETTE["ink-dim"],
      titleColor: PALETTE["ink-dim"],
      symbolStrokeWidth: 2,
      symbolSize: 120,
      padding: 0,
      rowPadding: 4,
    },
    title: { font: MONO, fontSize: TYPE_FLOOR, color: PALETTE["ink-dim"] },
    text: { font: MONO, fontSize: TYPE_FLOOR, fill: PALETTE["ink-dim"] },
    view: { stroke: null },
    /**
     * The base every mark inherits. Setting only the per-mark blocks below
     * left `#4c78a8` — Vega-Lite's own default mark colour — on any form the
     * kit had not enumerated, which for an unrestricted `chartType` is most
     * of the catalogue. One key covers the ones nobody thought of.
     */
    mark: { color: PALETTE.orange },
    line: { strokeWidth: 2, strokeCap: "round", strokeJoin: "round" },
    /**
     * Filled, explicitly. Vega-Lite leaves `point` unfilled by default, so it
     * paints with the *stroke* — and a scatter drawn in the surface colour is
     * a scatter of invisible dots.
     */
    point: { filled: true, fill: PALETTE.orange },
    rule: { stroke: PALETTE["ink-faint"] },
    bar: { fill: PALETTE.orange },
    area: { fill: PALETTE.orange },
    arc: { fill: PALETTE.orange },
    rect: { fill: PALETTE.orange },
    range: {
      // Flint derives a categorical range and reaches for tableau10. Replacing
      // the ranges here is what stops that from ever reaching a scale.
      category: [...SERIES_INK],
      ordinal: [PALETTE.bg3, PALETTE.orange],
      ramp: [PALETTE.bg3, PALETTE.orange],
      heatmap: [PALETTE.bg3, PALETTE.orange],
      diverging: [PALETTE.blue, PALETTE.bg3, PALETTE.orange],
    },
  }
}

/**
 * Apply the finish to an assembled flint spec, in place, and return it.
 *
 * `size` is set here rather than left to flint's `baseSize`, because a band
 * renders once per tier and the tier decides the box (ADR-0062).
 */
/**
 * Merge two config trees with the kit's leaf winning.
 *
 * Depth is the whole point, and a shallow spread is measurably wrong: flint
 * sets `config.axis` for its own layout reasons, and a spread replaced the
 * kit's entire `axis` object with it — taking `gridColor` with it, so every
 * chart came back carrying Vega's default `#ddd` gridline. One key of flint's
 * cost the kit eleven of its own.
 *
 * Kit wins at the leaves rather than flint, because the leaves are where ink,
 * type and face live, and those are the kit's by ADR-0062. Flint keeps every
 * key the kit does not name — which is where its layout knowledge actually
 * sits.
 */
function deepMerge(
  base: Record<string, unknown>,
  over: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base }
  for (const [k, v] of Object.entries(over)) {
    const b = out[k]
    out[k] =
      isPlainObject(b) && isPlainObject(v) ? deepMerge(b, v) : (v ?? out[k])
  }
  return out
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

export function finish<T>(spec: T, size: { width: number; height: number }): T {
  clampType(spec)
  if (typeof spec === "object" && spec !== null) {
    const own: unknown = Reflect.get(spec, "config")
    Object.assign(spec, {
      width: size.width,
      height: size.height,
      background: null,
      // Flint's config first, the kit's over it: flint contributes what the
      // kit is silent about, and never the other way round.
      config: deepMerge(isPlainObject(own) ? own : {}, kitConfig()),
    })
  }
  return spec
}
