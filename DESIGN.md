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

Curated registry (add themes there, with their contrast tests): Gruvbox,
Catppuccin, Rosé Pine, and Tokyo Night, in light/dark families only; a theme
without a twin doesn't ship. **Gruvbox dark hard is canonical**: it is the
SSR default, and artifacts are authored in it. The dashboard injects
the active theme into artifact iframes at render time.

## Color

Token roles, one set per theme (values below are the canonical
gruvbox-dark row of the registry):

| Token                            | gruvbox-dark | Role                                         |
| -------------------------------- | ------------ | -------------------------------------------- |
| `bg` / `--background`            | `#1d2021`    | page                                         |
| `bg1` / `--card`                 | `#282828`    | widget cards, panels                         |
| `bg2` / `--muted`                | `#32302f`    | edit-mode surfaces, wells                    |
| `bg3` / `--secondary`            | `#3c3836`    | hover fills, secondary controls              |
| `border` / `--border`            | `#504945`    | strong borders, inputs                       |
| `border-dim`                     | `#3c3836`    | hairlines inside cards                       |
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

Strategy: **restrained**. Near-monochrome chrome, accent ≤10% of any
screen. Yellow/green/red appear only when they mean something (stale,
added, removed), and never carry 13px text alone: state text stays in the
ink roles while a tint wash, dot, or sign carries the tone (several light
palettes have no AA-clearing yellow/green for small text). Chrome code uses
tokens only; a literal hex breaks every non-default theme.

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

The logo is **the bow tie**: two wings in the theme's accent, and the ink
knot at center. The wings carry the brand color. With the accent confined to
the old small knot the whole mark washed out muted, worst in light themes
whose accents are dark. The knot is the same block that ends the wordmark,
and a terminal caret takes the foreground color, so the knot is ink.

Depth is **material, not decorative** (terminal-calm bans gradient glass).
Each wing carries a fold gradient, brighter at the flared tip and deeper
where the fabric gathers at the knot, so the wings read as folded fabric
rather than two flat chevrons. The stops are
`--mark-wing-tip` → `--mark-wing-fold`, aliases that swap which accent is
the bright one per mode (a light palette's `accent` is the deep rust, its
`accent-deep` the brighter orange). The knot stays solid ink; a gradient
there would muddy it.

Symmetric and solid, the mark holds one geometry at every size, from the
16px favicon to the landing hero. Several mirrors must stay geometrically in
sync; the fills and framing differ by surface (context below), but never the
geometry. The wings tuck under the knot (drawn last) so the fills never show
a background hairline; framed contexts draw the tie's own contact shadow
first, so the bow sits on the surface instead of being painted into it.

Two contexts, deliberately split. **In-app** the mark is chrome: the bare
glyph in theme tokens (fold wings, ink knot, no tile). A tile behind a
chrome mark either vanishes (light themes: `card` on `bg`) or punches a
darker hole in the sidebar (dark themes); glyph-only is the mark-in-chrome
treatment everywhere else (GitHub, Linear, Vercel). **On every uncontrolled
surface** (browser tab, OS launcher, social card, README lockup) the mark
wears the **product-icon chip**: a top-lit tile (`card`→`bg`), a crisp full
`border`, a bevel highlight, and the tie's contact shadow. The chip is what
holds contrast on any ground; the bare glyph floated on pale and gray tab
strips. `favicon.svg` swaps the chip's tile + inks with a
`prefers-color-scheme` block (flat fills, since the fold is invisible at
16px); the `.ico` and OS launcher icons can't media-query, so they bake the
fixed **dark identity chip** (`#282828`→`#1d2021` tile, `#fe8019`→`#d65d0e`
fold wings, `#ebdbb2` knot). Launcher sources live at `scripts/icon.svg`
(rounded, for apple-touch + `icon-{192,512}`) and `scripts/icon-maskable.svg`
(full-bleed dark, bow inside the ~80% safe zone); each carries its
headless-Chrome render recipe, since ImageMagick's SVG delegate is not
faithful to the gradients and filters. Static SVGs carry explicit
`width`/`height` (favicon renderers assume 300×150 and crop without them).

- `apps/web/app/components/logo.tsx`: `Logo` (mark) and `Wordmark`
  (mark + mono name lockup, scales with font size) for in-app use; token-
  based, so it follows the active theme. Wings take the fold gradient
  (`--mark-wing-tip`→`--mark-wing-fold`), the knot `foreground`; `useId`
  keeps the gradient/filter ids unique across the header/rail/account-bar
  instances. Default is the bare glyph; the landing hero passes `display`
  for the chip, a `card`→`bg` tile, full `border`, and the tie's contact
  shadow, with a `.logo-tile` drop-shadow so it sits on the page. `live`
  blinks the knot like a terminal caret (landing only).
- `apps/web/public/favicon.svg`: the browser-tab mark, the product-icon
  chip, tile + inks swapped by a `prefers-color-scheme` style block inside
  the SVG (light: `#f9f5d7` tile / `#d65d0e` wings / `#3c3836` knot; dark:
  `#282828` / `#fe8019` / `#ebdbb2`). Flat fills, since the fold is invisible
  at 16px. `favicon.ico` (16/32/48) is the raster fallback; .ico can't
  media-query, so it bakes the dark identity chip.
- `apps/web/public/apple-touch-icon.png` (180) + `icon-{192,512}.png`
  (`any`): the dark identity chip, opaque, rendered from `scripts/icon.svg`
  (rounded corners on transparent; iOS/Android re-mask).
- `apps/web/public/manifest.webmanifest` + `icon-maskable-512.png`
  (`maskable`, from `scripts/icon-maskable.svg`, full-bleed dark, bow
  scaled to ~0.82 so it survives a circle/squircle crop): the PWA/Android
  adaptive icon, so launchers build a real adaptive tile instead of masking
  apple-touch into a flat squircle. Linked from `root.tsx`;
  `theme_color`/`background_color` are the dark `#1d2021`.
- `apps/web/public/wordmark-{dark,light}.svg`: the mark (chip: fold wings,
  contact shadow, bevel, `border`) + `Steward` lockup for the README,
  swapped by `prefers-color-scheme` in a `<picture>`. These are a document
  context (a light or dark page), so they keep the theme pair. Mirrored to
  each data repo's `.github/` (built-in template + team/private repos).
  Text baseline `y=46.5` centers the word's cap band on the tile center,
  the measured optical alignment of the lockup. The word is **outlined
  paths** (Geist Mono 600, 40px, tracking −1) rather than a `<text>` node,
  because GitHub's image context can't load webfonts, so live text would
  render in the viewer's system mono instead of the brand face.
- `apps/web/public/og.png`: 1200×630 (@2x) social card in the light
  (gruvbox-light) palette; OG/Twitter meta lives in the home route's
  `meta`. One fixed image for every viewer, since OG previews can't
  theme-switch, so it stays light to match the default. Source is
  `scripts/og-card.html` (fonts resolve from the installed fontsource
  packages; the render command is in its header comment).

The wordmark text is `foreground` ink, mono, capitalized **`Steward`**; the
mark's wings carry the orange. (The logotype was lowercase pre-rename;
capitalized since the wordmark reads as the product noun everywhere it
appears.)

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
  margin). Widen with `sm:max-w-*`; tall content gets
  `max-h-[85svh]` + a scrollable middle.
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
