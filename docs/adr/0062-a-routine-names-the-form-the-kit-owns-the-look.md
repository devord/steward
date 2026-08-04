# A routine names the form, the kit owns the look

**Status**: accepted. The burn-up spike ran; "What the spike settled" records
what it changed.

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

So colour is asserted on the **emitted SVG**, not on the spec. This is the one
place the spike overruled the design: colour enters at three stages, not one.
Flint's own output carried a single colour reference (`scheme: "tableau10"`);
the literals appeared during `vl.compile`; and `#ddd`, `#888` and `#000` came
from Vega's renderer defaults, which are in neither spec. A pre-compilation
walk would have caught one of seven.

The kit therefore sets its palette explicitly through `config` and the colour
scale's `range`, then asserts on the rendered file that no colour outside the
token set survived. Flint's derived palette is discarded wholesale. That is a
real loss of one of the things flint sells, and it is not negotiable: the board
reads as one product or it does not.

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
A Vega SVG has one geometry and its text lives inside it.

A chart band therefore emits **two renders, CSS-gated** — one sized for the
tile, one for the page. See "What the spike settled": the fixed-and-capped
alternative this ADR originally chose does not survive contact.

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

## What the spike settled

The burn-up was rebuilt through flint and rendered beside `Series.tsx`. Every
technical risk cleared on the first run: the chain renders in bare node with no
canvas and no DOM; `vega.textMetrics.width` accepted the mono override and
served 98 measurements; the emitted SVG carried **zero off-palette colours and
zero sub-12px type**. Only `flint-chart/vegalite` is needed, so the ECharts,
Plotly, Chart.js and Excel backends never enter the bundle.

Four things it changed.

**Flint's portability is not a property we want.** Its docs warn that a
post-compile edit means "no longer a portable Flint spec" — portable meaning
swappable to ECharts or Excel. We target Vega-Lite and nothing else, so that
warning costs us nothing, and spec editing is free. This is what makes the rest
possible: the finish is applied by the kit after flint derives the form.

**Generic is not good enough, and does not have to be.** The first render was
competent and characterless — no now-marker, no end dot, raw field names as
axis titles, eleven dense mixed-format date ticks. Every one of those is
recoverable through Vega-Lite's own vocabulary: the now-marker is a `rule`
layer, the end dot a `point` layer over the last datum, the sparse axis an
explicit `axis.values`. Declared once in the kit's finish, they apply to every
chart rather than being drawn per component. One caution learned the hard way —
`axis` must be **omitted** in annotation layers, never set to `null`, because a
layered spec resolves axes across layers and an explicit null suppresses the
shared one. Setting it cost both axes.

**Two renders, not one capped.** Uniform scaling put sub-12px labels in a 700px
frame — the failure this ADR lists as rejected, reached by accident through
`max-width: 100%`. Fixed-and-capped only holds _above_ the chart's natural
width; below it the options are scale, clip or re-render. So a chart band emits
one SVG per tier. Measured at **11.1 KB and 10.9 KB** for the burn-up, against
33.8 KB of `kit.css` already inlined in every artifact, which is what retires
the "multiplies artifact bytes" objection this ADR originally raised against it.

**Vega's temporal scales are local-time.** A `2026-06-25` point rendered as
"Jun 24, 2026" under UTC-3. A routine's runner and its reader are rarely in the
same zone, so dates are stamped at midday UTC and scales are declared
`type: "utc"`. `Series.tsx` parses UTC deliberately; nothing in flint does.

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
- **One fixed-size render, centred and max-width capped.** This ADR's original
  choice, overturned by the spike: a cap does nothing below the chart's natural
  width, where the container falls back to scaling and breaks the type floor.
  Superseded by the two-render rule above.
- **Uniform scaling of one SVG.** Renders 9px axis labels at the narrow end and
  38px at the wide end. Fails widget-standard §6 outright — measured, not
  assumed; it is how the capped variant failed.
- **Flint for new forms only, keeping the four hand-rolled ones.** Considered
  after the spike's first render came back generic, and rejected once the
  finish layer closed that gap. Two renderers behind one theme layer and one
  conformance test would have been defensible, but it leaves the maintenance
  cost this exists to lower exactly where it was.
