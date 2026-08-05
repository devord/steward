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
    <figure
      className="m-0 flex flex-col gap-2"
      aria-label={label}
      // Marks the subtree as *generated*, for the publish validator.
      // Everything below is Vega's serializer output, and the classes it
      // stamps — `role-mark`, `mark-line`, `role-axis-grid` — are structural
      // markers rather than styling hooks: they are supposed to carry no rule.
      // Without this the class-coverage check reports every one as an unstyled
      // class and refuses to publish the artifact, which is what happened to
      // `corza-progress` and is why its burn-up is missing from the board.
      data-kit-chart=""
    >
      {/* Cut at the kit's own breakpoints (`tiers.css`), each render sized to
          fit the narrowest frame its gate admits — so `max-w-full` is a guard
          that never fires rather than the layout mechanism. Two tiers were not
          enough: a page-only band still renders on a raw page at any width, and
          a 464px render met a 340px page's 300px column and got scaled to
          8.8px type. */}
      <div
        className="tier-detail:hidden [&>svg]:h-auto [&>svg]:max-w-full"
        dangerouslySetInnerHTML={{ __html: svg.narrow }}
      />
      <div
        className="hidden tier-detail:block tier-page:hidden [&>svg]:h-auto [&>svg]:max-w-full"
        dangerouslySetInnerHTML={{ __html: svg.detail }}
      />
      <div
        className="hidden tier-page:block tier-wide:hidden [&>svg]:h-auto [&>svg]:max-w-full"
        dangerouslySetInnerHTML={{ __html: svg.page }}
      />
      <div
        className="hidden tier-wide:block [&>svg]:h-auto [&>svg]:max-w-full"
        dangerouslySetInnerHTML={{ __html: svg.wide }}
      />
    </figure>
  )
}
