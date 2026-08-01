# Design

Visual system for Steward's app chrome. The palette is law: the theme
registry in `apps/web/app/lib/theme.ts` is the single source of every hex
(ADR-0009); `app.css` only aliases its runtime vars, the shadcn semantic
tokens alias those in turn (ADR-0008), and the `widget-artifact` skill
mirrors the canonical gruvbox row for artifacts (ADR-0007). No color may
exist that isn't in the registry.

## Theme

Themeable, dark by default. The user preference is a mode (`auto` follows
the OS, or pin `light`/`dark`) plus a theme per slot, set on `/settings`
and stored per device (ADR-0009). Scene: a developer's editor environment
in whichever palette they already live in. The board matches the terminal
next to it; widgets carry the color, chrome stays near-monochrome.

Curated registry (add themes there, with their contrast tests), in
light/dark families only; a theme without a twin doesn't ship. **Gruvbox
dark stays the canonical anchor** for the artifact contract: artifacts are
authored in it and inline it at rest, and the `:root` palette block still
carries it (ADR-0046). Gruvbox is transcribed from **gruvbox-material**
(medium background), not classic morhetz (ADR-0048): it is the flavour the
terminal beside the board is running, and its warmer ink (`#d4be98` /
`#654735`) is what reads as gruvbox rather than as a yellow-tinted
greyscale. That retranscription is also why the **gruvbox pair is the
fresh-install default again** (ADR-0051): root.tsx stamps `data-theme` with
the dark slot at SSR, so the no-JS fallback and browser-chrome colors
(`theme-color`, the manifest) match what a new viewer resolves to (ADR-0046
amendment). The **identity is its own brand palette** (ADR-0055): a burnt-orange
ember (`#c75117`), a neutral ink, and cream, mostly sourced from the gruvbox
rows so the registry stays authoritative. The mark still never follows the
_active_ theme; the ember also enters the theme as the gruvbox `accent-deep`, so
the rebrand's primary colour is in the registry rather than beside it. The
dashboard
injects the active theme into artifact iframes at render time, for every
theme including the anchor, so a file published against an older row still
paints the current one — the anchor is an _authoring_ default, not a pin on
the registry (ADR-0048).

## Color

Token roles, one set per theme (values below are the canonical
gruvbox-dark row of the registry):

| Token                            | gruvbox-dark | Role                                         |
| -------------------------------- | ------------ | -------------------------------------------- |
| `bg` / `--background`            | `#282828`    | page                                         |
| `bg1` / `--card`                 | `#1b1b1b`    | widget cards, panels                         |
| `bg2` / `--muted`                | `#32302f`    | edit-mode surfaces, wells                    |
| `bg3` / `--secondary`            | `#45403d`    | hover fills, secondary controls              |
| `border` / `--border`            | `#5a524c`    | object edges: popovers, cells, head rules    |
| `border-dim`                     | `#45403d`    | hairlines splitting the flat plane           |
| `border-strong` / `--input`      | `#928374`    | control boundaries: inputs, checkboxes       |
| `ink` / `--foreground`           | `#d4be98`    | body text                                    |
| `ink-dim` / `--muted-foreground` | `#a89984`    | secondary text                               |
| `ink-faint`                      | `#928374`    | glyphs and disabled controls, never text     |
| `accent` / `--primary`           | `#fe8019`    | the accent: primary actions                  |
| `accent-deep` / `--ring`         | `#c75117`    | focus ring, selection, the brand ember       |
| `yellow`                         | `#d8a657`    | staleness, warnings                          |
| `green`                          | `#a9b665`    | diff additions, success                      |
| `red` / `--destructive`          | `#ea6962`    | diff deletions, destructive                  |
| `aqua` `blue` `purple`           | —            | artifact-side accents; chrome uses sparingly |

Each theme fills the same roles from its own upstream palette. The accent
is that palette's signature color (catppuccin mauve, rosé pine iris/pine,
tokyo night blue). In artifacts the accent keeps its historical
`--color-orange` name.

Gruvbox is the exception, and the reason generalizes: **the accent must
stay distinct from `green`, and it has to survive being a fill.**
gruvbox-material's signature is its green, but it spends one color on both
accent and success — while Steward spends `green` on the freshness dot and
diff additions of every tile, so an olive accent would make the primary
action the same color as the status beside it. It also can't carry a button
label: gruvbox palettes calibrate their colors to be read _as ink on the
background_ (material's own filled surfaces are dim washes under colored
text), so the light green drops to 3.83:1 once inverted into a solid fill,
and nothing in that ramp clears 4.5:1 — pure white only reaches 4.81:1.
Classic gruvbox's _faded_ ramp exists for exactly the jobs needing contrast
on a light ground, so `accent` keeps the gruvbox orange in both twins while
every semantic role is material's.

Surface hierarchy: chrome is **one flat plane**, with page, rail, and header
all sitting on `bg`, split by hairlines. The widget cards (`bg1`) are the
only surface off that plane. Most themes spread their roles so cards sit
_above_ it — light themes deliberately so (values still transcribed, roles
repointed within the palette's own ramp): the canvas takes a mid-neutral one
step deeper and the cards keep the palette's lightest tone, so widgets glow
against the board instead of the whole page collapsing into one near-white
plane.

Gruvbox inverts that in both modes (ADR-0048), forced rather than chosen:
material's ramp has nothing above `bg0`, so taking `bg0` as the canvas puts
the card tone a step _down_, at `bg_dim`. Cards recede there. The alternative
was a card separating from the page by 1.03:1 — a hierarchy you cannot see is
not one, and a visible recess beats an invisible lift. It also matches how
material uses `bg_dim` natively (statusline, popup menus, float backgrounds).
Note what this means for the flush system: it survives the inversion untouched
because it is written in roles, not hexes. Tiles repaint to `bg` and the board
is `bg`; the lightbox is `--card` and artifacts author `bg1`. Both stay flush
whichever way the ramp runs.

Button labels take `bg1` — each palette's most neutral surface, and the tone
furthest from its accent in either direction, which is why it holds AA whether
the accent is a dark fill under a cream label (light themes) or a bright fill
under a near-black one (gruvbox dark). Selection is a translucent accent wash
under unchanged ink.

Borders are three graded tiers, not one value dimmed: `border-dim` splits the
flat plane (≥1.2:1 on `bg`/`bg1`), `border` edges objects that must read as
distinct — popovers, board cells, table head rules (≥1.5:1) — and
`border-strong` bounds the fill-less controls. Inputs, selects, checkboxes and
outline buttons carry no fill, so that hairline is the only thing identifying
them: it answers to WCAG 1.4.11 and clears 3:1 on both surfaces. Pick by what
the line is doing, not by how loud you want it; `theme.test.ts` holds every
theme to all three floors and to their ordering.

**No text role sits below AA** (ADR-0048). `ink` and `ink-dim` both clear
4.5:1 on every surface of every theme, and there is no third, dimmer text
tier and no exemption for "just metadata" — freshness is the product, so the
readout carrying it is held to the same floor as body copy. Measured across
the registry, `ink-faint` cleared 4.5:1 on one palette of fourteen and
bottomed out at 3.20:1, so it is now a **glyph** role: resting icons,
hover-revealed icon buttons, disabled controls, where WCAG 1.4.11's 3:1 is
the applicable floor. De-emphasis in text is spent on size and weight.
Where a palette has no ink both dimmer than body and AA-clearing,
`ink-dim` collapses onto `ink` (rose-pine-dawn, tokyo-night-light) and the
tier is carried by size and weight alone; `theme.test.ts` allows the
collapse and forbids an inversion.

Strategy: **restrained**. Near-monochrome chrome, accent ≤10% of any
screen. Yellow/green/red appear only when they mean something (stale,
added, removed), and never carry 12px text alone: state text stays in the
ink roles while a tint wash, dot, or sign carries the tone (several light
palettes have no AA-clearing yellow/green for small text). Chrome code uses
tokens only; a literal hex breaks every non-default theme.

## Shape

Radius signals elevation, so only things that float carry it: dialogs,
popovers, menus, pills, and controls keep `--radius` (4px, and its `sm`/`md`
steps, nothing past 6px). **The widget frame is square.** A board cell has no fill — the
artifact is repainted flush to the board and the border is the cell's only
frame — so that hairline is a _pane_ edge in the tmux/lazygit sense, not a
card outline, and a radius there would round nothing (the artifact inside is
a flat rectangle). Square also lets the cells resolve into the board's
implied grid instead of each floating alone. Everything that stands in the
same slot follows: the loading skeleton, the drag-and-drop placeholder
(`app.css`), and the empty-board well; a rounded stand-in under a square
tile flickers shape mid-load.

Chrome that floats over an artifact shares the artifact's edge, not its own.
The tile's shell padding is `12px 14px` (widget-standard), so the widget-card
title bar takes a 14px inline inset: the routine name sits on the same left
edge as the artifact's first line, and the freshness readout on the same
right edge as its content. That shared edge is what makes a frameless
heading and a flush body read as one block — with no divider between them,
there is nothing to excuse a different inset. Where a header is a real
filled bar instead (the lightbox, the edit-mode drag handle), it is its own
surface and sets its own inset.

## Typography

- Mono: Geist Mono Variable (bundled via fontsource; system mono fallback).
  **The chrome is mono** (ADR-0048) — `font-mono` sits on `body`, so the
  rail, header, ledgers, pills, controls, menus, dialog titles and widget
  titles all set in it without asking. The mono is the brand voice, and it
  must be a designed face, never the viewer's terminal default.
- Sans: Geist Variable, for **prose only** — the landing page
  (`data-prose-surface`) and the docs (`#nd-docs-layout`), which are read at
  a 65–75ch measure where mono is the slower face. Same family as the mono,
  so the two reading surfaces still belong to one system. Nothing in chrome
  opts into it.
- There is no per-string rule any more. The old one — "if git or the schema
  would care about the string, it's mono" — forked the face inside single
  slots: a display name was sans and the login it fell back to was mono, two
  renderings of one control. A reader doesn't perceive "this string is an
  identifier", they perceive a column that keeps changing material. Prose vs
  identifier is still a real distinction; it is carried by the words, not by
  the face.
- The scale is Tailwind's own, set in `app.css`: **body and interactive
  labels 14px (`text-sm`)** for nav items, buttons, the account name;
  **secondary labels and metadata 12px (`text-xs`)**, the floor for anything
  that carries data, including timestamps. One tier sits below it:
  **tracked UPPERCASE captions at 11px (`text-2xs`)**, navigational
  landmarks whose legibility comes from tracking, caps, and weight, never
  data carriers. Nothing a reader must read to act goes under it; the sole
  exception is avatar initials, which duplicate a name already beside them.
  Section headings 16–18px (`text-base`/`text-lg`), and the brand lockup
  sits in that tier too, at 16px on every chrome surface (§ Mark). No display
  sizes in chrome. Nav and other primary controls take body size, never the
  metadata floor.
- 14px is also the artifact floor (widget-standard §6). That is the
  relationship, not a collision: chrome carries ceilings, artifacts carry
  floors, and the board has one baseline that artifacts rise above.
- **The caption tier is one token**, `railCaptionCls` in `lib/utils.ts`:
  mono, `text-2xs`, semibold, tracked, caps, `ink-dim`. The rail's repo
  caption, its section labels and the template picker's group headers all
  resolve to it. It shipped at 11px in the rail and 13px on the board once — a
  gap too small to read as hierarchy and big enough to read as a mistake.
  Captions carry their member count at rest (`aria-hidden`; the items are
  listed right below): a bare word heading a list is decoration, the number is
  what makes it navigation.
- **The board's band heading is not in that tier** (ADR-0049).
  `bandHeadingCls`: the same tracked UPPERCASE landmark at **`text-sm` (14px),
  semibold, full `foreground`**, its count one step down at `text-xs`. What a
  caption heads is what decides its size. The rail's captions head 14px nav
  rows in a 200px column, so 11px reads as a deliberate label; a band heads
  16px semibold widget titles across the whole canvas, and at 11px the heading
  ranked _below_ its own children. This is not the 11-vs-13px board caption
  ADR-0048 rejected — that was one tier two pixels bigger, drift rather than
  hierarchy. 14px is the body/control tier, where the rule above already puts
  it: the row is the control that folds the band, and primary controls never
  sit at the metadata floor. Caps, tracking and the full-bleed rule keep it a
  landmark; its cap height still sits under the widget titles', so the band
  frames and the widgets glow.
- Widget titles: the `widget-card` tile name is **`text-base` (16px)
  semibold**. Each widget is a section of the page, so its name reads as a
  section heading that owns the top of the cell, not a faint label: it takes
  the 16px heading tier and a full semibold, a clear step in size, weight, and
  color (full `foreground`) above the 12px `ink-dim` freshness beside it,
  which stays quiet. With no card
  border by design, that heading plus the whitespace rhythm _is_ the block's
  separation. The lightbox header carries the same name in the same mono
  heading voice. State reads as pills in that same mono voice
  (`running`/`stale`/`manual`), never prose; a fresh tile carries no pill
  (semantic color only when it means something). In **edit mode** the tile
  bar deliberately shows the `slug`, not the name: editing is the machine
  view, where the bar is a drag handle over the routines.yaml entry being
  rearranged, so the identifier git cares about is the honest label there.
- Ledger rows sit one tier down: the routine pool, the templates ledger, and
  the run history (`routines-view`, `routine-runs-view`) set **`text-xs` on
  the `<table>` and nothing per cell**, one 12px line box for every column.
  Two reasons, one structural and one about voice. Structurally, cells only
  align across a row if they share a line-height; a 12px link inside a 14px
  line box sits a few pixels low, and a table of those reads as drifting
  columns. In voice, a ledger row is one line of machine output, closer to
  `gh run list` than to a list of headings, so the row name takes the same
  12px as the data beside it and earns its prominence from full `foreground`
  ink, medium weight, and the state dot leading it, against `ink-dim` peers.
  It is a data carrier at the 12px floor, not body copy. Layout follows the same discipline. Exactly
  one column is flexible (`w-full max-w-0` + `truncate` on the name, or on the
  description in the templates ledger) and every other cell is
  `whitespace-nowrap`. So the short fixed phrases never wrap (a state, a
  schedule, a host) and a long name ellipsises instead of widening the table.
  A cell holding a list of unknown length (boards, used-by) carries its own
  `w-40`, since the flexible column starves every other column to min-content.
  Inside that width the list **shows its head and counts its tail** — the first
  slug, truncating, then a `+n` chip whose popover lists every item unabridged.
  Letting the list wrap instead cost a line per extra slug, and since a slug
  never breaks mid-word, one long name (`turtle-beach-hydrogen-stats`) simply
  overflowed the box onto the row actions beside it. Head-plus-count keeps the
  identity a ledger is read for and the one-line row both.
- Artifacts set their own type, one register bolder than chrome since they
  are the content that glows: body/data ≥14px, section labels ≥12px, nothing
  below 12px (the contract lives in `docs/widget-standard.md` §6 and the
  `widget-artifact` skill). Their mono is the chrome's own: the frame
  injects Geist Mono into every artifact iframe the way it injects the
  theme, and the artifact's `--font-mono` leads with the family name
  (ADR-0031; the raw page falls back to system mono).

## Mark

The logo is **the bow tie**: the butler's collar over the shirt studs. Two
folded wings meet at a **square knot**, with **two buttons** below. Each wing is
a folded butterfly — the long edges bulge gently where the cloth puffs, the
outer edge nips inward in a shallow concave fold so the tips flare and the
middle pinches, and the throat is a short edge that tucks into the knot rather
than a sharp point that stabs it (ADR-0055).

**The knot and the buttons are back** (ADR-0055, amending ADR-0053). ADR-0053
deleted the knot because it was a third shape whose only job was to be a
_different colour_ from the cloth it lay on, and at 16px that boundary measured
1.40:1 while every contrast test passed — they all held ink against ground and
none held ink against ink. What changed is not the knot but the mark's colour:
it is a **single ink** in every framing now (§ below), so the knot and the
buttons carry the wings' own fill. The gaps between them are _ground_ showing
through, not an ink-against-ink edge, so the only contrast boundary the mark has
is still itself against its surface — exactly ADR-0053's rule. A same-ink knot
costs nothing the coloured one could not afford.

**The geometry is generated, not transcribed** (ADR-0052/0055). It lives once in
`apps/web/app/lib/mark.ts` as named ratios on a 64-unit tile, with the left
wing derived and the right mirrored, so symmetry is a property of the
construction. Run `node scripts/gen-brand.ts` to re-emit every static mirror
and the `brand/` kit, then `zsh scripts/render-icons.sh` for the rasters. CI
regenerates and fails on drift.

The bow is **54×22** — wider than tall, covering 84% of the tile's width — with
the knot and buttons carrying the rest of the height. A bow tie reads as a bow
by being wide and pinched; stretched toward square it is an X.

**Every drawn region clears one device pixel at the declared minimum** — 16px
for the chip, 20px wide for the glyph, in device pixels at 1× (ADR-0053).
Contrast says two regions differ; it never says either is big enough to be a
region. The bow, the knot and each button clear the floor at both minimums; the
fold (`notch`, `puff`) modulates the wing's edge rather than drawing a region,
so it is not gated, the way the old `sweep` was not. A feature either survives
or is not drawn — which is why the **browser-tab chip drops the buttons**, since
at 16px they fall below a device pixel and would only muddy the bow.
`mark.test.ts` holds all of it.

Two framings, and they are genuinely different objects rather than one drawing
with and without a tile.

**In chrome** the mark is the **bare glyph**: a **neutral ink** (`--mark-ink`),
level, on whatever surface the rail or the header hands it — near-black on
light, cream on dark. It is the one framing sitting on a ground it does not own,
so it is the one thing keyed on light or dark mode. The orange is the chip's,
not the bow's: glyph-as-ink is the mark-in-chrome treatment everywhere else
(GitHub, Linear, Vercel), and it is what the brand sheet's primary logo does —
the orange bow is the "filled" variant, not the default.

**On display surfaces** — the browser tab, the OS launcher, the social card,
the README lockup, the landing hero — the mark wears the **product-icon chip**:
a **flat ember** superellipse tile (`--chip-tile`) with the bow **cut out of it**
in cream (`--chip-bow`), level, and inset so the tile keeps ground around it.
Both the level and the inset are one function, `chipTransform`, which centres
the whole mark — bow, knot and buttons — on the tile.

- **The chip is one flat colourway in both modes.** It is a saturated _object_,
  not a surface; it is not borrowing the page's tone, so it does not follow the
  page's mode. The `.ico` and the maskable icon could never media-query anyway.
- **The chip has no gradient and no border** (ADR-0055). The old tile ran a
  diagonal two-stop gradient so that at least one stop cleared each ground; the
  flat `#c75117` clears the graphics floor on every ground it lands on by itself
  (≥3.19 across the registry, ≥3.47 on the browser tab strips), so the gradient
  is retired and the chip is one drawing at every size.
- **The tile is a superellipse.** A rect's `rx` draws a circular arc, which
  meets the straight edge at a curvature discontinuity; continuous curvature is
  what platform icon grids use, and it is most of what separates a tile that
  looks drawn from one that looks defaulted.

Neither fold creases nor a tile bevel are drawn. Both were tried at every weight
that read as material and every one of them also read as damage — a scratch
across the cloth, a white bar floating above the tile.

<!-- gen:mark-facts -->
<!-- Generated by scripts/gen-brand.ts — do not edit by hand. -->

### The identity

|                              | hex       |                      |
| ---------------------------- | --------- | -------------------- |
| bare glyph, light surfaces   | `#1e1e1e` | brand ink            |
| bare glyph, dark surfaces    | `#fbf1c7` | gruvbox-light `bg`   |
| chip tile                    | `#c75117` | gruvbox `accentDeep` |
| the bow, cut out of the tile | `#fbf1c7` | gruvbox-light `bg`   |
| logotype, light lockup       | `#1e1e1e` | brand ink            |
| logotype, dark lockup        | `#fbf1c7` | gruvbox-light `bg`   |

### What is measured, and where it is worst

The bare glyph is a single ink, so it has exactly one boundary: itself against
the surface it was handed. Each colourway is measured only against the surfaces
it can actually land on — page and card, of every theme in its mode. Neutral
ink clears its ground with enormous room, which is the point of moving the
colour off the bow:

|                         | worst       | on                     |
| ----------------------- | ----------- | ---------------------- |
| glyph on light surfaces | **11.71:1** | tokyo-night-light page |
| glyph on dark surfaces  | **12.99:1** | gruvbox-dark page      |

The chip takes no mode, so its **flat** tile faces all 14 themes at once. There
is no gradient stop to fail on one ground and clear on another — the single
ember carries the edge, and it clears the graphics floor on every surface it
lands on:

|           | worst  | on                     |
| --------- | ------ | ---------------------- |
| chip tile | 3.19:1 | tokyo-night-light page |

The chip's own interior edge, and its habitat — the surfaces it lands on that
are not Steward's:

|                       | ratio  |
| --------------------- | ------ |
| bow against the tile  | 4.01:1 |
| tile on Chrome, light | 3.47:1 |
| tile on Chrome, dark  | 3.54:1 |
| tile on GitHub, light | 4.55:1 |
| tile on GitHub, dark  | 4.16:1 |

### Every drawn feature at the declared minimum

Device pixels at 1×. A feature either survives here or is not drawn — held by
`mark.test.ts`. The fold (`notch`, `puff`) is absent: it modulates the wing's
edge rather than drawing a region with a width, exactly as the old `sweep` did.

| ratio    | units | chip @ 16px | glyph @ 20px |
| -------- | ----- | ----------- | ------------ |
| `bowW`   | 54    | 13.50px     | 18.62px      |
| `bowH`   | 22    | 5.50px      | 7.59px       |
| `inner`  | 7     | 1.75px      | 2.41px       |
| `knot`   | 8     | 2.00px      | 2.76px       |
| `button` | 4.8   | 1.20px      | 1.66px       |

### How the chip places it

The bow is 54 × 22 units at an aspect of 2.45:1 — 84% of the tile's width.
Every chip insets the **whole mark** — bow, knot and buttons — through one
function, to the same share of whatever the viewer actually sees:

|               | scale              | bow spans | of the visible tile | ground per side |
| ------------- | ------------------ | --------- | ------------------- | --------------- |
| chip          | `CHIP_INSET` 0.92  | 49.7u     | 78%                 | 7.2u            |
| maskable icon | `MASK_INSET` 0.736 | 39.7u     | 78%                 | 5.7u            |

The maskable column measures against the safe zone — the middle 80% a launcher
is guaranteed to show — which is why its scale is `CHIP_INSET` times that and
not a number of its own. The two shares match by construction.

The bow is **level in every framing** (`CHIP_TILT` 0°): it is symmetric by
construction and the tile is square, so a rotation fights both.

<!-- /gen:mark-facts -->

The renders live in `brand/proof/`, at true device pixels and magnified with
nearest-neighbour (`node scripts/mark-sheet.ts`). They are not a CI check —
headless Chrome does not rasterise identically across machines — and they are
committed anyway, because the numbers above and the question "is it legible"
are different questions and this mark has already answered them differently
once (ADR-0054).

- `apps/web/app/lib/mark.ts`: the ratios, the wing construction, the
  superellipse, `chipTransform` (how every chip places the bow on its tile),
  the declared minimums, and `drawnFeatures` — which is what the size gate
  reads.
- `apps/web/app/components/logo.tsx`: `Logo` (both framings) and `Wordmark`
  (mark + mono name lockup, scales with font size). The glyph consumes
  `--mark-ink`, which is mode-keyed; the chip consumes `--chip-tile`/`--chip-bow`,
  which are not.
  **The chrome brand is one size, `text-base` (16px), and `Wordmark` carries
  it** the way `railCaptionCls` carries the caption tier — so the rail, the
  collapsed-rail header, the account bar, the error chrome and the device-code
  page can't drift apart. 16px is the heading tier the widget titles take: the
  brand is a section heading of the app, never a row in the list.
- `apps/web/public/favicon.svg`: the browser-tab chip — bow only, no buttons,
  since they fall below a device pixel at 16px. `favicon.ico` (16/32/48, packed
  by `render-icons.sh` from this file) is the raster fallback.
- `apps/web/public/apple-touch-icon.png` (180) + `icon-{192,512}.png`: the chip
  with buttons, rendered from `scripts/icon.svg`.
- `apps/web/public/manifest.webmanifest` + `icon-maskable-512.png`: from
  `scripts/icon-maskable.svg`, full-bleed with the bow at `MASK_INSET` — the
  chip's inset times the 80% safe zone — so it holds the same share of what the
  launcher shows as the chip holds of its tile. It was a hand-typed `0.82`,
  which is the chip's inset applied to a tile 20% of which is about to be
  cropped away, and it put the bow's tips against the mask. `theme_color`/`background_color` are
  `#282828` — the **default dark theme's** canvas, not the identity tile. The
  launcher chrome frames the app, so it matches what the app paints.
- `apps/web/public/wordmark-{dark,light}.svg`: the bare mark + `Steward` lockup
  for the README, swapped by `prefers-color-scheme` in a `<picture>`. Mirrored to
  each data repo's `.github/`. No tile — the reference lockup is the bare mark,
  and orange lives on the app-icon chip. The word is **outlined paths** (Geist
  Mono 600, 40px, tracking −1) rather than a `<text>` node, because GitHub's
  image context can't load webfonts. Its ink is `LOGOTYPE_INK`, which matches
  the neutral bow — near-black on the light lockup, cream on the dark.
- `apps/web/public/og.png`: 1200×630 (@2x) social card. One fixed image for
  every viewer, since OG previews can't theme-switch. Source is
  `scripts/og-card.html`.
- `brand/`: the distributable kit — glyph, chip and wordmark, plus `auto` and
  one-colour cuts, SVG masters with PNG beside them, `brand/README.md` carrying
  the clear-space, minimum-size and don't rules, and `brand/proof/` carrying the
  renders. `brand/palette/identity.json` is the identity machine-readable. The
  one-colour cut needs no special handling: the mark is one ink at every colour,
  so the cut is simply the mark.

The wordmark text is `foreground` ink, mono, capitalized **`Steward`**; the mark
is neutral ink beside it, and the ember lives on the chip.

## Layout

**Rhythm: tight within, air between** (ADR-0048). Grouping is carried by
space, not by rules — a hairline for every boundary is a Grafana move. The
gap that opens a new group runs several times the gap inside one, so the eye
finds the groups without reading them:

| Boundary                      | Gap     |
| ----------------------------- | ------- |
| sibling rows within a group   | 2px     |
| a caption and its own content | 8px     |
| a group and the next caption  | 20–22px |
| top-level band to band        | 32px    |

A **collapsed** band is the exception, and it proves the rule: it drops to the
8px caption step (ADR-0049). The 32px belongs to the content it separates, and
a folded band has none — at full air, three shut bands read as debris down the
page instead of a stack of drawers.

The ratio is the point, not the exact pixels. These used to be 12px and
16px, close enough to the ~30px row pitch that the rail read as one
undifferentiated ladder and two bands read as one long grid with a caption
stranded mid-way. A new surface inherits this rhythm rather than inventing
its own.

**The ladder nests, so no boundary may be tighter than one inside it, and
each step runs ≥1.5× the step it contains.** Stated because the rail broke it
in a way that reads as random spacing rather than as a wrong number: the two
tiers spent the same gap. A repo group's first section opened the full
between-groups air below the repo caption (leaving the caption equidistant
from the group above and its own contents — a heading attached to nothing),
while the boundary _between_ repos was tighter still, at 16px. So a new data
repo announced itself more quietly than a new section did. The rail's four
boundaries now read 2 / 8 / 22 / 32: rows, caption-to-its-content (a repo
caption to its first section or board, a section to its boards), section to
section, repo group to repo group. The board's bands take the same 32px at
their own tier. Frame insets are not rungs on this ladder: the rail's nav
and foot both inset 8px, so every hairline in the chrome clears its nearest
row by the same amount.

- Dashboard grid: 4 columns desktop / 2 tablet / 1 phone, 150px row unit,
  12px gap (`.dash-grid` in app.css; placement via CSS custom properties).
  Below 4 columns, widgets render in visual (row, col) order so the stack
  reads like the full board.
- Chrome density: quiet but legible. Comfortable spacing and readable
  type, never cramped; the header is one slim row (`app-header` shell,
  shared by every route); panels use `gap-4`. The `NavShell` toolbar is
  `h-11` on desktop (the rail brand row's box, for an unbroken hairline) and
  relaxes to `h-12` below `lg`, where touch targets take their coarse floors
  and a `· <slug>` mono wayfinding label joins the brand, since the rail
  isn't there to answer "where am I". The brand lockup itself doesn't change
  size across those rows — it is 16px everywhere (§ Mark).
- Page gutters: `px-4 sm:px-6` on every route container; `body` carries
  safe-area insets (`viewport-fit=cover`).
- Touch: the vendored button/select primitives carry `pointer-coarse:`
  size floors (roughly one Tailwind step up), so coarse pointers get
  usable targets while fine pointers keep the compact density. Primary
  chrome meets the 44px platform floor, but only invisible boxes may
  _grow_ to it (the ghost drawer trigger, `pointer-coarse:size-11`).
  Anything that can show a fill, such as a state wash or a chip, caps its
  visible box at 36px and extends the hit area with an `after` inset
  (the header action squares, the widget bar's ⋯ trigger): a 44px wash
  inside the 48px header reads as a full-height slab. Header actions
  collapse to icons below `sm` (label goes `sr-only`), and an icon-only
  create verb goes ghost with the accent on the glyph, because a lone solid
  square out-shouts a slim header. The widget bar's hover-revealed
  actions collapse into one ⋯ menu on coarse pointers so the title
  keeps its bar.
- Dialogs: never override the base `max-w-*` (it is the phone edge
  margin). Widen with `sm:max-w-*`; tall content gets `max-h-[85svh]` + a
  scrollable middle. Width follows **what the surface holds, not how big
  the screen is** — no chrome surface scales on a viewport breakpoint
  alone. Three tiers:
  - **Task** — fixed, content-sized, does not scale. Confirms, renames,
    create-forms (`sm:max-w-sm`/`md`/`lg`), the step picked from the
    measure the fields actually need: a `steward-data-<login>` value must
    fit its input. A task dialog is one focused job, and that job's
    measure doesn't change when the monitor does. Stretching it to hold a
    viewport fraction strands short fields in a wide empty box — space
    _inside_ a dialog reads as a mistake where the same space outside it
    reads as focus. Before reaching for the next width step, check the
    **column split**: a row of fields divided evenly gives every field the
    same measure regardless of what it holds, so the longest one truncates
    while its neighbour sits half empty. Weight the tracks to the content
    (`sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]` for the data repo's
    owner/name pair) and the width problem usually turns out to have been
    a distribution problem.
  - **Content** — fluid to a cap, for a surface you scan or compare: the
    routine picker (`sm:max-w-[720px]`), the sync diff (`sm:max-w-2xl`).
    Here width buys information — one line per template description
    instead of two, so more of the list fits a screen.
  - **Viewer** — fluid to a large cap, where pixels _are_ the content:
    the artifact lightbox and version browser
    (`w-[calc(100%-3rem)] max-w-[1500px]`).

  The board draws the same line one level up: `wide` opts a dashboard into
  `max-w-[1800px]` because a board is content. The scrim is deliberately
  plain (`bg-bg/70`, no blur), so a task dialog on a 27" monitor sits in a
  lot of still-legible board and can _read_ small. That is the scrim's
  job, not a width problem; widen the dialog and it looks worse on
  approach, better only in a thumbnail.

- Popovers carrying an identifier size to their content (`w-auto` plus a
  `min-w`/`max-w` pair), not a fixed `w-*`: a repo slug that wraps
  mid-name costs more than the ragged right edge a content-sized panel
  gets. The floor holds the panel's other rows together, the cap stops a
  pathological name from making a slab, and `overflow-wrap` on the title
  covers whatever still exceeds it.
- Radius: `--radius: 0.25rem` (4px), every derived step capped at 6px
  (ADR-0048). The rule is unchanged — radius signals elevation, so only
  things that float carry it — but the number came down: the widget frame is
  square by design, and an 8px pill beside a square tile read as a different
  material. 4px is the smallest step that still says "this floats" without
  reading as a card. The scale is stated in pixels off the base, not as
  multipliers, which had run the upper steps to 10px.

## Components

shadcn/ui vendored in `apps/web/app/components/ui/` (Base UI primitives,
`base-nova` style, cva variants). Domain components in
`apps/web/app/components/`: `widget-card` (artifact iframe + freshness
title bar + edit controls), `add-routine-dialog`, `sync-panel` (YAML diff),
`appearance-settings` (mode + theme pickers), `logo` (mark + wordmark),
`app-header` (the shared header row).
Add new primitives with `pnpm dlx shadcn@latest add <name>`.

## Motion

Purposeful and short (≤200ms, ease-out). Dialog/popover transitions come
from the vendored components (`tw-animate-css`). No scroll-driven or
entrance choreography; this is a glanceable tool. Honor
`prefers-reduced-motion` for anything added.

## Voice

Labels in Sentence case ("Ran 2h ago", "Never ran", "Sign out"); literal
machine strings stay verbatim (slugs, branch names, cron, shell commands).
Git words used plainly: draft, diff, commit, PR, base. Empty states state
the fact and the next action in one line each, with no cheerleading.

The product name is the capitalized noun **`Steward`** everywhere a
reader or the system sees it: the `Wordmark` lockup, the README SVGs,
page `<title>`s, `manifest` name/`short_name`, OG/Twitter meta,
`aria-label`s, and all prose ("from your Steward checkout"). Identifiers
keep lowercase for the usual machine-string reason (`@steward/schema`,
`steward-data-*`, cookies, storage keys, the `Run the steward routine`
command).

## Language

Chrome speaks English and Português (Brasil), via typed dictionaries in
`apps/web/app/locales/` (en.ts defines the key set), locale negotiated
server-side via cookie then `Accept-Language` (ADR-0009). Both locales
keep the same voice: Sentence-case labels, git vocabulary untranslated where
git would surface it (commit, PR, diff, slug). Widget artifacts are not
translated, since routines write them.
