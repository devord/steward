import { PALETTE } from "../../tokens/palette.ts"
import type { ChartRequest, Decorator } from "../compile.ts"
import { RAMP } from "../finish.ts"
import { isJsonObject } from "../../json.ts"

/**
 * The co-change field, as a flint Heatmap with the kit's finish (ADR-0062,
 * amending ADR-0047's rendering while keeping every claim it made).
 *
 * Replaces `CouplingMatrix.tsx`. The block's schema is untouched — a routine
 * still emits `labels`, triangle `cells` and optional `marks`.
 *
 * The rules ADR-0047 set are preserved here rather than re-argued, because
 * they are about what the field *says*:
 *
 * - **Sequential, one hue, light to dark.** Magnitude is the only thing
 *   encoded, so it takes one ramp — never a rainbow, and never a categorical
 *   set, which would claim each pair is a different kind of thing rather than
 *   a different amount of one.
 * - **The diagonal is blank, not zero.** A module co-changes with itself on
 *   every commit; drawing that puts the darkest cells on the one axis carrying
 *   no information and sets the scale against a number that means nothing.
 * - **Cells are mirrored**, so a reader can enter from either axis.
 */

export interface MatrixSpec {
  /** Row and column labels — the same set, in the same order. */
  labels: string[]
  /** Upper- or lower-triangle cells; both halves are drawn. */
  cells: { a: number; b: number; value: number }[]
  /** Pairs worth naming, drawn with a ring rather than a hotter fill. */
  marks?: { a: number; b: number; label: string }[]
}

interface Cell {
  row: string
  col: string
  value: number
  marked: number
}

/**
 * Both triangles, from whichever one the routine sent.
 *
 * Filtered to labels that exist: `validateDoc` rejects an out-of-range index,
 * but this also runs on the preview path, and a cell addressing nothing would
 * otherwise become a row keyed `undefined` that Vega renders as a real column.
 */
function cells(spec: MatrixSpec): Cell[] {
  const marked = new Set(
    (spec.marks ?? []).map(
      (m) => `${Math.min(m.a, m.b)}:${Math.max(m.a, m.b)}`,
    ),
  )
  const out: Cell[] = []
  for (const c of spec.cells) {
    const a = spec.labels[c.a]
    const b = spec.labels[c.b]
    if (a === undefined || b === undefined || c.a === c.b) continue
    // Same reason as the index guard above, one field over: a `NaN` or an
    // `Infinity` lands outside every `quantize` band, so Vega paints it in a
    // colour the token set does not contain and conformance drops the whole
    // field for one bad cell.
    if (!Number.isFinite(c.value)) continue
    const ring = marked.has(`${Math.min(c.a, c.b)}:${Math.max(c.a, c.b)}`)
      ? 1
      : 0
    out.push({ row: a, col: b, value: c.value, marked: ring })
    out.push({ row: b, col: a, value: c.value, marked: ring })
  }
  return out
}

function decorate(spec: MatrixSpec): Decorator {
  return (assembled, ctx) => {
    const labels = spec.labels
    // Names on the columns cost width the field does not have; the row axis
    // carries them, and a column is read by dropping down from its row twin.
    // This is ADR-0047's numbering problem solved by ordering instead: both
    // axes list the same set in the same order, so column *n* is row *n*.
    const short = ctx.tier === "narrow"
    const axis = (withLabels: boolean) => ({
      title: null,
      labels: withLabels,
      ticks: false,
      domain: false,
      grid: false,
      labelLimit: short ? 60 : 140,
    })

    // Square cells, because a co-change field is read as a grid rather than as
    // rows: the eye compares a cell against its neighbours in both directions,
    // and stretched cells make the horizontal comparison look stronger than
    // the vertical one for no reason in the data. Derived from the width the
    // fit loop is currently trying, so shrinking to budget still converges.
    const n = labels.length || 1
    const cell = Math.max(10, Math.min(44, Math.floor(ctx.width / n)))

    // Flint's own top level, kept for whatever it set that the layers below do
    // not replace. A non-object is nothing to carry forward.
    const base = isJsonObject(assembled) ? assembled : {}

    return {
      ...base,
      _kitSize: { width: cell * n, height: cell * n },
      mark: undefined,
      encoding: undefined,
      layer: [
        {
          mark: { type: "rect", stroke: PALETTE.bg, strokeWidth: 1 },
          encoding: {
            x: {
              field: "col",
              type: "nominal",
              sort: labels,
              axis: axis(false),
            },
            y: {
              field: "row",
              type: "nominal",
              sort: labels,
              axis: axis(true),
            },
            color: {
              field: "value",
              type: "quantitative",
              // Quantized, not interpolated: a continuous scale emits computed
              // colours that are in no palette, so the theme override cannot
              // reach them and conformance drops the chart. Bands also read
              // better than a gradient nobody can measure by eye.
              scale: { type: "quantize", range: [...RAMP] },
              legend: null,
            },
          },
        },
        // A named pair gets a ring, not a hotter colour: the fill already
        // spends itself on magnitude, and marking significance with more of
        // the same fill makes two claims in one channel.
        {
          transform: [{ filter: "datum.marked === 1" }],
          // `fill: null`, not `filled: false`. `filled` only decides which
          // channel the *colour* encoding lands on; it does not remove the
          // fill. Measured: this layer came out painting solid #fe8019 and
          // #a89984 rectangles straight over the cells they were meant to
          // outline — which is the "two claims in one channel" failure
          // ADR-0047 warns about, wearing the comment that forbids it.
          mark: {
            type: "rect",
            fill: null,
            stroke: PALETTE.ink,
            strokeWidth: 2,
          },
          encoding: {
            x: {
              field: "col",
              type: "nominal",
              sort: labels,
              axis: axis(false),
            },
            y: {
              field: "row",
              type: "nominal",
              sort: labels,
              axis: axis(true),
            },
          },
        },
      ],
    }
  }
}

/** Build the compile request for one `matrix` block. */
export function matrixRequest(id: string, spec: MatrixSpec): ChartRequest {
  return {
    id,
    spec: {
      data: { values: cells(spec) },
      semantic_types: {
        row: "Category",
        col: "Category",
        value: "Quantity",
        marked: "Quantity",
      },
      chart_spec: {
        chartType: "Heatmap",
        encodings: { x: "col", y: "row", color: "value" },
      },
      // Both triangles of an n×n field, so the row count is n²-ish. The cap is
      // on cells rather than modules, and 24 labels is already past what any
      // axis reads at these widths.
      maxRows: 600,
    },
    decorate: decorate(spec),
  }
}

/**
 * Four is the floor for a field. Below it the squares do not read as one —
 * they read as scattered dots, which is ADR-0047's own threshold.
 */
export function matrixHasField(spec: MatrixSpec): boolean {
  return spec.labels.length >= 4
}
