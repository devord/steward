import type { ChartRequest, ChartSpec } from "./compile.ts"
import { matrixRequest, type MatrixSpec } from "./forms/matrix.ts"
import { seriesRequest, type SeriesSpec } from "./forms/series.ts"

/**
 * Which blocks compile to a chart, and under what key (ADR-0062).
 *
 * One walk, shared by the compiler and the renderer, because the two must
 * agree exactly: the compiler stores an SVG under a key and the renderer looks
 * it up under the same one. Deriving the key twice — once here, once from a
 * loop variable in the markup — is how they would drift, and `Document`
 * filters and re-splits its blocks before rendering them, so positional
 * indices are not even the same number on both sides.
 *
 * Keys are handed back on a `WeakMap` from the block object itself, so the
 * lookup survives every filter, partition and reorder the renderer applies.
 */

interface AnyBlock {
  kind: string
  id?: string
  spec?: unknown
}

export interface ChartKeys {
  requests: ChartRequest[]
  keyOf: WeakMap<object, string>
}

/**
 * Narrowed rather than re-shaped: `validateDoc` already rejects a malformed
 * chart spec by name and path before anything reaches here, so a second
 * defensive copy would only be a second place for the shape to be wrong.
 */
function isChartSpec(v: unknown): v is ChartSpec {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof Reflect.get(v, "data") === "object" &&
    typeof Reflect.get(v, "chart_spec") === "object"
  )
}

function isMatrixSpec(v: unknown): v is MatrixSpec {
  return (
    typeof v === "object" &&
    v !== null &&
    Array.isArray(Reflect.get(v, "labels")) &&
    Array.isArray(Reflect.get(v, "cells"))
  )
}

function isSeriesSpec(v: unknown): v is SeriesSpec {
  return (
    typeof v === "object" &&
    v !== null &&
    Array.isArray(Reflect.get(v, "lines")) &&
    typeof Reflect.get(v, "from") === "string" &&
    typeof Reflect.get(v, "to") === "string"
  )
}

export function chartRequests(blocks: readonly AnyBlock[]): ChartKeys {
  const requests: ChartRequest[] = []
  const keyOf = new WeakMap<object, string>()

  blocks.forEach((b, i) => {
    if (typeof b !== "object" || b === null) return

    if (b.kind === "chart") {
      // Validated upstream, and a chart block without one has nothing to be
      // looked up by — skip rather than mint a key the author cannot predict.
      if (typeof b.id !== "string" || b.id === "") return
      if (!isChartSpec(b.spec)) return
      keyOf.set(b, b.id)
      requests.push({ id: b.id, spec: b.spec })
      return
    }

    if (b.kind === "matrix" && isMatrixSpec(b.spec)) {
      const key = typeof b.id === "string" && b.id !== "" ? b.id : `matrix-${i}`
      keyOf.set(b, key)
      requests.push(matrixRequest(key, b.spec))
      return
    }

    if (b.kind === "series" && isSeriesSpec(b.spec)) {
      // `id` is optional on series and matrix blocks: every routine publishing
      // one predates ADR-0062, and requiring it would have broken them all on
      // the next run for a field they have no reason to know about. The
      // positional fallback is stable within a run, which is all a key has to
      // be.
      const key = typeof b.id === "string" && b.id !== "" ? b.id : `series-${i}`
      keyOf.set(b, key)
      requests.push(seriesRequest(key, b.spec))
    }
  })

  return { requests, keyOf }
}
