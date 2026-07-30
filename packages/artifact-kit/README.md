# @steward/artifact-kit

The kit widget artifacts are compiled from (ADR-0050). Routines emit content;
a committed renderer emits the file.

**React here is a build-time authoring language, never a runtime.** Components
are authored in React + Tailwind and rendered to _static_ HTML by
`renderToStaticMarkup`; no framework reaches the published artifact. The board
injects the compiled stylesheet, the fit pass and the copy behaviour at render
time — the same seam `frameArtifactHtml` already uses for the theme and the
mono face (ADR-0009/0031). Alpine has that seam reserved but is **not**
injected today: nothing emits `x-data` yet, and a framework with no consumer
is cost without benefit.

## Why a kit at all

ADR-0027 made the design language documentation rather than a runtime, so every
artifact was hand-authored from prose on every run. Shared behaviour drifted:
the 130-line fit-to-height script exists in three divergent copies across four
live artifacts, each artifact hand-rolls 7–14 media queries, and 22% of routine
template prose does nothing but restate the rendering contract. Mechanisms hold
where instructions don't.

## Layout

```
src/
  tokens/        Tailwind theme derived from apps/web/app/lib/theme.ts —
                 one palette source, retiring ADR-0007's keep-them-identical rule
  tiers/         @custom-variant definitions: width AND height tiers, plus the
                 tile / page-only gates
  ui/            shadcn, vendored and themed. Only the components that carry no
                 Radix runtime, plus ones whose Radix part is ARIA sugar
  components/    the six with no shadcn equivalent: StatTier, Sparkline,
                 CouplingMatrix, NowMarker, StageStrip, TimeBlocks
  Shell.tsx      <head>, generated-at meta, footer, context block, fit wiring
  render.tsx     renderArtifact(data) → html string
```

## Two build gotchas, both load-bearing

1. **`react-dom/server` is CJS.** Bundling to ESM replaces `require` with a
   throwing shim, so the renderer dies at import with `Dynamic require of
"util" is not supported`. The build must pass a `createRequire` banner.
2. **React 19 emits `charSet` literally** and warns you off the correct HTML
   spelling. Harmless — HTML attribute names are case-insensitive, verified
   `document.characterSet` is UTF-8 — but anything validating the output must
   match `charset` case-insensitively.

## Rows are tables, not subgrid

Measured, not assumed: a real `<table>` holds column widths stable while the
fit pass hides rows, at every tier. The subgrid implementation it replaces
carried a 24-line comment describing a Chromium track-sizing bug that fired
precisely on runtime row-hiding, plus a `ch`-resolves-against-the-wrong-font
root cause. The table layout algorithm does that work correctly for free.
