import type { Block } from "../render.tsx"
import type { ChartRequest, ChartSpec } from "./compile.ts"
import { matrixRequest, type MatrixSpec } from "./forms/matrix.ts"
import { seriesRequest, type SeriesSpec } from "./forms/series.ts"
import { isJsonString, isRecord } from "../json.ts"

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

export interface ChartKeys {
  requests: ChartRequest[]
  keyOf: WeakMap<object, string>
}

/**
 * Confirmed rather than re-shaped: `validateDoc` already rejects a malformed
 * chart spec by name and path before anything reaches here, so a second
 * defensive copy would only be a second place for the shape to be wrong.
 *
 * These check the handful of fields the compiler dereferences, and nothing
 * else. `Block` supplies the type — the walk discriminates on `kind`, so each
 * spec arrives already narrowed — and these only confirm a document told the
 * truth about it.
 */
/**
 * Presence, deliberately — not shape.
 *
 * A spec whose `data` is present but wrong (`null`, a bare row array, a
 * string) must still become a *request*, because `compileCharts` catches what
 * flint throws and records it as a named failure that travels on the
 * provenance line (ADR-0062). Rejecting it here instead would drop the band
 * with nothing anywhere saying why. Only a field the compiler dereferences
 * before its own try/catch is worth refusing.
 */
function chartSpecComplete(v: ChartSpec | undefined): boolean {
  return isRecord(v) && v.data !== undefined && v.chart_spec !== undefined
}

function matrixSpecComplete(v: MatrixSpec | undefined): boolean {
  return isRecord(v) && Array.isArray(v.labels) && Array.isArray(v.cells)
}

function seriesSpecComplete(v: SeriesSpec | undefined): boolean {
  return (
    isRecord(v) &&
    Array.isArray(v.lines) &&
    isJsonString(v.from) &&
    isJsonString(v.to)
  )
}

export function chartRequests(blocks: readonly Block[]): ChartKeys {
  const requests: ChartRequest[] = []
  const keyOf = new WeakMap<object, string>()

  blocks.forEach((b, i) => {
    // `Block` is a typed union, but the array is built from a document that
    // was never validated element by element — a hole or a primitive both
    // reach here, and neither has a `kind` to read.
    if (!isRecord(b)) return

    if (b.kind === "chart") {
      // Validated upstream, and a chart block without one has nothing to be
      // looked up by — skip rather than mint a key the author cannot predict.
      if (!isJsonString(b.id) || b.id === "") return
      if (!chartSpecComplete(b.spec)) return
      keyOf.set(b, b.id)
      requests.push({ id: b.id, spec: b.spec })
      return
    }

    if (b.kind === "matrix" && matrixSpecComplete(b.spec)) {
      const key = isJsonString(b.id) && b.id !== "" ? b.id : `matrix-${i}`
      keyOf.set(b, key)
      requests.push(matrixRequest(key, b.spec))
      return
    }

    if (b.kind === "series" && seriesSpecComplete(b.spec)) {
      // `id` is optional on series and matrix blocks: every routine publishing
      // one predates ADR-0062, and requiring it would have broken them all on
      // the next run for a field they have no reason to know about. The
      // positional fallback is stable within a run, which is all a key has to
      // be.
      const key = isJsonString(b.id) && b.id !== "" ? b.id : `series-${i}`
      keyOf.set(b, key)
      requests.push(seriesRequest(key, b.spec))
    }
  })

  return { requests, keyOf }
}
