import { PALETTE } from "../../tokens/palette.ts"
import type { ChartRequest, ChartTier, Decorator } from "../compile.ts"
import { isJsonObject } from "../../json.ts"

/**
 * The burn-up, as a flint form with the kit's finish (ADR-0062).
 *
 * Replaces `Series.tsx`. The block's schema is untouched — a routine still
 * emits `from`/`to`/`today`/`max`/`lines` and says nothing about how any of it
 * draws — so nothing in a data repo has to change.
 *
 * What flint contributes is the plot: scales, ticks, layout, the derivation
 * from semantic types. What the kit contributes is everything that made the
 * old component a burn-up rather than a line chart — the emphasis palette, the
 * now-marker, the hero's end dot, a date axis of three labels rather than
 * eleven, and one legend instead of the two label sets the old one drew.
 */

/** What a line *is*, which is all a routine gets to say. */
export type SeriesRole = "hero" | "ceiling" | "target" | "ghost"

export interface SeriesLine {
  id: string
  /** Legend entry — "16 landed", "needs 11.2/wk". */
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
  /** y ceiling. Defaults to the largest observed point. */
  max?: number
  lines: SeriesLine[]
}

/**
 * The ghost role: the hero's hue at lower weight, not a fourth identity.
 *
 * `Series.tsx` mixed this in CSS — `color-mix(orange 55%, bg1)` — which a
 * stylesheet can do and a Vega spec cannot, because the colour has to be a
 * literal before the chart is laid out. The first port hard-coded the mix
 * (`#93521a`) and the kit's own conformance gate rejected it on the first real
 * artifact, correctly: a colour outside the token set is a colour the board's
 * theme override cannot re-point, so a flexoki reader would have seen one
 * orange line that stayed gruvbox.
 *
 * `orange-deep` is the token that says the same thing. `ink-faint` remains the
 * wrong answer for the reason it always was — against the ceiling's `ink-dim`
 * it scores an OKLab ΔE of 7.1 unsimulated, far under the normal-vision floor
 * of 15.
 */
const GHOST = PALETTE["orange-deep"]

/** How a role draws: its ink, its dash pattern, and whether it steps. */
interface RoleInk {
  ink: string
  dash: number[]
  step?: boolean
}

const ROLE = {
  /** The series that is the point. The chart's one loud line. */
  hero: { ink: PALETTE.orange, dash: [1, 0] },
  /**
   * A moving ceiling — and it **steps**, because scope does. A sloped ceiling
   * says the target grew a little every day; the truth is that somebody added
   * four tickets on a Tuesday, and the step is where they did it.
   */
  ceiling: { ink: PALETTE["ink-dim"], dash: [1, 0], step: true },
  /**
   * A target slope. Dashed because it is not-yet-realised, which is the
   * standing convention — and not to be "fixed" into a solid line: the rule
   * that forbids dashes is about *gridlines and axes*, and the two get
   * confused.
   */
  target: { ink: PALETTE.ink, dash: [6, 4] },
  /** Shown, never counted — the hero drawn at its optimistic ceiling. */
  ghost: { ink: GHOST, dash: [2, 3] },
} satisfies Record<SeriesRole, RoleInk>

/**
 * A line's role, defaulting to `ghost` for anything unrecognised.
 *
 * `role` arrives from a routine's JSON, and `validateDoc` does not constrain
 * it to the four names — so a typo, or a role added to a data repo's template
 * before it exists here, would otherwise dereference `undefined` and throw.
 * `compileCharts` would catch that and drop the band, but losing a whole
 * burn-up over one misspelled word is a poor trade when the honest fallback is
 * "draw it as context".
 */
const ROLES: ReadonlyMap<string, RoleInk> = new Map(Object.entries(ROLE))

function roleOf(role: string): RoleInk {
  // A Map lookup rather than an index read: `ROLE` is exhaustive over the four
  // names, so indexing it with an arbitrary string needs a type assertion, and
  // the repo forbids those outside tests.
  return ROLES.get(role) ?? ROLE.ghost
}

/**
 * Midday UTC.
 *
 * Vega's temporal scales are local-time by default, so a UTC-midnight point
 * renders a day early anywhere west of Greenwich — a `2026-06-25` datum came
 * out as "Jun 24" under UTC-3. A routine's runner and its reader are rarely in
 * the same zone, and `Series.tsx` parsed UTC deliberately for the same reason.
 */
const at = (iso: string) => `${iso.slice(0, 10)}T12:00:00Z`

/**
 * The y ceiling: `max` where a routine stated one, otherwise the largest
 * point that is not a target.
 *
 * A target slope is **shown, never counted**. It is a projection to a future
 * commitment, so it routinely ends far above everything real — and letting it
 * set the scale squashes every actual line into the bottom third of the plot
 * to make room for a number nobody has hit yet.
 */
function ceilingOf(spec: SeriesSpec): number | undefined {
  if (spec.max !== undefined) return spec.max
  const observed = spec.lines
    .filter((l) => l.role !== "target")
    .flatMap((l) => l.points.map((p) => p.y))
  return observed.length ? Math.max(...observed) : undefined
}

/** Rows in the long format flint wants: one per point, tagged by line. */
function rows(spec: SeriesSpec) {
  return spec.lines.flatMap((l) =>
    l.points.map((p) => ({ date: at(p.x), count: p.y, series: l.label })),
  )
}

/**
 * One legend, under the plot.
 *
 * Stacked on a narrow page, and that is the fit loop's blind spot rather than
 * a preference: shrinking the plot cannot shrink a legend, so three entries on
 * one row held the SVG at 315px against a 300px column however small the plot
 * got. Height is cheap here; width is the whole constraint.
 */
function legend(tier: ChartTier) {
  return {
    title: null,
    orient: "bottom",
    direction: tier === "narrow" ? "vertical" : "horizontal",
    offset: 8,
  }
}

function decorate(spec: SeriesSpec): Decorator {
  return (assembled, ctx) => {
    const order = spec.lines.map((l) => l.label)
    const hero = spec.lines.find((l) => l.role === "hero")
    const scale = {
      type: "utc",
      domain: [at(spec.from), at(spec.to)],
    }
    const x = {
      field: "date",
      type: "temporal",
      scale,
      axis: {
        title: null,
        // Three labels, not eleven: the window's ends and now. Flint derives a
        // dense mixed-format time axis — "Sat 27, July, Jul 05, Thu 09…" —
        // which is correct and unreadable. These are the only dates a burn-up
        // is ever read against.
        values: [
          at(spec.from),
          ...(spec.today ? [at(spec.today)] : []),
          at(spec.to),
        ],
        format: ctx.tier === "narrow" ? "%m-%d" : "%Y-%m-%d",
        labelAngle: 0,
        labelFlush: true,
        grid: false,
      },
    }
    // A domain only when there is a ceiling to state. `ceilingOf` is undefined
    // for a spec with no countable points — every line a target, or no points
    // at all — and `domain: [0, undefined]` is not an open-ended scale to Vega,
    // it is a malformed one. Omitting the key lets Vega derive the extent,
    // which is what "otherwise the largest point" meant all along.
    const ceiling = ceilingOf(spec)
    const yScale = { nice: spec.max === undefined }
    const yScaled =
      ceiling === undefined ? yScale : { ...yScale, domain: [0, ceiling] }
    const y = {
      field: "count",
      type: "quantitative",
      scale: yScaled,
      axis: {
        title: null,
        tickCount: 4,
        grid: true,
        domain: false,
        ticks: false,
      },
    }

    // Flint's own top level, kept for whatever it set that the layers below do
    // not replace. A non-object is nothing to carry forward.
    const base = isJsonObject(assembled) ? assembled : {}

    return {
      ...base,
      mark: undefined,
      encoding: undefined,
      layer: [
        // Two line layers, split on interpolation, because `interpolate` is a
        // property of the *mark* and the two kinds of line disagree about it.
        // Both share one colour scale over the full domain, so the legend
        // stays a single row listing every series in the order it was given.
        ...[false, true].map((stepped) => ({
          transform: [
            {
              filter: {
                field: "series",
                oneOf: spec.lines
                  .filter((l) => Boolean(roleOf(l.role).step) === stepped)
                  .map((l) => l.label),
              },
            },
          ],
          mark: stepped
            ? { type: "line", interpolate: "step-after" }
            : { type: "line" },
          encoding: {
            x,
            y,
            color: {
              field: "series",
              type: "nominal",
              scale: {
                domain: order,
                range: spec.lines.map((l) => roleOf(l.role).ink),
              },
              legend: legend(ctx.tier),
            },
            strokeDash: {
              field: "series",
              type: "nominal",
              scale: {
                domain: order,
                range: spec.lines.map((l) => roleOf(l.role).dash),
              },
              // The *same* legend as colour, not `null`. Two channels over one
              // field with one domain merge into a single legend, so each entry
              // shows its hue and its dash together — which is the point of
              // encoding the role twice. Suppressing this one instead left
              // Vega-Lite resolving `disable: false` against `true` and warning
              // on every compile.
              legend: legend(ctx.tier),
            },
          },
        })),
        // The now-marker, and the hero's end dot. Both are plain layers — no
        // annotation API needed, which is what makes them affordable.
        //
        // `axis` is *omitted* on these rather than set to null: a layered spec
        // resolves its axes across every layer, and one explicit null
        // suppresses the shared one. Setting it cost both axes outright.
        ...(spec.today
          ? [
              {
                data: { values: [{ date: at(spec.today) }] },
                mark: { type: "rule", strokeDash: [4, 4] },
                encoding: { x: { field: "date", type: "temporal", scale } },
              },
            ]
          : []),
        ...(hero && hero.points.length
          ? [
              {
                data: {
                  values: [
                    {
                      date: at(hero.points[hero.points.length - 1].x),
                      count: hero.points[hero.points.length - 1].y,
                    },
                  ],
                },
                mark: { type: "point", filled: true, size: 70 },
                encoding: {
                  x: { field: "date", type: "temporal", scale },
                  y: { field: "count", type: "quantitative", scale: y.scale },
                },
              },
            ]
          : []),
      ],
    }
  }
}

/** Build the compile request for one `series` block. */
export function seriesRequest(id: string, spec: SeriesSpec): ChartRequest {
  return {
    id,
    spec: {
      data: { values: rows(spec) },
      semantic_types: {
        date: "Date",
        count: "Quantity",
        series: "Category",
      },
      chart_spec: {
        chartType: "Line Chart",
        encodings: { x: "date", y: "count", color: "series" },
      },
      // A burn-up is a handful of lines over a window of weeks. Well past
      // anything real, and low enough that a runaway series set is caught.
      maxRows: 2000,
    },
    decorate: decorate(spec),
  }
}

/** Two points is the floor for a line; one is a dot claiming a trend. */
export function seriesIsPlottable(spec: SeriesSpec): boolean {
  return spec.lines.some((l) => l.points.length > 1)
}
