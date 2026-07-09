# Bulletin

Dashboard of living widgets: each renders an HTML artifact kept fresh by a
scheduled Claude Code routine. Two repos: this one (product, shared) + one
private `bulletin-data-<login>` per user (config on `main`, artifacts on
`artifacts` branch at `w/<slug>/index.html`).

Read before changing behavior:

- `CONTEXT.md` — domain glossary. Use its terms exactly.
- `docs/adr/` — architecture decisions. Change via new ADR, never silently.
- `docs/widget-standard.md` — artifact contract.
- `docs/roadmap.md` — milestone status.

## Layout

- `apps/web` — React Router v8, SSR. GitHub OAuth; config/artifacts via
  GitHub API; widgets in sandboxed `srcdoc` iframes. Tailwind 4 utilities
  generated from the gruvbox `@theme` in `app/app.css` (ADR-0007).
- `packages/schema` — zod schemas (routines / dashboard / catalog).
  Buildless, exports TS source.
- `.claude/skills` — agent skills incl. `run-routine` / `widget-artifact` /
  `publish-widget` contracts (M4).

## Commands

Vite+ (`vp`) + pnpm, from repo root:

```bash
pnpm install && pnpm exec lefthook install  # once; ignoreScripts blocks auto-setup
pnpm check                                  # oxlint + oxfmt + typecheck
pnpm test / build / typecheck / dev
```

## Rules

- Never hand-fix style — `vp check --fix`. Config lives in root
  `vite.config.ts`.
- Artifacts: self-contained responsive HTML, no external requests, gruvbox
  tokens (same set as `apps/web/app/app.css`).
- Touched skills → regenerate `catalog/skills.json` (`pnpm gen:catalog`,
  lands M1). Never hand-edit it.
- `.claude/skills/react-router` is vendored — don't edit, format-exempt.

## Plan Mode

- Plans extremely concise; sacrifice grammar for concision.
- End each plan with unresolved questions to answer, if any.
