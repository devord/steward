import type { CompiledChart } from "../chart/compile.ts"

/**
 * A compiled chart, placed at the tier that fits it (ADR-0062).
 *
 * The SVG arrives already rendered — `compileCharts` ran before this markup
 * existed, because Vega renders asynchronously and this tree does not. All
 * that happens here is choosing which of the two renders a frame gets.
 *
 * **Two renders, gated, rather than one scaled.** A Vega SVG carries its
 * geometry and its text in the same coordinate space, so scaling it to fit
 * scales the labels with it: below its natural width the type drops under
 * widget-standard §6's 12px floor, above it the labels balloon. `Series.tsx`
 * escapes that by having no pixel geometry at all — a unitless viewBox and
 * real HTML labels at percentage offsets — which is not available to a
 * renderer that draws its own text. So each tier gets a render built for it.
 *
 * `dangerouslySetInnerHTML` is the only way to place it, and it is safe here
 * in the way that matters: the string is Vega's own serializer output over
 * data the routine supplied, never markup the routine wrote, and
 * `conformChart` has already rejected anything carrying an external
 * reference.
 */
export function Chart({ svg, label }: { svg: CompiledChart; label?: string }) {
  return (
    <figure className="m-0 flex flex-col gap-2" aria-label={label}>
      {/* The tile render, up to the page tier. `tier-page` is 900px — the
          width at which the page render's 820px box stops being cramped. */}
      <div
        className="[&>svg]:h-auto [&>svg]:max-w-full tier-page:hidden"
        dangerouslySetInnerHTML={{ __html: svg.tile }}
      />
      <div
        className="hidden tier-page:block [&>svg]:h-auto [&>svg]:max-w-full"
        dangerouslySetInnerHTML={{ __html: svg.page }}
      />
    </figure>
  )
}
