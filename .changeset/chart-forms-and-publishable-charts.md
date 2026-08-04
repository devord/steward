---
"@devord/steward": minor
---

Charts compile through flint (ADR-0062).

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
