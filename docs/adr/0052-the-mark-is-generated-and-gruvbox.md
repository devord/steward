# The mark is generated, and its fixed identity is gruvbox

Two things were wrong with the identity, and they turn out to be one thing.

ADR-0046 gave the mark a **fixed** colorway — one light, one dark, keyed on
mode, never on the active theme — and drew it from the Flexoki rows because
Flexoki was the fresh-install default at the time. ADR-0051 moved the default
back to gruvbox and the identity did not follow, which ADR-0046 explicitly
framed as the point of a fixed identity. That framing was right about
_fixedness_ and wrong about _which palette_: a fixed identity should be
independent of the viewer's chosen theme, not independent of the product's own
palette. The result was a product whose default surfaces are gruvbox wearing a
badge from a palette it no longer ships as a default — the one place a viewer
cannot re-theme, sitting permanently off-key.

Meanwhile the geometry existed six times. `logo.tsx`, `favicon.svg`,
`scripts/icon.svg`, `scripts/icon-maskable.svg` and both wordmarks each
carried their own copy of the same path data, and each carried a comment
asking the next editor to keep them in sync by hand. Nothing enforced it.
Any redraw of the tie was a six-file transcription with no check.

**Decision: `apps/web/app/lib/mark.ts` is the only definition of the mark, and
`MARK_IDENTITY` is drawn from the gruvbox rows.** Every static mirror —
favicon, launcher sources, both wordmarks, the data-repo lockups, and the
`brand/` kit — is emitted by `node scripts/gen-brand.ts`. CI regenerates and
fails on drift, the same discipline ADR-0050 set for the artifact kit's
palette. "Keep in sync" stopped being a comment and became a check.

## The law the mark now obeys

The recolour surfaced a real failure. Measured against every surface the
product ships — fourteen themes × page, card and raised — the light
colourway's bright gradient stop (`accentDeep`, `#d65d0e`) reads **2.72:1** on
tokyo-night-light's page, under the WCAG 1.4.11 graphics floor.

The obvious fix is to dull the gradient everywhere until its worst case
passes. That pays for a surface the gradient never actually sits on: the
gradient only appears on the **chip**, which brings its own tile. So instead:

> **The gradient is a privilege of owning the ground.**

On the chip the fold gradient runs at full range and is measured against
`tileTop`/`tileBottom`. As the bare glyph in chrome the mark sits on a foreign
surface and goes flat and deep — a new `wingFlat` token — which clears 3:1 on
every theme with room to spare. `theme.test.ts` holds both halves separately,
because they are answers to different questions.

Floor across the 42 ground trials: **4.30:1**. Zero failures.

## What else changed, and why it is less

The mark was rebuilt from six named ratios rather than tuned by eye, and three
of them were set by a failing test rather than by taste:

- The **waist** pinches to 8 of 22. At half the tip height the silhouette
  broke into two lobes under blur — a dog bone, not a bow.
- The **tuck** crosses 2 units past centre, so the wings overlap each other
  and the silhouette is one continuous mass. At the old tuck the mark was two
  shapes leaning on a third to hide the seam between them.
- The **notch** is 2.6, not 4.6. Deeper and each wing rounds off into its own
  separate blob.

Fold creases and the tile bevel are **removed**. Both were tried at every
weight that read as material, and every one of them also read as damage — a
scratch across the cloth, a white bar floating over the tile. The wing's fold
gradient carries the material alone. Terminal-calm already banned decorative
depth; this is that rule applied to the mark's own furniture.

## Consequences

- Anything embedding the old Flexoki-orange tie is stale. The data-repo
  lockups are regenerated here; team and private data repos re-sync from
  `templates/data-repo/.github/` on their next update.
- `--mark-tile-bevel` is gone from the emitted custom properties, and
  `--mark-wing-flat` is new. Both are internal to `logo.tsx`.
- `og.png` moves to the gruvbox-light surface palette to match the identity it
  frames; OG previews cannot theme-switch, so it stays one fixed image.
- Rasters still render through headless Chrome locally (`render-icons.sh`) —
  ImageMagick's SVG delegate is not faithful to the gradients and filters, so
  CI checks the SVGs only.
- `brand/` is now a distributable kit with its own usage rules. It is
  generated output; fixing the mark means fixing `mark.ts` and regenerating.

The alternative considered was leaving the identity on Flexoki and simply
adding the `brand/` folder. Rejected: it preserves the off-key badge, and it
would have shipped a kit whose whole job is to be the canonical source while
the canonical source stayed six copies deep.
