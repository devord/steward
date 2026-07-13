<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="apps/web/public/wordmark-dark.svg" />
    <source media="(prefers-color-scheme: light)" srcset="apps/web/public/wordmark-light.svg" />
    <img alt="Steward" src="apps/web/public/wordmark-dark.svg" width="280" />
  </picture>
</p>

<p align="center">
  Reports that update themselves.<br />
  A dashboard of living widgets — daily plans, repo health, changelogs —
  each one regenerated on schedule by a Claude Code routine and published
  to a GitHub repo you own.
</p>

## Why

Every developer keeps a handful of reports someone refreshes by hand —
the daily plan, the review queue, the status update, the changelog. They
rot the moment the author gets busy, and a stale report is worse than
none: you stop trusting it and go digging again.

Steward hands the chore to **routines**: each widget on the dashboard is
a small self-contained HTML artifact that a scheduled Claude Code routine
regenerates and publishes. The dashboard's promise is honesty about
freshness — every widget carries when it last ran and says so plainly
when it's stale. Success is a dashboard you trust enough to glance at
instead of digging.

And your data is yours. There is no database and no artifact host:
everything — routines, layouts, published widgets — lives in a private
GitHub repo you own, and only you have access. The app is a stateless
renderer working with your token; privacy is GitHub's repo boundary, not
app logic. Leaving is deleting a repo.

## How it works

GitHub is the whole backend:

- **This repo (shared):** the web app, the schemas, the contract skills,
  and the built-in routine templates (`templates/routines/`, ADR-0021).
  Team- or private-specific templates live in the narrowest data repo
  their users can read (ADR-0014/0021). Team-visible; never holds user
  data.
- **Your data repo (`steward-data-<login>`, private):** created for you from
  a template on first sign-in. `main` holds your config
  (`data/routines.yaml`, `data/dashboard.yaml`); the `artifacts` branch holds
  your published artifacts at `w/<slug>/index.html`. Nobody else can read it
  — privacy is GitHub's repo boundary, not app logic.

The loop, end to end:

1. **You add a routine** in the UI: describe what the widget should show
   (or start from a template and fill in its settings), name it (the slug fixes
   the artifact address forever), pick a widget size, a schedule — or
   manual — and a host. Edits accumulate as a local draft; **Sync** commits
   them to your data repo (or opens a PR if you prefer review).
2. **A run starts** — a Claude cloud routine or local launchd schedule
   fires, someone clicks the widget's update button (manual cloud), or you
   run `pnpm routine <slug>` in a terminal. Every path is one stable line:
   _"Run the steward routine `<slug>` — follow the `run-routine` skill."_
   Everything the run actually does is versioned in the repos, so the
   cloud routine's prompt is created once and never edited — the only
   thing `routines:sync` ever touches on an existing resource is its cron.
3. **The routine publishes** — the run produces a self-contained,
   responsive HTML artifact (see
   [docs/widget-standard.md](./docs/widget-standard.md)) and pushes it to
   your `artifacts` branch. Publishing _is_ the git push.
4. **The dashboard renders** — the app fetches your artifacts through the
   GitHub API with your token and shows each one in a sandboxed iframe sized
   by your grid layout. The artifact's media queries adapt it to the widget
   size; the last commit becomes its "Ran 2h ago" freshness readout.

Deeper reading: [CONTEXT.md](./CONTEXT.md) (domain language),
[docs/adr/](./docs/adr/) (why it's built this way),
[docs/widget-standard.md](./docs/widget-standard.md) (the artifact contract).

## Using it

Prerequisites: a GitHub account; Claude Code (for routines to run).

1. Open the app and **sign in with GitHub** (scopes: `repo`, `read:user`).
2. First run: accept the **"create your dashboard repo"** wizard — it
   generates private `steward-data-<you>` from the template.
3. **Add a routine** (prompt → name → size → schedule/host) and **Sync**.
4. **Enact it** once, from your steward checkout — the widget card shows the
   exact copy-pasteable line:
   `pnpm routines:sync --apply --repo <owner>/steward-data-<owner>`.
   With `--repo` the script keeps its own clone of the data repo under
   `~/.cache/steward/` (pass `--file <path>/data/routines.yaml` to use a
   checkout you manage instead). It creates the cloud routine or launchd
   agent, walks you through the API trigger for every cloud routine (manual
   ones need it to run at all; scheduled ones need it for the Update
   button), and reconciles drift on every later run.
5. Missed or skipped a trigger? Mint one any time with
   `pnpm routine:trigger <slug> --repo <owner>/steward-data-<owner>`.
6. Widgets refresh on their own from then on. Stale or never-run widgets say
   so on the card.

(Steps 1–6 describe the target UX; see the roadmap for what's live today.)

## Development

Requires Node ≥ 24 and pnpm 10.

```bash
pnpm install
pnpm exec lefthook install   # once, after cloning (ignoreScripts blocks auto-setup)
pnpm dev                     # app on http://localhost:5173
pnpm check                   # oxlint + oxfmt + typecheck in one pass
pnpm test                    # vitest via turbo
pnpm build                   # production build
```

Workspace layout:

| Path              | What                                                                       |
| ----------------- | -------------------------------------------------------------------------- |
| `apps/web`        | React Router v8 app (framework mode, SSR, Tailwind 4)                      |
| `packages/schema` | zod schemas for routines/dashboards/templates — buildless, source-exported |
| `.claude/skills`  | the contract skills (run-routine, widget-artifact, publish-widget)         |
| `templates/`      | the data-repo template and the built-in routine templates (ADR-0021)       |
| `docs/`           | ADRs, widget standard, roadmap                                             |

Conventions: formatting and lint rules live in the root `vite.config.ts`
(Vite+); don't hand-format, run `pnpm check --fix`. Commits to `main` go
through the lefthook pre-commit hooks.
