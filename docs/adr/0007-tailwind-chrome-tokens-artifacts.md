# Styling: Tailwind 4 for app chrome, raw tokens for artifacts

The app (dashboard grid, add-routine wizard, sync/diff panel) is a real
product UI; artifacts are self-contained HTML files rendered in sandboxed
iframes with **no build step and no network** — Tailwind is impossible there
regardless. We split accordingly, with one palette as the single source of
truth:

- **App chrome: Tailwind 4**, with `@theme` in `apps/web/app/app.css` bound
  to the gruvbox-dark-hard palette. Utilities (`bg-bg1`, `text-ink-dim`,
  `border-border-dim`, `text-orange`, …) are _generated from_ the tokens, so
  Tailwind never becomes a second design vocabulary.
- **Artifacts: plain CSS custom properties** — the same token names and
  values, inlined into each artifact by the `widget-artifact` skill (see
  `docs/widget-standard.md`).

## Considered options

- **Tailwind chrome + token artifacts (chosen)** — fast UI iteration, one
  palette, and the artifact contract stays dependency-free.
- **Vanilla CSS everywhere** — one language, but hand-rolled utility classes
  reappear as the UI grows (this repo's first scaffold went this way and was
  reversed within a day).
- **Tailwind everywhere** — impossible: artifacts can't run a build or load
  a CDN inside `sandbox="allow-scripts"` with no network.

## Consequences

- Changing the palette means editing the `@theme` block _and_ the token
  snippet in the `widget-artifact` skill — keep them identical; a lint-style
  check can enforce this once the skill exists.
- App chrome and widget content look native to each other by construction.
