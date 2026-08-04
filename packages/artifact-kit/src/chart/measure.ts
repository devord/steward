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

/** Fitted to vega's `textMetrics.width(item, text)` signature. */
export function monoWidth(item: TextItem, text: unknown): number {
  const size = typeof item?.fontSize === "number" ? item.fontSize : 12
  return String(text ?? "").length * size * MONO_ADVANCE
}

/**
 * Point vega's measurement at the mono advance. Idempotent, so a renderer that
 * compiles several charts pays for it once.
 *
 * Takes the whole `vega` namespace and reaches for `textMetrics` reflectively,
 * rather than importing the binding. That is not indirection for its own sake:
 * `textMetrics` is public API that vega's shipped `.d.ts` omits, so a named
 * import fails to typecheck. A `declare module` augmentation fixes it inside
 * this package and *not* in `apps/web`, which typechecks these sources through
 * an import and never sees the local declaration — so the augmentation was a
 * green build here and a red one one directory over. `Reflect.get` is typed
 * `any` and needs neither.
 */
export function useMonoMetrics(vega: object): void {
  const metrics: unknown = Reflect.get(vega, "textMetrics")
  if (typeof metrics === "object" && metrics !== null)
    Reflect.set(metrics, "width", monoWidth)
}
