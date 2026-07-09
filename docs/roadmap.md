# Roadmap

Milestones toward the first end-to-end loop. Architecture behind these is in
[`docs/adr/`](./adr/); domain language in [`CONTEXT.md`](../CONTEXT.md).

## M0 — Scaffold ✅

pnpm + Turborepo workspace, Vite+ tooling (oxlint/oxfmt/vitest), TypeScript 7,
lefthook, CI. React Router v8 app (SSR, Vercel preset env-guarded), Tailwind 4
bound to the gruvbox tokens, `packages/schema` with the routine/dashboard
schemas. Verified: TS7 runs RR8 typegen cleanly.

## M1 — Schema + catalog

`yaml` parse/serialize in `packages/schema`; catalog schema incl. the
`widget:` frontmatter block; `scripts/gen-catalog.ts`; two seed routine
skills with `widget:` blocks; CI catalog-freshness check; seed
`data/*.yaml` in the data-repo template.

## M2 — Auth + data-repo bootstrap + read-only dashboard

GitHub OAuth (ADR-0004), session cookie, first-run wizard creating
`bulletin-data-<login>` from the template. Loaders fetch catalog/contracts
from the shared repo and config + artifacts from the user's data repo. Grid
renders widgets in sandboxed `srcdoc` iframes; "ran Xh ago" footers from
commit history; placeholder for never-published. Hand-author and hand-push
one sample artifact to prove the render path before any agent writes one.
**Risk to retire here:** first Vercel deploy — `@vercel/react-router` still
peers on RR 7.

## M3 — Editing + sync

Add-routine wizard (skill from catalog → name + slug → size → schedule
presets), grid layout editing (arrows/dropdowns first, drag-and-drop later),
localStorage drafts, Sync panel with YAML diff → commit or PR (ADR-0003),
stale-base conflict detection.

## M4 — Execution loop end-to-end

`run-routine`, `widget-artifact`, `publish-widget` skills;
`scripts/routines-sync.ts`. Acceptance: schedule `daily-plan`, watch the
widget refresh in the deployed app with no manual step (ADR-0005).

## M5 — Polish / v2 backlog

Staleness badge (now − last run vs schedule interval), "Run now",
`bulletin apply` CLI, external/PIN-gated artifact sharing (second publish
target), multi-repo/org support, artifact version browsing (free from git
history), `instructionsFile:` for long-form routine guidance.

## Watch items

- **GitHub API rate limit** (5k/h authed) — batch loader fetches, ETags.
- **Artifacts-branch growth** (~1 commit/run) — squash to depth 1 if it ever
  bites, at the cost of version browsing.
- **Cloud routine limits** — daily run caps; local schedule / team runner
  runs the same pointer prompt when they bind.
- **Palette duplication** — `@theme` block vs the `widget-artifact` token
  snippet must stay identical (ADR-0007).
