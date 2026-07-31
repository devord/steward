<!-- prettier-ignore-start -->
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="wordmark/steward-wordmark-dark.svg">
    <img src="wordmark/steward-wordmark-light.svg" alt="Steward" width="300">
  </picture>
</p>
<!-- prettier-ignore-end -->

# Brand kit

The mark is a **bow tie** — the butler's uniform in three shapes. Everything
in this folder is generated from one file, `apps/web/app/lib/mark.ts`, by
`node scripts/gen-brand.ts` (SVG) and `zsh scripts/render-icons.sh` (PNG).
**Nothing here is hand-edited**; CI re-runs both and fails if the tree moves.
Fix the geometry at the source and regenerate.

## Which file do I want?

| You are…                                             | Use                     | Why                                                                                        |
| ---------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------ |
| putting the logo in app chrome, a nav bar, a sidebar | `mark/`                 | The bare glyph. A tile in chrome either vanishes into the surface or punches a hole in it. |
| making a favicon, launcher, app-store or PWA icon    | `icon/`                 | The product-icon chip — it carries its own tile, so it holds an edge on any ground.        |
| heading a README, a docs page, a deck, a press item  | `wordmark/`             | Mark + name lockup.                                                                        |
| printing, embroidering, engraving, or given one ink  | `*-black` / `*-white`   | Solid one-colour cuts.                                                                     |
| unsure whether the viewer is in light or dark mode   | `*-auto`                | One file, swaps itself via `prefers-color-scheme`.                                         |
| theming around the mark in code                      | `palette/identity.json` | The identity hexes, machine-readable.                                                      |

Pick `-light` for light grounds and `-dark` for dark ones — the suffix names
the **background it goes on**, not the ink.

```
brand/
├── mark/        steward-mark-{light,dark,auto,black,white}.svg  + png/
├── icon/        steward-icon-{light,dark,auto,maskable}.svg     + png/
├── wordmark/    steward-wordmark-{light,dark,black,white}.svg   + png/
└── palette/     identity.json
```

SVG is the master in every case; the PNGs are convenience copies on
transparent backgrounds, at the sizes people actually paste into things.

## Rules

**Clear space** — keep one _knot width_ (⅙ of the mark's height, or 10 units
on the 64-unit grid) free on all four sides. Nothing sits closer than that,
including the edge of its own container.

**Minimum size** — the chip is validated down to **16 px**; the bare glyph to
**20 px wide**. Both were tested at true device pixels, not scaled previews.
Below those the knot closes up and it stops being a bow.

**The mark does not follow the theme.** Steward ships fourteen themes; the
identity is not one of them. There are exactly two colourways, keyed on light
or dark mode alone.

**The gradient is a privilege of owning the ground.** On the chip, where the
mark supplies its own tile, each wing carries a fold gradient. On any foreign
surface the mark goes flat and deep. This is not a stylistic preference —
it is what keeps the mark legible everywhere (see below).

### Don't

- Don't recolour it to match a page, a theme, or a client's palette.
- Don't add effects — no shadow, glow, outline, bevel, or rotation. The chip
  already carries its own contact shadow; nothing else needs one.
- Don't stretch, condense, or re-space the lockup. Scale it as a whole.
- Don't rebuild the lockup by setting "Steward" next to the mark yourself —
  the spacing and the baseline are measured. Use `wordmark/`.
- Don't put the bare glyph on a busy photograph. Use the chip.

## Colour

Drawn from the **gruvbox** rows of the theme registry — no invented hexes.

|                                | Dark colourway        | Light colourway       |
| ------------------------------ | --------------------- | --------------------- |
| wing (flat, on foreign ground) | `#fe8019`             | `#af3a03`             |
| wing gradient — tip → gather   | `#fe8019` → `#d65d0e` | `#d65d0e` → `#af3a03` |
| knot                           | `#d4be98`             | `#282828`             |
| chip tile — top → bottom       | `#32302f` → `#1b1b1b` | `#fbf1c7` → `#f2e5bc` |
| chip border                    | `#5a524c`             | `#bdae93`             |

## What it survives

The mark was iterated against a bench sheet rather than signed off by eye.
It holds:

- **42 ground trials** — every theme Steward ships × page, card and raised
  surface. Contrast floor **4.30:1** against a 3:1 requirement (WCAG 1.4.11
  non-text contrast). Zero failures.
- **16 px at true device pixels**, chip and glyph, light and dark.
- **One ink**, positive and reversed.
- **Blur** — the silhouette stays one connected mass with a readable waist.
- **Grayscale** and **protanopia / deuteranopia / tritanopia** — separation is
  carried by lightness, not hue, so nothing collapses.
- **Circle and squircle launcher crops**, via `icon/steward-icon-maskable.svg`.

See `DESIGN.md` § Mark for the construction and ADR-0052 for why the identity
is fixed and gruvbox.
