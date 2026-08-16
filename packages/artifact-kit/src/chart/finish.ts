import { PALETTE } from "../tokens/palette.ts"
import { ALLOWED, TYPE_FLOOR } from "./conform.ts"
import {
  isJsonNumber,
  isJsonObject,
  isJsonString,
  type JsonObject,
  type JsonValue,
} from "../json.ts"

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

/**
 * The sequential ramp, in **discrete palette steps**.
 *
 * Not two endpoints with Vega interpolating between them, and that is not a
 * stylistic preference — a continuous scale emits the colours it computed, and
 * an interpolated `rgb(167, 99, 51)` is in no palette, so the board's theme
 * override cannot re-point it and the conformance gate rejects the whole
 * chart. The first heatmap through this pipeline was dropped for exactly that,
 * naming five interpolated colours.
 *
 * Quantizing is also the better chart. A banded field can be read off a
 * legend; a continuous one asks the reader to judge lightness differences they
 * cannot reliably see. Magnitude is still the only thing encoded, one hue,
 * light to dark — ADR-0047's rule, kept.
 */
export const RAMP: readonly string[] = [
  PALETTE.bg3,
  PALETTE.border,
  PALETTE["orange-deep"],
  PALETTE.orange,
]

/**
 * Put every colour scale onto the kit's palette — the ramp for a magnitude,
 * the emphasis inks for a category.
 *
 * Reaches into the spec rather than resting on `config.range`, and the two
 * halves reach in for different reasons.
 *
 * **Quantitative.** There is no `config` knob for "never interpolate":
 * `config.range.heatmap` supplies the colours but the *scale type* decides
 * whether Vega uses them as stops or as bins, so a `"Heatmap"` gets a
 * continuous scale from flint and is dropped by conformance without this.
 *
 * **Categorical.** `config.range.category` looks like it should be enough and
 * is not: flint names a `scheme` on the scale, and a named scheme beats the
 * config range. This is the hole that shipped ADR-0062 — every generic `chart`
 * block with a `color` channel was dropped at publish, painting tableau10's
 * `#4c78a8` and `#f58518`, because nothing in the finish rewrote a *nominal*
 * colour scale. The ADR claims colour is total; it was total only for the two
 * forms the kit builds itself, which set their own ranges and so never
 * exercised the gap.
 *
 * Only touches encodings that have not asked for something specific, so
 * `series` and `matrix` keep the ranges they set in `decorate`. A colour that
 * carries no `field` is a constant, not a scale, and is left alone.
 */
export function paletteColourScales(node: JsonValue | undefined): void {
  if (Array.isArray(node)) {
    for (const v of node) paletteColourScales(v)
    return
  }
  if (!isJsonObject(node)) return
  for (const [k, v] of Object.entries(node)) {
    if (k === "color" && isJsonObject(v) && v.field !== undefined) {
      const base: JsonObject = isJsonObject(v.scale) ? { ...v.scale } : {}
      if (base.range === undefined) {
        // A named scheme is flint's choice of palette and the one thing that
        // outranks `config.range`, so it goes with the range that replaces it.
        delete base.scheme
        v.scale =
          v.type === "quantitative"
            ? { ...base, type: "quantize", range: [...RAMP] }
            : { ...base, range: [...SERIES_INK] }
      }
    }
    paletteColourScales(v)
  }
}

/**
 * Clamp every type size to the artifact floor.
 *
 * Applied to the **spec**, not the output, and that ordering is load-bearing:
 * Vega lays out against the size it believes it will paint, so a stylesheet
 * that merely enlarges the text afterwards leaves the labels positioned for
 * 10px and colliding at 12.
 */
export function clampType(node: JsonValue | undefined): void {
  if (Array.isArray(node)) {
    for (const v of node) clampType(v)
    return
  }
  if (!isJsonObject(node)) return
  for (const [k, v] of Object.entries(node)) {
    if (/[Ff]ontSize$/.test(k) && isJsonNumber(v))
      node[k] = Math.max(TYPE_FLOOR, v)
    else clampType(v)
  }
}

/**
 * The Vega-Lite `config` every kit chart carries.
 *
 * Everything that decides ink, weight and type lives here rather than on any
 * one chart, so a design fix is one edit instead of one per form.
 */
export function kitConfig() {
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
    /**
     * Facet headers, which have their own config block and inherit none of the
     * above. Left out, a `column`/`row` encoding draws its strip labels in
     * Vega's `#000` at 10px — so a routine that facets got its band dropped
     * for two rules at once, on a channel it is perfectly entitled to name.
     */
    header: {
      labelFont: MONO,
      titleFont: MONO,
      labelFontSize: TYPE_FLOOR,
      titleFontSize: TYPE_FLOOR,
      labelColor: PALETTE["ink-dim"],
      titleColor: PALETTE["ink-dim"],
    },
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
      ordinal: [...RAMP],
      ramp: [...RAMP],
      heatmap: [...RAMP],
      diverging: [PALETTE.blue, PALETTE.bg3, PALETTE.orange],
    },
  } satisfies JsonObject
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
function deepMerge(base: JsonObject, over: JsonObject): JsonObject {
  const out: JsonObject = { ...base }
  for (const [k, v] of Object.entries(over)) {
    const b = out[k]
    if (isJsonObject(b) && isJsonObject(v)) out[k] = deepMerge(b, v)
    // `null` is a value here, not an absence, and `??` was silently discarding
    // it: `view.stroke: null` and `background: null` are how Vega-Lite is told
    // to draw *nothing*, so a flint spec that set either kept its own. Only
    // `undefined` means "the kit is silent, keep what flint chose".
    else if (v !== undefined) out[k] = v
  }
  return out
}

/** A string that names a colour, in any notation Vega will accept. */
const COLOUR_LITERAL =
  /^(?:#[0-9a-f]{3,8}|(?:rgba?|hsla?|lab|lch|oklab|oklch)\()/i

/**
 * Drop every off-palette ink from flint's config before the kit's lands on it.
 *
 * `deepMerge` lets the kit win at the leaves it *names*, which is not the same
 * as winning outright. Vega-Lite resolves `axisX`/`axisY` **over** `axis`, and
 * flint sets `axisX.titleColor: "#666"` — so the kit's `config.axis.titleColor`
 * was correct, more general, and silently outranked. Every faceted chart came
 * back painting `#666` on its axis titles and was dropped.
 *
 * Naming `axisX` and `axisY` in `kitConfig` would fix this instance and leave
 * the next one — `axisTop`, `axisBand`, `headerColumn`, whatever a later flint
 * release reaches for. So the rule is stated once as a property instead: an
 * off-palette colour in flint's config is never something we want, at any
 * depth, under any key. Layout knowledge — `labelLimit`, `labelAngle`, the
 * facet caps — is untouched, which is the part of flint's config the kit
 * genuinely wants (ADR-0062).
 */
function stripOffPaletteInk(node: JsonObject): JsonObject {
  const out: JsonObject = {}
  for (const [k, v] of Object.entries(node)) {
    if (isJsonObject(v)) out[k] = stripOffPaletteInk(v)
    else if (
      isJsonString(v) &&
      COLOUR_LITERAL.test(v) &&
      !ALLOWED.has(v.toLowerCase())
    )
      continue
    else out[k] = v
  }
  return out
}

export function finish<T extends JsonValue>(
  spec: T,
  size: { width: number; height: number },
): T {
  clampType(spec)
  paletteColourScales(spec)
  if (isJsonObject(spec)) {
    // A form may fix its own plot rectangle by leaving `_kitSize` behind. Only
    // the matrix does, and it has to: a co-change field is read as a grid of
    // squares, and a heatmap stretched to a 780x300 box draws cells nearly
    // three times wider than they are tall, which reads as stripes rather than
    // as a field. The key is removed here so it never reaches Vega.
    const fixed = spec._kitSize
    const sized = isJsonObject(fixed)
      ? {
          width: Number(fixed.width) || size.width,
          height: Number(fixed.height) || size.height,
        }
      : size
    delete spec._kitSize
    // Flint's config first, the kit's over it: flint contributes what the kit
    // is silent about, and never the other way round. Its inks are stripped
    // beforehand and the merged result is clamped afterwards, because a
    // narrower flint key (`axisX` over `axis`) otherwise wins on both counts.
    const own = spec.config
    const config = deepMerge(
      stripOffPaletteInk(isJsonObject(own) ? own : {}),
      kitConfig(),
    )
    clampType(config)
    Object.assign(spec, {
      width: sized.width,
      height: sized.height,
      background: null,
      config,
    })
  }
  return spec
}
