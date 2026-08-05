---
"@devord/steward": patch
---

Charts keep the palette on every channel, and fill a wide frame.

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
