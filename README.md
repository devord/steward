<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="apps/web/public/wordmark-dark.svg" />
    <source media="(prefers-color-scheme: light)" srcset="apps/web/public/wordmark-light.svg" />
    <img alt="Bulletin" src="apps/web/public/wordmark-dark.svg" width="280" />
  </picture>
</p>

<p align="center">
  A dashboard of living widgets — each one an HTML report that a scheduled
  Claude Code routine regenerates and publishes.<br />
  Daily plans, status reports, time tracking, billing: reports that update
  themselves, never written by hand again.
</p>

## How it works

Bulletin has no database and no artifact host. GitHub is both:

- **This repo (shared):** the web app, the schemas, and the contract
  skills. Content skills live in the narrowest repo their users can read —
  the team's plugins repo or a data repo (ADR-0014). Team-visible; never
  holds user data.
- **Your data repo (`bulletin-data-<login>`, private):** created for you from
  a template on first sign-in. `main` holds your config
  (`data/routines.yaml`, `data/dashboard.yaml`); the `artifacts` branch holds
  your published artifacts at `w/<slug>/index.html`. Nobody else can read it
  — privacy is GitHub's repo boundary, not app logic.

The loop, end to end:

1. **You add a routine** in the UI: describe what the widget should show
   (optionally accelerated by a discovered skill), name it (the slug fixes
   the artifact address forever), pick a widget size, a schedule — or
   manual — and a host. Edits accumulate as a local draft; **Sync** commits
   them to your data repo (or opens a PR if you prefer review).
2. **A run starts** — a Claude cloud routine or local launchd schedule
   fires, someone clicks the widget's update button (manual cloud), or you
   run `pnpm routine <slug>` in a terminal. Every path is one stable line:
   _"Run the bulletin routine `<slug>` — follow the `run-routine` skill."_
   Everything the run actually does is versioned in the repos, so the
   cloud routine's prompt is created once and never edited — the only
   thing `routines:sync` ever touches on an existing resource is its cron.
3. **The routine publishes** — the skill produces a self-contained,
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
   generates private `bulletin-data-<you>` from the template.
3. **Add a routine** (prompt → name → size → schedule/host) and **Sync**.
4. **Enact it** once, from your bulletin checkout, pointing `--file` at your
   data-repo checkout:
   `pnpm routines:sync --apply --file <path-to-data-repo>/data/routines.yaml`.
   It creates the cloud routine or launchd agent (and walks you through the
   API trigger for manual cloud routines); it reconciles drift on every later
   run.
5. Widgets refresh on their own from then on. Stale or never-run widgets say
   so on the card.

(Steps 1–5 describe the target UX; see the roadmap for what's live today.)

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

| Path              | What                                                                    |
| ----------------- | ----------------------------------------------------------------------- |
| `apps/web`        | React Router v8 app (framework mode, SSR, Tailwind 4)                   |
| `packages/schema` | zod schemas for routines/dashboards/skills — buildless, source-exported |
| `.claude/skills`  | agent skills incl. the routine contracts (M4)                           |
| `docs/`           | ADRs, widget standard, roadmap                                          |

Conventions: formatting and lint rules live in the root `vite.config.ts`
(Vite+); don't hand-format, run `pnpm check --fix`. Commits to `main` go
through the lefthook pre-commit hooks.
