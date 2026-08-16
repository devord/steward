import type * as vega from "vega"

import { isJsonNumber } from "../json.ts"

/**
 * Exact text measurement for a headless Vega render (ADR-0062).
 *
 * Vega measures text through a canvas context. Without one it falls back to
 * `estimateWidth`, a per-character approximation, and an approximate width is
 * a label in the wrong place — axis ticks that collide, legends that clip.
 *
 * `flint-chart-mcp` solves this by bundling Liberation Sans and
 * `@napi-rs/canvas`. We cannot: a native binary does not go through esbuild,
 * and a scheduled cloud run cannot install one (`build.mjs` — the committed
 * kit outputs exist precisely to keep such a run install-free).
 *
 * We also do not need to. `vega-scenegraph/src/util/text.js` exposes
 * `textMetrics` as a public override, and says so in its own source: "User
 * defined textMetrics.width function in use (e.g. vl-convert)". The kit's
 * chrome speaks mono (ADR-0048), and in a monospace face every glyph shares
 * one advance — so `chars × advance × fontSize` is not an estimate that
 * happens to be close, it is the width. `Series.tsx` already leans on the same
 * fact ("`ch` in a mono column *is* the advance").
 */

/**
 * Advance ratio of the mono stack, as a fraction of the em.
 *
 * 0.6 for the whole `ui-monospace` family — Geist Mono, SF Mono, Menlo and
 * DejaVu Sans Mono all ship 600/1000 units. A face outside that would measure
 * wrong, which is why `conform.ts` rejects a chart that sets a non-mono
 * family rather than trusting this to hold.
 */
export const MONO_ADVANCE = 0.6

interface TextItem {
  fontSize?: number
}

/**
 * What vega hands the measurer: a label, or a number it will render as one.
 * `null` and `undefined` are both "nothing to draw", and measure as empty.
 */
type Measurable = string | number | null | undefined

/**
 * Fitted to vega's `textMetrics.width(item, text)` signature.
 *
 * `fontSize` is typed but not enforced: the item crosses from
 * `assembleVegaLite`, which is declared `any`, and `clampType` only touches
 * sizes that are *already* numbers. A `fontSize: "1.2em"` that reached the
 * arithmetic would return NaN — and because `useMonoMetrics` patches vega's
 * **global** measurer, that NaN would lay out every later chart in the
 * process too. So the size is checked, not merely defaulted.
 */
export function monoWidth(item: TextItem, text: Measurable): number {
  const size = isJsonNumber(item?.fontSize) ? item.fontSize : 12
  return String(text ?? "").length * size * MONO_ADVANCE
}

/**
 * The one corner of vega's namespace this module touches.
 *
 * `textMetrics` is public API that vega's shipped `.d.ts` omits, so there is
 * nothing to import and nothing to conflict with — declaring the shape here is
 * what the reflective read was standing in for. A `declare module`
 * augmentation would fix it inside this package and *not* in `apps/web`, which
 * typechecks these sources through an import and never sees the local
 * declaration: a green build here and a red one one directory over.
 */
interface VegaTextMetrics {
  width: (item: TextItem, text: Measurable) => number
}

/** Vega's own namespace, plus the member its shipped types leave out. */
type VegaNamespace = typeof vega & { textMetrics?: VegaTextMetrics }

/**
 * Point vega's measurement at the mono advance. Idempotent, so a renderer that
 * compiles several charts pays for it once.
 *
 * Takes the whole namespace rather than the binding, because there is no
 * binding to import — see `VegaNamespace` above for why the shape is declared
 * here instead.
 */
export function useMonoMetrics(vega: VegaNamespace): void {
  if (vega.textMetrics) vega.textMetrics.width = monoWidth
}
