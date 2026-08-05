# @devord/steward

## 0.3.2

### Patch Changes

- 6eb9ebe: The wide chart tier fires in the frame that actually exists.

  0.3.1 added a `wide` tier so a chart would stop under-filling an expanded
  artifact, and cut it at `min-width: 1540px` — above the `max-w-[1500px]` the
  lightbox is capped at, so it could never fire in the one place the problem was
  reported. The tier was dead code for its own use case.

  Cut at 1200px instead, sized from that cap rather than from a guess: the widest
  frame an artifact ever gets is 1500px less `main`'s padding, so `page` covers
  900–1199 and `wide` covers 1200 up. Worst-case fill across the range goes from
  59% to 79%, with no third render added to every chart-bearing artifact.

## 0.3.1

### Patch Changes

- b177204: Charts keep the palette on every channel, and fill a wide frame.

  ADR-0062 promised a build sweep that renders every flint `chartType` and holds
  it to the palette and the type floor — "that test _is_ the allowlist". The test
  was never written, and three classes of drift were shipping behind it:

  - a **categorical `color` scale** kept flint's `tableau10`, so every generic
    `chart` block naming a colour channel was dropped at publish;
  - **facet headers** had no config block, so `column`/`row` drew `#000` at 10px;
  - **axis titles** came back `#666`, because Vega-Lite resolves `config.axisX`
    and `axisY` over `config.axis` and flint sets the narrower key.

  Colour now enters through the scale's `range` on any channel, flint's config is
  stripped of off-palette ink before the kit's lands on it, and the merged config
  is clamped. The sweep exists, records the eight forms that still cannot publish
  and why, and fails when that set changes in either direction.

  Charts also gain a **wide** tier. `tier-page` is `min-width: 900px` and
  open-ended, so a chart sized for its lower bound painted 860px into an expanded
  artifact's 1700px column and left the rest blank.

## 0.3.0

### Minor Changes

- 2964037: Charts compile through flint (ADR-0062).

  A routine can name any chart type in flint's catalogue — scatter, ranked bar,
  distribution, slope, heatmap, gantt and 30-odd more — in a `chart` block, and
  the kit compiles it to inline SVG at publish. The burn-up and the co-change
  field now go the same way, with their block schemas unchanged.

  The kit still owns every visual consequence, and owns it by construction: each
  scale range, mark colour and type size is replaced before compilation, and a
  rendered chart that still paints outside the palette or under the 12px floor is
  dropped rather than published.

  This is the release the routines need. The version on npm predates all of it,
  so a scheduled run was fetching a kit with no chart support and a
  `module-entropy` template with no scatter in it.

## 0.2.0

### Minor Changes

- f1b553a: `sync --apply` resolves connector names deterministically against the
  account roster (ADR-0046) and verifies convergence in code: the headless
  run must end with a machine-readable `steward-sync-result` block, and the
  command exits 0 only when cloud state matches the plan. Unresolved or
  ambiguous connector names, orphans pending web-UI deletion, and a missing
  result block all exit 1 — syncs that silently dropped a connector used to
  exit 0. Connector names are canonical sanitized roster names
  (`Google-Calendar`, `Atlassian-Rovo`); legacy underscore spellings still
  resolve and are reported as drifted.

### Patch Changes

- 4ec811d: Command hints printed by the CLI use the pasteable `npx @devord/steward …`
  form (ADR-0036) instead of a bare `steward …` that assumes a global
  install, and `--help` now shows the invocation line.

## 0.1.0

### Minor Changes

- bbfc460: Publish the routines CLI as `@devord/steward`, runnable via `npx` — `sync`,
  `run`, and `trigger` subcommands. The bundle inlines the schema and ships the
  three contract skills, so it runs anywhere, not only inside a monorepo checkout
  (ADR-0036). The web app stays private.
