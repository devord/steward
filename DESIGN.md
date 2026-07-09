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
  mono. Body 13–14px; metadata 10–12px mono; no display sizes in chrome.

## Mark

The logo is a mini dashboard grid on a gruvbox tile: two quiet widgets
(`border`) and one tall orange block — the wordmark's trailing cursor
(`bulletin▮`) placed as the last widget on the board. One drawing, three
mirrors that must stay geometrically in sync:

- `apps/web/app/components/logo.tsx` — `Logo` (mark) and `Wordmark`
  (mark + mono name lockup, scales with font size) for in-app use.
- `apps/web/public/favicon.svg` (+ `favicon.ico` 16/32/48,
  `apple-touch-icon.png`) — static favicons, linked from `root.tsx`.
- `apps/web/public/og.png` — 1200×630 social card; OG/Twitter meta lives
  in the home route's `meta`.

The wordmark text is `foreground` ink; the mark carries the orange.

## Layout

- Dashboard grid: 4 columns desktop / 2 tablet / 1 phone, 150px row unit,
  12px gap (`.dash-grid` in app.css; placement via CSS custom properties).
- Chrome density: compact — the header is one slim row; panels use `gap-4`.
- Radius: `--radius: 0.5rem`; cards `rounded-lg`, small controls tighter.

## Components

shadcn/ui vendored in `apps/web/app/components/ui/` (Base UI primitives,
`base-nova` style, cva variants). Domain components in
`apps/web/app/components/`: `widget-card` (artifact iframe + freshness
footer + edit controls), `add-routine-dialog`, `sync-panel` (YAML diff),
`appearance-settings` (mode + theme pickers), `logo` (mark + wordmark).
Add new primitives with `pnpm dlx shadcn@latest add <name>`.

## Motion

Purposeful and short (≤200ms, ease-out). Dialog/popover transitions come
from the vendored components (`tw-animate-css`). No scroll-driven or
entrance choreography — this is a glanceable tool. Honor
`prefers-reduced-motion` for anything added.

## Voice

Labels lowercase where natural ("ran 2h ago", "never ran", "sign out").
Git words used plainly: draft, diff, commit, PR, base. Empty states state
the fact and the next action in one line each — no cheerleading.

## Language

Chrome speaks English and Português (Brasil) — typed dictionaries in
`apps/web/app/locales/` (en.ts defines the key set), locale negotiated
server-side via cookie then `Accept-Language` (ADR-0009). Both locales
keep the same voice: lowercase labels, git vocabulary untranslated where
git would surface it (commit, PR, diff, slug). Widget artifacts are not
translated — routines write them.
