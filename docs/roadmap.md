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
`docs/samples/daily-plan.html`; hand-push it per the template README to
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

`run-routine`, `widget-artifact`, `publish-widget` skills; the `steward` CLI
(`packages/cli`, published as `@devord/steward`, ADR-0036). `sync` plans by
default, `--apply` drives a headless claude run. Acceptance still to run live:
schedule `daily-plan`, watch the widget refresh in the deployed app with no
manual step (ADR-0005). Needs the deployed app plus a data repo on a real
account.

## M5 — Polish / v2 backlog

Done: staleness badge (now − last run vs schedule interval, on the widget
footer); drag-and-drop layout; multi-repo/org support via team dashboards
(ADR-0010: org team data repo, `data/dashboards/<slug>.yaml` layouts,
`/team/<slug>` routes, `runner:`-scoped `routines:sync`); template preview
in the add-routine picker (ADR-0037: built-ins reuse their `docs/samples/`
archetype, repo templates a `templates/routines/<id>.sample.html` sibling);
artifact version browsing + compare on the routine detail view (ADR-0038),
where each run's receipt reopens its render, two compare side by side, and
the text diff stays on GitHub. Open backlog:
external/PIN-gated artifact sharing (second publish target),
`instructionsFile:` for long-form routine guidance, dashboard rename
(today: delete + recreate), dashboard display names in the switcher
(today: slugs). "Run now" and the `steward apply` CLI graduated into M6
(ADR-0016/0017).

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
schedule at all** (API-trigger-only) or only via the web UI, where sync's
apply prompt asks the schedule tooling and reports back; the fire API
endpoint/beta header shape (`ANTHROPIC_ROUTINES_BETA` overrides the
pinned value).

## M7 — Routine pool view ✅ (code)

Implements ADR-0025 (built 2026-07-12): a per-repo `Routines` surface at
`/r/:owner/:repo/routines`: the whole `routines.yaml` pool as one
terminal-calm table (state, schedule, host, owner, on-boards, claude.ai
link), surfacing orphan routines the board view can't show. Full actions
(edit, enable/disable, delete, run-now) over a repo-scoped routines draft
that reuses the board's Sync flow (`dashboardSlug` now optional on
`SyncPanel`/`/sync`); `Add to board` hands off to the board grid editor via
`?place=<slug>`. No standalone templates page (read-only by ADR-0022,
already in the picker).

## M8 — Artifacts are compiled, not transcribed ✅ (code)

Implements ADR-0050 (built 2026-07-30). The design language stopped being
prose an agent imitates and became `packages/artifact-kit/`: routines emit a
`data.json` against `widget-artifact/kit/CONTRACT.md`, and a committed,
dependency-free `render.mjs` emits the file. **All 11 routine templates
migrated**, across the built-ins and both data repos.

The prose layer retired behind them: `design.md` 2,019 → 95 lines (composition
judgment only), `widget-artifact/SKILL.md` 451 → 141, `validate.mjs` 735 → 263
with its 30 false warnings per artifact gone, and the three hand-kept
42–70 KB sample artifacts replaced by picker previews CI renders from archetype
fixtures. `docs/widget-standard.md`'s full-view width contradiction — two live
documents disagreeing since 2026-07-14 — resolved to shrink-to-fit with the
surplus as one trailing right gutter, which is what the kit's `<table>` already
did.

Still open: the visual-regression gate over the live corpus (ADR-0050 names it
as the mitigation for injected CSS reaching published artifacts; deferred on
the strength of the fix-vs-restructure rule, which is a discipline rather than
a mechanism), and whether a data repo can ship its own kit components.

## M9 — Steward can see its own failures ✅ (code)

Implements ADR-0059 (built 2026-08-03). `apps/web` reports to Sentry — errors,
tracing on both sides in one distributed trace, Logs, and Replay on error
only. Scope is the web app: the CLI runs on other people's machines and cloud
routines have no guaranteed egress.

Rollout is config, not code: no `SENTRY_DSN` and the SDK never initializes and
the browser never downloads it, so local dev and PR previews are inert by
construction; the sample-rate table keyed on `VERCEL_ENV` fails closed behind
it. Every event names the viewer's GitHub login and the Steward nouns —
`data_repo`, `dashboard`, `routine` — derived once in root middleware. The
session cookie is a GitHub token (ADR-0004), so cookies, the `authorization`
header and query strings are refused twice over.

The load-bearing addition beyond "we added Sentry": the **degrade** path logs.
A thrown `Response` is control flow to React Router, so the whole class was
invisible to error reporting — and it is where the rate-limit watch item below
would surface. Transient failures are now Logs (`[degrade]`), never Issues; a
dead token stays silent.

Accepted blind spots: artifact JavaScript cannot report (opaque-origin
`srcdoc` iframes, ADR-0002/0028 working as designed) and Replay will not
record widget content. Still open: the Sentry project itself is provisioned by
hand — org/project slugs and the DSN are dashboard steps, and until they exist
every environment is inert.

## M10 — Data separates from views 🔜 (ADR-0060/0061/0062)

The welded routine-artifact-widget splits into four entities with one job
each: a **routine** produces **datasets**, a **view** is a data-less
composition of kit components with binding slots, and a **widget** is that
view placed with its slots filled. The board injects the data at render time,
the way it already injects the theme and `kit.css`. ADR-0050 moved
presentation into the kit and then welded it back to the data at publish; this
takes the weld out, so a kit fix reaches every widget on next page load
instead of only the ones whose routines have rerun since.

Sequenced data-first, for one reason: **history you have not started
collecting is lost forever.** Everything else here costs the same next month.

1. **Datasets, write-only.** `produces:` on the routine and in template
   frontmatter (`shape` + `kind`); `publish-widget` commits
   `d/<name>.json` plus a dated partition _beside_ today's artifact. Nothing
   reads them. Also closes a contradiction already at HEAD — `prior-run` says
   `data.json` and `state.json` ride in the publish commit; `publish-widget`
   writes only the HTML.
2. **Dataset detail view, read-only.** Current snapshot, partition list,
   producer, schedule, last run, Update. Load-bearing rather than nice: once
   routines stop rendering, this is a gatherer's only glanceable evidence that
   it ran (the ADR-0026 trust argument, rehoused).
3. **Kit browser runtime + broker**, injected like `kit.css`, version-pinned
   per view stamp. `data.read`, `data.history`, and `routines.trigger` scoped
   to the view's declared bindings. No writes. Proved on one widget.
4. **Views, slots, widget bindings.** `views/<name>.html` on `main`; the
   `widget:` block splits (work half stays on the gather template, presentation
   half moves to the view); `category` moves to the view; dashboard entries
   gain `view:` + `bind:`. One view, one board.
5. **Migrate the fleet.** `w/` retires, `artifacts` freezes as the historical
   record, `datasets` begins as a new orphan branch. Re-point ADR-0035's rail
   read path (one commits call, now keyed to data commits) and ADR-0038's
   version browsing (a version becomes `view × partition`). Dry runs move onto
   the bake path, which is the same SSR the external-sharing backlog needs.

Prose survives the split by being data: a **synthesis routine** gathers
nothing, reads datasets and writes a **judgement** carrying the figures it
cites plus a manifest of the partitions it read (ADR-0062). Views never invoke
a model. Widgets that look narrated are often only _derived_ — `corza-risk`'s
drivers are thresholds against fixed text — and sorting rules from judgements
before migrating is where the real saving is.

Deferred deliberately: the raw-partition retention horizon (choose it against
real run frequencies, not by guessing), partition retraction, row-level
correction as a separate annotations dataset, derived rollups as a
recomputable cache, and a template shipping a producer _and_ a default
placement so the simple case stays one step.

## Watch items

- **GitHub API rate limit** (5k/h authed): batch loader fetches, ETags.
- **Artifacts-branch growth** (~1 commit/run): squash to depth 1 if it ever
  bites, at the cost of version browsing. M10 changes both sides of this: a
  partition per run is more bytes, but history moves into the tree, so a
  squash stops destroying it (ADR-0061). Growth is linear — partitions are
  written once, never rewritten — but git never reclaims, so pruning bounds
  listing cost, not clone size.
- **Cloud routine limits**: daily run caps (API-fired runs count too);
  local schedule / team runner runs the same pointer prompt when they bind.
- **Routines fire API is research preview**: surface verified 2026-07-10
  (`POST …/routines/{trigger-id}/fire`, `anthropic-version: 2023-06-01`,
  `anthropic-beta: experimental-cc-routine-2026-04-01`, token minting
  UI-only); `ANTHROPIC_ROUTINES_BETA` overrides the pinned header when it
  changes (ADR-0016).
- ~~**Palette duplication**~~ **retired 2026-07-30 (ADR-0050).** ADR-0007
  accepted a standing cost — the chrome's `@theme` block and the
  `widget-artifact` token snippet "must stay identical". There is no second
  copy now: `scripts/gen-artifact-tokens.ts` derives the kit's palette from the
  theme registry, CI fails on drift, and the hand-kept snippet is gone.
