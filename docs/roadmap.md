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
`steward-data-<login>` from the template. Loaders fetch catalog/contracts
from the shared repo and config + artifacts from the user's data repo. Grid
renders widgets in sandboxed `srcdoc` iframes; "ran Xh ago" footers from
commit history; placeholder for never-published. Sample artifact at
`docs/samples/daily-plan.html` — hand-push it per the template README to
prove the render path.
**Risk retired 2026-07-09:** deployed to Vercel (project `steward`,
production `READY` from `main`, OAuth env vars live); the RR7 peer concern
didn't bite.

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
footer); drag-and-drop layout; multi-repo/org support via team dashboards
(ADR-0010: org team data repo, `data/dashboards/<slug>.yaml` layouts,
`/team/<slug>` routes, `runner:`-scoped `routines:sync`). Open backlog:
external/PIN-gated artifact sharing (second publish target), artifact
version browsing (free from git history), `instructionsFile:` for
long-form routine guidance, dashboard rename (today: delete + recreate),
dashboard display names in the switcher (today: slugs). "Run now" and the
`steward apply` CLI graduated into M6 (ADR-0016/0017).

## M6 — Hosts, manual runs, prompt-first ✅ (code)

Implements ADR-0012…0017 (built 2026-07-10):

- **Schema**: `host: cloud | local` (default cloud); `skill:` and
  `schedule:` optional (prompt-only / manual-only routines).
- **Hosts**: launchd half of `routines:sync` (plists per scheduled-local
  routine, orphan cleanup); manual-local routines enact nothing.
- **Prompt-first wizard**: textarea first, skill picker as accelerator.
- **Dispatcher**: `run-routine` handles prompt-only routines (no `skill:` →
  run `instructions` under the contract skills; bad `skill:` → hard fail);
  `packages/schema` keeps the `widget:` block schema but drops the
  catalog-file schema; stale "catalog/skills.json" comments and loader
  fetches go with it.
- **Template refresh**: `templates/data-repo` seeds gain the private-skill
  example, a manual-local example routine, and a header that no longer
  mentions the catalog.
- **Live skill discovery**: delete `scripts/gen-catalog.ts`,
  `catalog/skills.json`, the CI freshness check (and CLAUDE.md's
  `gen:catalog` step); picker reads `widget:` frontmatter via contents API
  from plugins + data repos, badged private/team.
- **Skill eviction**: `repo-pulse` → plugins repo; `daily-plan` →
  `templates/data-repo/.claude/skills/` as the private-skill example.
- **Manual runs**: API trigger on runner-owned cloud routines, trigger
  token committed to the data repo, server-side Update button authorized
  by the clicker's repo read access; copy-command fallback; staleness
  badge suppressed for manual routines.
- **Dry runs + launcher**: dry clause in `run-routine`/`publish-widget`
  (local tree in, local file out); `pnpm routine <slug> [--dry] [--repo]`.

Facts still to verify live (acceptance, alongside M4's): claude.ai
connectors under headless `claude -p` (launchd); plugins-repo install
inside the cloud routine environment (else the dispatcher's clone
fallback kicks in); whether a cloud routine can be created with **no
schedule at all** (API-trigger-only) or only via the web UI — sync's
apply prompt asks the schedule tooling and reports back; the fire API
endpoint/beta header shape (`ANTHROPIC_ROUTINES_BETA` overrides the
pinned value).

## M7 — Routine pool view ✅ (code)

Implements ADR-0025 (built 2026-07-12): a per-repo `Routines` surface at
`/r/:owner/:repo/routines` — the whole `routines.yaml` pool as one
terminal-calm table (state, schedule, host, owner, on-boards, claude.ai
link), surfacing orphan routines the board view can't show. Full actions
(edit, enable/disable, delete, run-now) over a repo-scoped routines draft
that reuses the board's Sync flow (`dashboardSlug` now optional on
`SyncPanel`/`/sync`); `Add to board` hands off to the board grid editor via
`?place=<slug>`. No standalone templates page (read-only by ADR-0022,
already in the picker).

## Watch items

- **GitHub API rate limit** (5k/h authed) — batch loader fetches, ETags.
- **Artifacts-branch growth** (~1 commit/run) — squash to depth 1 if it ever
  bites, at the cost of version browsing.
- **Cloud routine limits** — daily run caps (API-fired runs count too);
  local schedule / team runner runs the same pointer prompt when they bind.
- **Routines fire API is research preview** — surface verified 2026-07-10
  (`POST …/routines/{trigger-id}/fire`, `anthropic-version: 2023-06-01`,
  `anthropic-beta: experimental-cc-routine-2026-04-01`, token minting
  UI-only); `ANTHROPIC_ROUTINES_BETA` overrides the pinned header when it
  changes (ADR-0016).
- **Palette duplication** — `@theme` block vs the `widget-artifact` token
  snippet must stay identical (ADR-0007).
