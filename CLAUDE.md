# Bulletin

A dashboard of living widgets. Each widget renders an HTML artifact kept
fresh by a scheduled Claude Code routine. Two-repo model: this shared repo
holds the product; each user has a private `bulletin-data-<login>` repo
(config on `main`, artifacts on the `artifacts` branch at
`w/<slug>/index.html`).

**Read before designing or changing behavior:**

- [`CONTEXT.md`](./CONTEXT.md) — domain glossary (routine, widget, artifact,
  data repo, catalog, draft, sync). Use these terms exactly.
- [`docs/adr/`](./docs/adr/) — the architecture decisions. Don't re-litigate
  them silently; propose a new ADR to change one.
- [`docs/widget-standard.md`](./docs/widget-standard.md) — the artifact
  contract every routine must produce against.
- [`docs/roadmap.md`](./docs/roadmap.md) — milestone status and what's next.

## Layout

- `apps/web` — React Router v8 app (framework mode, SSR). GitHub OAuth,
  reads config/artifacts via the GitHub API, renders widgets in sandboxed
  `srcdoc` iframes. Tailwind 4; utilities come from the gruvbox `@theme`
  block in `app/app.css` (ADR-0007).
- `packages/schema` — zod schemas for `data/routines.yaml`,
  `data/dashboard.yaml`, and the skills catalog. Buildless: exports TS
  source, consumed by the app's bundler and by `tsx` scripts.
- `.claude/skills` — agent skills, including the `run-routine`,
  `widget-artifact`, and `publish-widget` contracts (M4).

## Toolchain

**Vite+** (`vp` CLI) with **pnpm**. From the repo root:

```bash
pnpm install
pnpm check        # vp check: oxlint + oxfmt + typecheck in one pass
pnpm test         # turbo run test (vitest per package)
pnpm build        # turbo run build
pnpm typecheck    # turbo run typecheck (includes react-router typegen)
pnpm dev          # apps/web dev server
```

After cloning: `pnpm exec lefthook install` (install scripts are blocked by
`ignoreScripts` in pnpm-workspace.yaml).

## Conventions

- Formatting/linting live in the root `vite.config.ts` (oxfmt: no semis,
  double quotes, trailing commas; oxlint: no type assertions in production
  code). Never hand-fix style — run `vp check --fix`.
- Widget artifacts follow `docs/widget-standard.md`: self-contained
  responsive HTML, no external requests, gruvbox tokens (same set as
  `apps/web/app/app.css`).
- After touching skills, regenerate `catalog/skills.json`
  (`pnpm gen:catalog`, lands in M1). Never hand-edit the catalog.
- The `.claude/skills/react-router` skill docs are vendored from the
  upstream template — excluded from formatting, don't edit them.
