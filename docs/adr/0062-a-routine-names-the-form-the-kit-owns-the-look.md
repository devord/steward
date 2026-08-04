# A routine names the form, the kit owns the look

**Status**: proposed — gated on the spike in "First cut" below.

ADR-0050 split artifact authoring in two: a routine emits _content_, and the
kit decides every visual consequence. `Series.tsx` states the reason in its own
docstring — the kit owns "hue, weight, dash, marker, label — so a chart cannot
drift into four competing identities one routine at a time."

That split gave the board four chart forms, total: `series` (a burn-up),
`throughput` (per-person columns), `matrix` (a co-change heatmap) and
`sparkline`. Seventeen routines across thirteen templates share them. A form
the kit does not have is not a form a routine can ask for; it is an app-repo
PR and a new React component. `module-entropy` wants a churn × complexity
quadrant scatter — Tornhill's hotspot plot, which its own commit message cites
— and cannot have one, so it ships a ranked list with a prose paragraph per row
instead.

We are raising that ceiling with `flint-chart` (Microsoft, MIT, v0.4.1), a
compiler from `{data, semantic_types, chart_spec}` to a native Vega-Lite spec.
A routine names a `chartType` from flint's catalogue of 38+ and supplies its
data; the kit compiles that to inline SVG at publish.

**The routine now chooses the form. The kit still owns the look — and owns it
by construction rather than by instruction, which is the only reason this is
safe to do.**

## What had to be made total

An unrestricted `chartType` is only safe if a wrong choice cannot produce a
wrong-looking artifact. Three of the four risks collapse into deterministic
transforms; the fourth does not, and is handled as degradation rather than
prevention.

**Colour — total.** `frameArtifactHtml` appends `artifactThemeStyle(name)` last
into every framed artifact (`apps/web/app/lib/theme.ts:1237`), so a file
published months ago repaints in whatever theme the viewer chose — gruvbox,
flexoki, light, dark. A chart carrying baked hexes would be the one region on
the page that ignores that, and the one region no future design fix reaches,
which contradicts ADR-0050's whole injection premise.

So the emitted Vega-Lite JSON is walked before compilation and every
colour-valued leaf is rewritten to a kit token. Colour enters a Vega spec by
exactly two routes — literals (hex, `rgb()`, CSS names) and scheme references
(`"scheme": "blues"`) — and both are recognisable in a tree walk, which is what
makes the transform total rather than a list of properties to keep up with.
Flint's derived palette is discarded wholesale. That is a real loss of one of
the things flint sells, and it is not negotiable: the board reads as one
product or it does not.

**Type size — total.** Widget-standard §6 sets a 12px floor. Flint derives axis
and legend sizes and will emit 10px and 11px. The same walk clamps every
`fontSize` leaf.

**Text measurement — exact, and better than flint's own.** Vega measures text
with a canvas context; without one it falls back to a per-character estimate,
and estimates put labels in the wrong place. `flint-chart-mcp` solves this by
bundling Liberation Sans and `@napi-rs/canvas` — a native binary, which cannot
be bundled by esbuild and cannot be installed in a scheduled cloud run
(`packages/artifact-kit/build.mjs`: the committed outputs exist to keep such a
run "install-free… that environment cannot be assumed to reach npm").

We do not need it. `vega-scenegraph/src/util/text.js` exposes `textMetrics` as
a public override, with precedent in the source itself: _"User defined
textMetrics.width function in use (e.g. vl-convert)"_. The kit's chrome speaks
mono (ADR-0048), and for a monospace face `chars × advance × fontSize` is not
an estimate, it is the answer — `Series.tsx` already leans on this ("`ch` in a
mono column _is_ the advance"). A three-line override gives exact measurement
in bare node with no canvas and no native dependency.

**Layout fit — not total, and handled as degradation.** Forty categories in a
fixed box is unreadable at any configuration. This is data-dependent, discovered
at 08:00 on a cron, and no spec transform prevents it. A chart block states a
cardinality ceiling; a run whose data exceeds it drops the block and says so in
provenance, which is what `filled()` already does for every other empty block
and what `cli.mjs` already reasons about ("publishing nothing is the worse
outcome" for a scheduled job).

## The allowlist is derived, not maintained

Because colour and type are total, conformance moves off the publish path. The
kit's build renders every flint `chartType` and asserts the emitted SVG carries
only sentinel colours, only ≥12px type, only the kit's font stack, and no
`href`/`url(`/`<image>` (ADR-0002's no-network rule). A type that fails does not
ship.

That test _is_ the allowlist. Hand-maintaining one would go stale against a
dependency on a monthly release cadence; a derived one cannot.

## What it costs

`flint-chart` has zero runtime dependencies (31.7 MB unpacked is templates and
knowledge, not code). The weight is the renderer: `vega` 6.3.1 at 3.5 MB across
27 transitive packages, plus `vega-lite` 6.4.3 at 5.6 MB. Bundled and minified,
`render.mjs` goes from **284 KB to roughly 2.5 MB** — committed under
`.claude/skills/widget-artifact/kit/` and `cpSync`'d into the published CLI
package, because that is how it travels to an install-free run.

The artifact itself carries only SVG. No runtime reaches the published file,
and ADR-0002 and the raw-readability floor are untouched.

**Charts stop filling their frame.** `page-only` is `:root:not([data-steward-tile])`
(`tiers/tiers.css:64`) — not a width tier, so a page-only chart spans a
phone-width raw open to a 2560px `wide` board. `Series.tsx` survives that by
having no pixel geometry at all: a unitless 1000×400 viewBox stretched with
`preserveAspectRatio="none"`, every label real 12px HTML at a percentage offset.
A Vega SVG has one geometry and its text lives inside it, so a flint chart
renders at a fixed size, centred, max-width capped. On a wide board it will sit
in whitespace where today's stretches. **This is the largest concession and the
thing the spike exists to judge.**

## What this is not

It is not a smaller kit. That was the original framing and it does not survive
the numbers. `Series.tsx` (391), `CouplingMatrix.tsx` (165) and `Sparkline.tsx`
(57) come out — 613 lines. The normaliser, the `textMetrics` override, the
theme layer and the conformance harness go in, at 300–500. `Throughput` stays:
its 421-line behaviour layer (toggles, scrub) has no flint equivalent and would
have to be rewritten against Vega's scenegraph to migrate, which is a worse
trade than leaving it alone.

The kit gets more capable at about the same source size, with a bundle nine
times larger. That is the trade.

## First cut

Rebuild the burn-up through flint behind the existing `SeriesBlock` schema, so
it is diffable against what it replaces. Two changes ride with it:

- **The legend replaces the gutter.** Today's burn-up prints the same four
  strings twice — direct end-labels (`Series.tsx:312-326`) and a legend
  figcaption (`Series.tsx:362-387`) — and because end-labels are nudged apart
  by a 9% minimum gap, they drift off the lines they name. The figcaption's
  defence of redundancy is right ("three channels, so the chart survives
  greyscale and full colour-vision deficiency") and is fully satisfied by one
  legend row carrying swatch, dash and word. The gutter goes; the plot gets its
  width back, which partly pays for the fixed-size cap. The hero keeps its end
  dot as the only direct mark.
- **`module-entropy` is not waiting on this.** Its regression is a template
  change (`edfecb9` replaced scored columns with a chip and a prose paragraph),
  fixed on its own. The quadrant scatter it wants is a flint form for later.

## Rejected

- **Adopting flint's spec vocabulary without its runtime.** The kit would speak
  `{data, semantic_types, chart_spec}` and render the forms it already has.
  Zero bundle cost and a good agent-facing interface — but a new form still
  needs a new React component, which is the ceiling this exists to raise.
- **An allowlist of chartTypes, hand-maintained.** Rejected in favour of the
  derived one above. A hand-written list is a second thing to remember, and
  ADR-0050's own history is a catalogue of what happens to those.
- **Baking the theme at publish.** Simplest by far, and it breaks the injection
  seam for exactly the block being added.
- **Shipping Vega to the browser**, either inlined per artifact (300 KB–1 MB
  per file on the artifacts branch, forever) or injected by the board like
  `throughput.js`. The injected form fails ADR-0061's stated floor — "the
  static file never folds" — because an artifact opened raw off the artifacts
  branch would show a blank box where the chart is.
- **One render per breakpoint, CSS-gated.** Would preserve true
  responsiveness. Multiplies artifact bytes and Vega render time by three on
  every run, to restore a property only charts lose. Available later for a
  single chart that genuinely needs to fill the frame.
- **Uniform scaling of one SVG.** Renders 9px axis labels at the narrow end and
  38px at the wide end. Fails widget-standard §6 outright.
