# Design

Visual system for Bulletin's app chrome. The palette is law: the theme
registry in `apps/web/app/lib/theme.ts` is the single source of every hex
(ADR-0009); `app.css` only aliases its runtime vars, the shadcn semantic
tokens alias those in turn (ADR-0008), and the `widget-artifact` skill
mirrors the canonical gruvbox row for artifacts (ADR-0007). No color may
exist that isn't in the registry.

## Theme

Themeable, dark by default. The user preference is a mode (`auto` follows
the OS, or pin `light`/`dark`) plus a theme per slot, set on `/settings`
and stored per device (ADR-0009). Scene: a developer's editor environment
in whichever palette they already live in — the board matches the terminal
next to it; widgets carry the color, chrome stays near-monochrome.

Curated registry (add themes there, with their contrast tests): Gruvbox,
Catppuccin, Rosé Pine, and Tokyo Night — light/dark families only; a theme
without a twin doesn't ship. **Gruvbox dark hard is canonical** — SSR
default and the palette artifacts are authored in; the dashboard injects
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

Each theme fills the same roles from its own upstream palette — the accent
is that palette's signature color (gruvbox orange, catppuccin mauve, rosé
pine iris/pine, tokyo night blue). In artifacts the accent keeps its
historical `--color-orange` name.

Strategy: **restrained** — near-monochrome chrome, accent ≤10% of any
screen. Yellow/green/red appear only when they mean something (stale,
added, removed). Chrome code uses tokens only; a literal hex breaks every
non-default theme.

## Typography

- Sans: Geist Variable (bundled via fontsource) — UI copy.
- Mono: `ui-monospace, "SF Mono", Menlo` — identifiers (slugs, repo names,
  cron expressions), timestamps, state labels, the wordmark.
- Rule of thumb: if git or the schema would care about the string, it's
  mono. The scale is set at the foundation by two Tailwind size tokens in
  `app.css` (`--text-sm`/`--text-xs`), one step above Tailwind's defaults:
  **body and interactive labels 15px (`text-sm`)** — nav items, buttons,
  the account name; **secondary labels and metadata 13px (`text-xs`)** — the
  floor, nothing smaller in chrome, including timestamps and group headings.
  Section headings 16–18px (`text-base`/`text-lg`). No display sizes in
  chrome. Nav and other primary controls take body size, never the metadata
  floor.
- Widget title exception: the `widget-card` tile name is **mono, `text-sm`
  (15px) medium** — a deliberate break from sans-for-names. The name is the
  board's two-second glance target, so it carries the terminal voice and sits
  a step above the 13px metadata beside it. State reads as pills in that same mono
  voice (`running`/`stale`/`manual`), never prose; a fresh tile carries no
  pill (semantic color only when it means something).
- Artifacts set their own type, one register bolder than chrome since they
  are the content that glows: body/data ≥14px, section labels ≥12px, nothing
  below 12px (the contract lives in `docs/widget-standard.md` §6 and the
  `widget-artifact` skill).

## Mark

The logo is a mini dashboard grid on a gruvbox tile: two widgets
(`ink-dim`, legible not faint) and one tall orange block — the wordmark's
trailing cursor (`bulletin▮`) placed as the last widget on the board. One
drawing, several mirrors that must stay geometrically in sync; the fills
differ by surface (context below), but never the geometry.

Two contexts, deliberately split. **In-app** the mark is chrome, so it
follows the active theme. **As an OS/browser icon** the mark is a fixed
dark identity tile — a tile has to hold its own on an unknown background
(a colorful launcher, a light or dark tab strip, a photo wallpaper), where
a near-white body would melt in and read as a placeholder, so it does _not_
theme-switch and does _not_ use the light palette. Canonical icon colors:
`#1d2021` tile, `#ebdbb2` widgets, `#fe8019` cursor (raised widget contrast
so all three shapes read at 16px; the frame stroke is dropped on icons
where it turns to mush).

- `apps/web/app/components/logo.tsx` — `Logo` (mark) and `Wordmark`
  (mark + mono name lockup, scales with font size) for in-app use; token-
  based, so it follows the active theme. Widgets are `muted-foreground`,
  the one frame that keeps its `border` stroke (rendered large enough).
- `apps/web/public/favicon.svg` — the browser-tab mark: one fixed dark
  tile, no frame, no `prefers-color-scheme` swap (see the split above).
  `favicon.ico` (16/32/48) is the raster fallback, generated from it.
- `apps/web/public/apple-touch-icon.png` (180) — iOS home screen: opaque,
  full-bleed dark, no self-rounding (iOS supplies the corner radius).
- `apps/web/public/manifest.webmanifest` + `icon-{192,512}.png` (`any`)
  and `icon-maskable-512.png` (`maskable`, mark inside the 66% safe zone)
  — the PWA/Android adaptive icon, so launchers build a real adaptive tile
  instead of masking apple-touch into a flat squircle. Linked from
  `root.tsx`; `theme_color`/`background_color` are the dark `#1d2021`.
- `apps/web/public/wordmark-{dark,light}.svg` — the mark + `bulletin`
  lockup for the README, swapped by `prefers-color-scheme` in a `<picture>`.
  These are a document context (a light or dark page), so they keep the
  theme pair; widgets are the palette's `ink-dim` for legibility.
- `apps/web/public/og.png` — 1200×630 (@2x) social card in the light
  (gruvbox-light) palette; OG/Twitter meta lives in the home route's
  `meta`. One fixed image for every viewer — OG previews can't theme-switch,
  so it stays light to match the default.

The wordmark text is `foreground` ink; the mark carries the orange. The
wordmark stays lowercase — a deliberate logotype, the one place lowercase
survives the Sentence-case chrome.

## Layout

- Dashboard grid: 4 columns desktop / 2 tablet / 1 phone, 150px row unit,
  12px gap (`.dash-grid` in app.css; placement via CSS custom properties).
  Below 4 columns, widgets render in visual (row, col) order so the stack
  reads like the full board.
- Chrome density: quiet but legible — comfortable spacing and readable
  type, never cramped; the header is one slim row (`app-header` shell,
  shared by every route); panels use `gap-4`.
- Page gutters: `px-4 sm:px-6` on every route container; `body` carries
  safe-area insets (`viewport-fit=cover`).
- Touch: the vendored button/select primitives carry `pointer-coarse:`
  size floors (roughly one Tailwind step up), so coarse pointers get
  usable targets while fine pointers keep the compact density. Header
  actions collapse to icons below `sm` (label goes `sr-only`).
- Dialogs: never override the base `max-w-*` (it is the phone edge
  margin) — widen with `sm:max-w-*`; tall content gets
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
entrance choreography — this is a glanceable tool. Honor
`prefers-reduced-motion` for anything added.

## Voice

Labels in Sentence case ("Ran 2h ago", "Never ran", "Sign out"); literal
machine strings stay verbatim (slugs, branch names, cron, shell commands).
The wordmark is the one deliberate lowercase logotype. Git words used
plainly: draft, diff, commit, PR, base. Empty states state
the fact and the next action in one line each — no cheerleading.

## Language

Chrome speaks English and Português (Brasil) — typed dictionaries in
`apps/web/app/locales/` (en.ts defines the key set), locale negotiated
server-side via cookie then `Accept-Language` (ADR-0009). Both locales
keep the same voice: Sentence-case labels, git vocabulary untranslated where
git would surface it (commit, PR, diff, slug). Widget artifacts are not
translated — routines write them.
