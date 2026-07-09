# Design

Visual system for Bulletin's app chrome. The palette is law: gruvbox dark
hard, defined once in the `@theme` block of `apps/web/app/app.css` and
mirrored byte-for-byte by the `widget-artifact` skill for artifacts
(ADR-0007). The shadcn semantic tokens are an alias layer over it
(ADR-0008) — no color may exist that isn't in the `@theme` palette.

## Theme

Dark only. `color-scheme: dark`, static `dark` class on `<html>`. Scene:
a developer's dark editor environment; the board is glanced at, widgets
carry the color, chrome stays near-monochrome.

## Color

Palette (gruvbox dark hard):

| Token                            | Value     | Role                                         |
| -------------------------------- | --------- | -------------------------------------------- |
| `bg` / `--background`            | `#1d2021` | page                                         |
| `bg1` / `--card`                 | `#282828` | widget cards, panels                         |
| `bg2` / `--muted`                | `#32302f` | edit-mode surfaces, wells                    |
| `bg3` / `--secondary`            | `#3c3836` | hover fills, secondary controls              |
| `border` / `--border`            | `#504945` | strong borders, inputs                       |
| `border-dim`                     | `#3c3836` | hairlines inside cards                       |
| `ink` / `--foreground`           | `#ebdbb2` | body text                                    |
| `ink-dim` / `--muted-foreground` | `#a89984` | secondary text                               |
| `ink-faint`                      | `#928374` | metadata only, never body copy               |
| `orange` / `--primary`           | `#fe8019` | the accent: primary actions, brand mark      |
| `orange-deep` / `--ring`         | `#d65d0e` | focus ring, selection                        |
| `yellow`                         | `#fabd2f` | staleness, warnings                          |
| `green`                          | `#b8bb26` | diff additions, success                      |
| `red` / `--destructive`          | `#fb4934` | diff deletions, destructive                  |
| `aqua` `blue` `purple`           | —         | artifact-side accents; chrome uses sparingly |

Strategy: **restrained** — near-monochrome chrome, orange ≤10% of any
screen. Yellow/green/red appear only when they mean something (stale,
added, removed).

## Typography

- Sans: Geist Variable (bundled via fontsource) — UI copy.
- Mono: `ui-monospace, "SF Mono", Menlo` — identifiers (slugs, repo names,
  cron expressions), timestamps, state labels, the wordmark.
- Rule of thumb: if git or the schema would care about the string, it's
  mono. Body 13–14px; metadata 10–12px mono; no display sizes in chrome.

## Layout

- Dashboard grid: 4 columns desktop / 2 tablet / 1 phone, 150px row unit,
  12px gap (`.dash-grid` in app.css; placement via CSS custom properties).
- Chrome density: compact — the header is one slim row; panels use `gap-4`.
- Radius: `--radius: 0.5rem`; cards `rounded-lg`, small controls tighter.

## Components

shadcn/ui vendored in `apps/web/app/components/ui/` (Base UI primitives,
`base-nova` style, cva variants). Domain components in
`apps/web/app/components/`: `widget-card` (artifact iframe + freshness
footer + edit controls), `add-routine-dialog`, `sync-panel` (YAML diff).
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
