# Appearance preferences: multi-theme chrome and a language cookie

The board grew a settings page: theme (mode + palette) and language. Both
are **device preferences, not data** — they describe how one browser shows
the board, so they deliberately stay out of the data repo (ADR-0001 governs
state; this is chrome).

## Theme

The palette stops being a single hard-coded gruvbox block. The registry in
`apps/web/app/lib/theme.ts` is now the single source of truth: a curated set
of light/dark families — Gruvbox, Catppuccin, Rosé Pine, Tokyo Night,
GitHub, Flexoki, Kanagawa — each member filling the same token roles
DESIGN.md defines. Only complete families ship: every theme has a twin, so
the family tiles cover the whole registry. A candidate qualifies only if
its light variant is official upstream _and_ both members clear the
contrast floors below from transcribed values — Solarized and Ayu were
evaluated and rejected on that second test.

**Gruvbox dark hard remains canonical**: the server renders it, artifacts
are authored in it, and it is the fresh-install dark default.

Mechanics:

- `root.tsx` serves the registry as an inline stylesheet — `--palette-*`
  custom properties on `:root` (the default) plus one `[data-theme]` block
  per theme. `app.css` only aliases those vars (Tailwind palette utilities
  and the shadcn semantic layer), so ADR-0008's rule survives verbatim: no
  color may exist that isn't in the registry.
- The preference is Flow's appearance model: `mode` (`system`/`light`/
  `dark`) plus a light-slot and a dark-slot theme, stored as JSON in
  `localStorage["bulletin-appearance"]`. A tiny blocking script stamps
  `data-theme` and the `.dark` class before first paint — no flash; SSR
  markup carries the default and `suppressHydrationWarning` absorbs the
  re-stamp.
- Borders are three graded tiers, each with its own floor: `border-dim`
  splits the flat plane (≥ 1.2:1 on `bg` and `bg1`), `border` edges objects
  that must read as distinct — popovers, board cells, table head rules
  (≥ 1.5:1) — and `border-strong` bounds the fill-less controls. Inputs,
  selects, checkboxes and outline buttons are `bg-transparent`, so that
  hairline is the only thing identifying the control: WCAG 1.4.11 applies
  and the floor is 3:1 on both surfaces. `--input` points at `border-strong`,
  not `border`, which is the distinction the original mapping missed.
  Light palettes ship shallow neutral ramps, so every light theme's `border`
  had landed one step from its own canvas — kanagawa-lotus at 1.16:1, a line
  you cannot see — and no test caught it because none existed. Each is
  repointed one step down its own ramp, cascading the old `border` into
  `border-dim`; all values stay transcribed. Lotus is the one theme whose
  ramp is too compressed to grade cleanly, so its `border-dim` lands heavier
  than its siblings' (1.95:1), and its border tiers take lotusGray3/2 rather
  than the nearer lotusBlue3 — a blue hairline on that khaki canvas reads as
  a different theme.
- Per-theme AA: where an upstream palette's dim/faint ink misses WCAG on
  its own canvas, the role is repointed to the nearest AA-clearing tone
  from the same palette family. `theme.test.ts` enforces the ratios for
  every theme (body ≥ 4.5:1, metadata ≥ 3:1, button text ≥ 4.4:1). The
  button floor is 4.4, not 4.5, for one accepted residual: Catppuccin
  Latte's mauve accent tops out at ≈4.48:1 against every palette-true
  text tone (its own base is the best pairing; no Latte accent clears
  4.5), and inventing an off-palette ink would break the registry rule.

**Artifacts stay gruvbox at rest.** Published widgets inline the canonical
palette as `--color-*` custom properties (docs/widget-standard.md); the
`widget-artifact` skill is unchanged. At render time the dashboard appends
a `<style>` overriding those same names inside each srcdoc iframe, so
widgets follow the active theme without republishing anything. The default
theme injects nothing. A non-default theme reloads each iframe once after
hydration (srcdoc swap — local, no network).

## Language

English and Português (Brasil), dictionaries in `apps/web/app/locales/`
(flat typed keys; `en.ts` defines the set, other locales must fill it).
The locale must be server-visible — SSR renders translated markup and
`<html lang>` — so it travels as a plain cookie (`bulletin_locale`, one
year), negotiated cookie → `Accept-Language` → `en`. The settings action
sets the cookie; the root loader revalidates and the whole app re-renders.
Not the auth session cookie: language must work anonymously too.

Widget artifacts are **not** translated — they speak whatever their routine
writes. The settings page says so.

## Considered options

- **Store preferences in the data repo** — rejected: they're per-device
  (the office monitor can be light while the laptop is dark), and writing
  chrome preferences as commits would pollute the config history.
- **Cookie for the theme too** — rejected: `system` mode needs
  `prefers-color-scheme`, which the server never sees; the pre-paint script
  is required anyway, so localStorage keeps one source of truth.
- **i18next** — rejected for now: two locales and ~90 keys don't justify a
  runtime dependency; the typed dictionary keeps missing keys a compile
  error.
- **Re-publishing artifacts per theme** — rejected: the artifact contract
  stays single-palette; injection re-themes for free and old artifacts keep
  working.

## Consequences

- Adding a theme = one registry entry (plus its contrast test run). Adding
  a language = one dictionary file + one `LOCALE_OPTIONS` entry.
- The `@theme` block in `app.css` no longer carries hexes; anyone reading
  DESIGN.md's palette table is reading the gruvbox-dark row of the
  registry.
- Chrome code must keep using palette/semantic tokens only — a literal hex
  in a component now breaks every non-default theme silently. (The status
  colors `yellow/green/red/…` are per-theme slots, safe to use.)
