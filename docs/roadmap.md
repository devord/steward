# Roadmap

Milestones toward the first end-to-end loop. Architecture behind these is in
[`docs/adr/`](./adr/); domain language in [`CONTEXT.md`](../CONTEXT.md).

## M0 — Scaffold ✅

pnpm + Turborepo workspace, Vite+ tooling (oxlint/oxfmt/vitest), TypeScript 7,
lefthook, CI. React Router v8 app (SSR, Vercel preset env-guarded), Tailwind 4
bound to the gruvbox tokens, `packages/schema` with the routine/dashboard
schemas. Verified: TS7 runs RR8 typegen cleanly.

## M1 — Schema + catalog ✅

`yaml` parse/serialize in `packages/schema`; catalog schema incl. the
`widget:` frontmatter block; `scripts/gen-catalog.ts`; two seed routine
skills (`daily-plan`, `repo-pulse`) with `widget:` blocks; CI
catalog-freshness check; seed `data/*.yaml` in `templates/data-repo/`.

## M2 — Auth + data-repo bootstrap + read-only dashboard ✅

GitHub OAuth (ADR-0004), session cookie, first-run wizard creating
`bulletin-data-<login>` from the template. Loaders fetch catalog/contracts
from the shared repo and config + artifacts from the user's data repo. Grid
renders widgets in sandboxed `srcdoc` iframes; "ran Xh ago" footers from
commit history; placeholder for never-published. Sample artifact at
`docs/samples/daily-plan.html` — hand-push it per the template README to
prove the render path.
**Risk still open:** first Vercel deploy — `@vercel/react-router` still
peers on RR 7; needs a real deploy with OAuth env vars to retire.

## M3 — Editing + sync ✅

Add-routine wizard (skill from catalog → name + slug → size → schedule
presets), grid layout editing (arrows/dropdowns first, drag-and-drop later),
localStorage drafts, Sync panel with YAML diff → commit or PR (ADR-0003),
stale-base conflict detection. App chrome moved to shadcn/Base UI + cva
(ADR-0008).

## M4 — Execution loop end-to-end ✅ (code)

`run-routine`, `widget-artifact`, `publish-widget` skills;
`scripts/routines-sync.ts` (plan by default, `--apply` drives a headless
claude run). Acceptance still to run live: schedule `daily-plan`, watch the
widget refresh in the deployed app with no manual step (ADR-0005) — needs
the deployed app plus a data repo on a real account.

## M5 — Polish / v2 backlog

Done: staleness badge (now − last run vs schedule interval, on the widget
footer). Open backlog: "Run now", `bulletin apply` CLI (deferred until the
Sync panel's download escape hatch proves annoying, ADR-0003),
external/PIN-gated artifact sharing (second publish target), multi-repo/org
support, artifact version browsing (free from git history),
`instructionsFile:` for long-form routine guidance, drag-and-drop layout.

## Watch items

- **GitHub API rate limit** (5k/h authed) — batch loader fetches, ETags.
- **Artifacts-branch growth** (~1 commit/run) — squash to depth 1 if it ever
  bites, at the cost of version browsing.
- **Cloud routine limits** — daily run caps; local schedule / team runner
  runs the same pointer prompt when they bind.
- **Palette duplication** — `@theme` block vs the `widget-artifact` token
  snippet must stay identical (ADR-0007).
