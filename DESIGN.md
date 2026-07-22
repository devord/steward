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
dark hard stays the canonical anchor** for the artifact contract: artifacts
are authored in it and inline it at rest, and the `:root` palette block
still carries it (ADR-0046). The **Flexoki pair is the fresh-install
default** and the identity: root.tsx stamps `data-theme` with the dark
Flexoki slot at SSR, so the no-JS fallback and browser-chrome colors
(`theme-color`, the manifest) match what a new viewer resolves to
(ADR-0046 amendment). The dashboard injects the active theme into artifact
iframes at render time.

## Color

Token roles, one set per theme (values below are the canonical
gruvbox-dark row of the registry):

| Token                            | gruvbox-dark | Role                                         |
| -------------------------------- | ------------ | -------------------------------------------- |
| `bg` / `--background`            | `#1d2021`    | page                                         |
| `bg1` / `--card`                 | `#282828`    | widget cards, panels                         |
| `bg2` / `--muted`                | `#32302f`    | edit-mode surfaces, wells                    |
| `bg3` / `--secondary`            | `#3c3836`    | hover fills, secondary controls              |
| `border` / `--border`            | `#504945`    | object edges: popovers, cells, head rules    |
| `border-dim`                     | `#3c3836`    | hairlines splitting the flat plane           |
| `border-strong` / `--input`      | `#7c6f64`    | control boundaries: inputs, checkboxes       |
| `ink` / `--foreground`           | `#ebdbb2`    | body text                                    |
| `ink-dim` / `--muted-foreground` | `#a89984`    | secondary text                               |
| `ink-faint`                      | `#928374`    | metadata only, never body copy               |
| `accent` / `--primary`           | `#fe8019`    | the accent: primary actions, brand mark      |
| `accent-deep` / `--ring`         | `#d65d0e`    | focus ring, selection                        |
| `yellow`                         | `#fabd2f`    | staleness, warnings                          |
| `green`                          | `#b8bb26`    | diff additions, success                      |
| `red` / `--destructive`          | `#fb4934`    | diff deletions, destructive                  |
| `aqua` `blue` `purple`           | —            | artifact-side accents; chrome uses sparingly |

Each theme fills the same roles from its own upstream palette. The accent
is that palette's signature color (gruvbox orange, catppuccin mauve, rosé
pine iris/pine, tokyo night blue). In artifacts the accent keeps its
historical `--color-orange` name.

Surface hierarchy: chrome is **one flat plane**, with page, rail, and header
all sitting on `bg`, split by hairlines. The widget cards (`bg1`) are the
only elevated surface. Light themes spread their surface roles deliberately
(values still transcribed, roles repointed within the palette's own ramp):
the canvas takes a mid-neutral one step deeper and the cards keep the
palette's lightest tone, so widgets glow against the board instead of the
whole page collapsing into one near-white plane. Button labels take `bg1`
(each palette's brightest/most-neutral surface, full AA on every accent);
selection is a translucent accent wash under unchanged ink.

Borders are three graded tiers, not one value dimmed: `border-dim` splits the
flat plane (≥1.2:1 on `bg`/`bg1`), `border` edges objects that must read as
distinct — popovers, board cells, table head rules (≥1.5:1) — and
`border-strong` bounds the fill-less controls. Inputs, selects, checkboxes and
outline buttons carry no fill, so that hairline is the only thing identifying
them: it answers to WCAG 1.4.11 and clears 3:1 on both surfaces. Pick by what
the line is doing, not by how loud you want it; `theme.test.ts` holds every
theme to all three floors and to their ordering.

Strategy: **restrained**. Near-monochrome chrome, accent ≤10% of any
screen. Yellow/green/red appear only when they mean something (stale,
added, removed), and never carry 13px text alone: state text stays in the
ink roles while a tint wash, dot, or sign carries the tone (several light
palettes have no AA-clearing yellow/green for small text). Chrome code uses
tokens only; a literal hex breaks every non-default theme.

## Shape

Radius signals elevation, so only things that float carry it: dialogs,
popovers, menus, pills, and controls keep `--radius` (8px, and its `sm`/`md`
steps). **The widget frame is square.** A board cell has no fill — the
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

- Sans: Geist Variable (bundled via fontsource), for UI copy.
- Mono: Geist Mono Variable (bundled via fontsource; system mono fallback),
  for identifiers (slugs, repo names, cron expressions), timestamps, state
  labels, the wordmark. The mono is the brand voice. The wordmark and
  widget titles set in it are the most visible type in the app, so it is
  a designed face from the same family as the sans, never the viewer's
  terminal default.
- Rule of thumb: if git or the schema would care about the string, it's
  mono. The rule applies per string, not per slot: the rail's group heading
  and the account pill are sans when showing a display name ("Personal", a
  repo.yaml `name`, a GitHub name) and mono only when falling back to the
  repo name / login. Prose vs identifier is also what separates a heading
  tier from mono content rows when size alone is too subtle at 13px-vs-15px.
  The scale is set at the foundation by two Tailwind size tokens in
  `app.css` (`--text-sm`/`--text-xs`), one step above Tailwind's defaults:
  **body and interactive labels 15px (`text-sm`)** for nav items, buttons,
  the account name; **secondary labels and metadata 13px (`text-xs`)**, the
  floor for anything that carries data, including timestamps. One tier sits
  below it: **tracked UPPERCASE captions at 11px** (the rail's repo and
  section headers), navigational landmarks whose legibility comes from
  tracking, caps, and weight, never data carriers. Nothing else goes under
  13px. Section headings 16–18px (`text-base`/`text-lg`). No display sizes
  in chrome. Nav and other primary controls take body size, never the
  metadata floor.
- Widget title exception: the `widget-card` tile name is **mono, `text-base`
  (16px) semibold**, a deliberate break from sans-for-names. Each widget is a
  section of the page, so its name reads as a section heading that owns the top
  of the cell, not a faint label: it takes the 16px heading tier and a full
  semibold, a clear step in size, weight, and color (full `foreground`) above
  the 13px `ink-dim` freshness beside it, which stays quiet. With no card
  border by design, that heading plus the whitespace rhythm _is_ the block's
  separation. The lightbox header carries the same name in the same mono
  heading voice. State reads as pills in that same mono voice
  (`running`/`stale`/`manual`), never prose; a fresh tile carries no pill
  (semantic color only when it means something). In **edit mode** the tile
  bar deliberately shows the `slug`, not the name: editing is the machine
  view, where the bar is a drag handle over the routines.yaml entry being
  rearranged, so the identifier git cares about is the honest label there.
- Ledger rows are the opposite exception: the routine pool, the templates
  ledger, and the run history (`routines-view`, `routine-runs-view`) set
  **`text-xs` on the `<table>` and nothing per cell**, one 13px line box for
  every column. Two reasons, one structural and one about voice. Structurally,
  cells only align across a row if they share a line-height; a 13px link inside
  a 15px line box sits a few pixels low, and a table of those reads as drifting
  columns. In voice, a ledger row is one line of machine output, closer to
  `gh run list` than to a list of headings, so the row name takes the same 13px
  as the data beside it and earns its prominence from full `foreground` ink,
  medium weight, and the state dot leading it, against `ink-dim` peers. This is
  the "mono content rows" case the size rule above names: it is a data carrier
  at the 13px floor, not body copy. Layout follows the same discipline. Exactly
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

The logo is **the bow tie**: two accent wings and the ink knot at center —
the butler's uniform in three shapes. The cut is the **rounded butterfly**:
each wing's long edges bow gently outward where the fabric puffs, the outer
corners round off, and the outer edge folds back in a shallow concave notch
toward the knot; the knot's sides cinch inward where the wrap gathers the
fabric. The silhouette of a tied bow, not two chevrons — the straight-cut
trapezoids read as basic at hero size. The knot is the same block that ends
the wordmark, so the knot is ink.

The mark wears a **fixed identity**: it never follows the active theme. One
light colorway and one dark colorway, both drawn from the Flexoki rows of
the registry (the fresh-install default, ADR-0046), keyed on the mode class
alone. Dark: `#da702c`→`#bc5215` fold wings, `#cecdc3` knot, on a
`#1c1b1a`→`#100f0f` tile with a `#403e3c` border. Light: `#bc5215`→`#9d4310`
wings, `#100f0f` knot, `#fffcf0`→`#f2f0e5` tile, `#b7b5ac` border. The
single source is `MARK_IDENTITY` in `lib/theme.ts` (built from the
`flexoki-*` registry entries, so the no-invented-colors law holds);
`themeStylesheet()` emits it as `--mark-*` vars on `:root`/`.dark`, outside
every `[data-theme]` block, so no theme can re-color the tie.
`theme.test.ts` holds the identity wings and knot to ≥3:1 on every theme's
page and sidebar surfaces.

Depth is **material, not decorative** (terminal-calm bans gradient glass).
Each wing carries a fold gradient — brighter at the flared tip
(`--mark-wing-tip`), deeper where the fabric gathers at the knot
(`--mark-wing-fold`) — and, at display sizes, four fold creases radiate
from under the knot toward the wing corners (thin black strokes at 0.14,
sub-pixel noise below ~32px so chrome sizes omit them). The knot stays
solid ink; a gradient there would muddy it.

Symmetric and solid, the mark holds one geometry at every size, from the
16px favicon to the landing hero. Several mirrors must stay geometrically in
sync; the fills and framing differ by surface (context below), but never the
geometry. The wings tuck under the knot (drawn last) so the fills never show
a background hairline; framed contexts draw the tie's own contact shadow
first, so the bow sits on the surface instead of being painted into it.

Two framings, deliberately split. **In chrome** the mark is the bare glyph
(fold wings, ink knot, no tile) — a tile behind a chrome mark either
vanishes or punches a hole in the sidebar; glyph-only is the mark-in-chrome
treatment everywhere else (GitHub, Linear, Vercel). **On display surfaces**
(the landing hero, browser tab, OS launcher, social card, README lockup)
the mark wears the **product-icon chip**: the top-lit identity tile, a
bevel highlight, a crisp full border, the fold creases, and the tie's
contact shadow. The chip is what holds contrast on any ground; the bare
glyph floated on pale and gray tab strips. `favicon.svg` swaps the chip's
light/dark identity sets with a `prefers-color-scheme` block (flat fills,
since the fold is invisible at 16px); the `.ico` and OS launcher icons
can't media-query, so they bake the dark identity chip. Launcher sources
live at `scripts/icon.svg` (rounded, for apple-touch + `icon-{192,512}`)
and `scripts/icon-maskable.svg` (full-bleed dark, bow inside the ~80% safe
zone); regenerate every raster with `scripts/render-icons.sh` — the recipe
can't live in the SVG comments (XML comments may not contain the double
hyphens CLI flags are made of), and ImageMagick's SVG delegate is not
faithful to the gradients and filters, so the script renders through
headless Chrome. Static SVGs carry explicit `width`/`height` (favicon
renderers assume 300×150 and crop without them).

- `apps/web/app/components/logo.tsx`: `Logo` (mark) and `Wordmark`
  (mark + mono name lockup, scales with font size) for in-app use; both
  consume the fixed `--mark-*` identity vars, so only the mode changes the
  tie. `useId` keeps the gradient/filter ids unique across the
  header/rail/account-bar instances. Default is the bare glyph; the landing
  hero passes `display` for the chip (tile, bevel, border, creases, contact
  shadow) with a `.logo-tile` drop-shadow so it sits on the page. The chip
  is a still object — the old caret-blink (`live`) is retired; motion
  belongs to the board, where it means something.
- `apps/web/public/favicon.svg`: the browser-tab mark, the product-icon
  chip, identity sets swapped by a `prefers-color-scheme` style block
  inside the SVG. Flat fills, since the fold is invisible at 16px.
  `favicon.ico` (16/32/48, packed by `render-icons.sh` via ImageMagick from
  Chrome-rendered PNGs) is the raster fallback; .ico can't media-query, so
  it bakes the dark identity chip.
- `apps/web/public/apple-touch-icon.png` (180) + `icon-{192,512}.png`
  (`any`): the dark identity chip, rendered from `scripts/icon.svg`
  (rounded corners on transparent; iOS/Android re-mask).
- `apps/web/public/manifest.webmanifest` + `icon-maskable-512.png`
  (`maskable`, from `scripts/icon-maskable.svg`, full-bleed dark, bow
  scaled to ~0.82 so it survives a circle/squircle crop): the PWA/Android
  adaptive icon, so launchers build a real adaptive tile instead of masking
  apple-touch into a flat squircle. Linked from `root.tsx`;
  `theme_color`/`background_color` are the identity dark `#100f0f`.
- `apps/web/public/wordmark-{dark,light}.svg`: the identity chip + `Steward`
  lockup for the README, swapped by `prefers-color-scheme` in a
  `<picture>`. Mirrored to each data repo's `.github/` (built-in template +
  team/private repos). Text baseline `y=46.5` centers the word's cap band
  on the tile center, the measured optical alignment of the lockup. The
  word is **outlined paths** (Geist Mono 600, 40px, tracking −1) rather
  than a `<text>` node, because GitHub's image context can't load webfonts,
  so live text would render in the viewer's system mono instead of the
  brand face.
- `apps/web/public/og.png`: 1200×630 (@2x) social card in the light
  identity palette (flexoki-light); OG/Twitter meta lives in the home
  route's `meta`. One fixed image for every viewer, since OG previews can't
  theme-switch. Source is `scripts/og-card.html` (fonts resolve from the
  installed fontsource packages); rendered by `render-icons.sh`.

The wordmark text is `foreground` ink, mono, capitalized **`Steward`**; the
mark's wings carry the identity orange. (The logotype was lowercase
pre-rename; capitalized since the wordmark reads as the product noun
everywhere it appears.)

## Layout

- Dashboard grid: 4 columns desktop / 2 tablet / 1 phone, 150px row unit,
  12px gap (`.dash-grid` in app.css; placement via CSS custom properties).
  Below 4 columns, widgets render in visual (row, col) order so the stack
  reads like the full board.
- Chrome density: quiet but legible. Comfortable spacing and readable
  type, never cramped; the header is one slim row (`app-header` shell,
  shared by every route); panels use `gap-4`. The `NavShell` toolbar is
  `h-11` on desktop (the rail brand row's box, for an unbroken hairline) and
  relaxes to `h-12` below `lg`, where the wordmark steps up to `text-base`
  (the brand must not read smaller than the 16px widget titles) and a
  `· <slug>` mono wayfinding label joins it, since the rail isn't there to
  answer "where am I".
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
- Radius: `--radius: 0.5rem`; cards `rounded-lg`, small controls tighter.

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
