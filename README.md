<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="apps/web/public/wordmark-dark.svg" />
    <source media="(prefers-color-scheme: light)" srcset="apps/web/public/wordmark-light.svg" />
    <img alt="Steward" src="apps/web/public/wordmark-dark.svg" width="280" />
  </picture>
</p>

<p align="center">
  Reports that update themselves — a dashboard of living widgets, each
  regenerated on schedule by a Claude Code routine and published to a
  GitHub repo you own.
</p>

## Why

Every developer keeps a handful of reports that only stay current while
someone refreshes them by hand — opening the tool, running the update,
shipping the change. The daily plan, the review queue, the status update,
the changelog. They rot the moment the author gets busy, and a stale
report is worse than none.

Steward hands the chore to **routines**: each widget on the dashboard is
a small self-contained HTML artifact that a scheduled Claude Code routine
regenerates and publishes.

And your data is yours. There is no database and no artifact host:
everything — routines, layouts, published widgets — lives in a private
GitHub repo you own. The app is a stateless renderer working with your
token; privacy is GitHub's repo boundary, not app logic. Share access
with whoever you like; leaving is deleting a repo.

## How it works

GitHub is the whole backend:

- **This repo (shared):** the web app, the schemas, the contract skills,
  and the built-in routine templates (`templates/routines/`). Team-visible;
  never holds user data.
- **Your data repo (`steward-data-<login>`, private):** created for you from
  a template on first sign-in. `main` holds your config; the `artifacts`
  branch holds your published widgets at `w/<slug>/index.html`.

The loop:

1. **Add a routine** in the UI — describe the widget or start from a
   template, name it, pick a size, a schedule (or manual), and a host.
   **Sync** commits it to your data repo.
2. **A run fires** — a cloud schedule, local launchd, an update-button
   click, or `steward run <slug>` in a terminal. Every path is one stable
   line: _"Run the steward routine `<slug>` — follow the `run-routine`
   skill."_
3. **The routine publishes** — it writes a self-contained, responsive HTML
   artifact ([docs/widget-standard.md](./docs/widget-standard.md)) and
   pushes it to your `artifacts` branch. Publishing _is_ the git push.
4. **The dashboard renders** — the app fetches your artifacts with your
   token and shows each in a sandboxed iframe; the last commit becomes its
   "Ran 2h ago" freshness readout.

Deeper reading: [CONTEXT.md](./CONTEXT.md) and
[docs/widget-standard.md](./docs/widget-standard.md).

## Using it

Prerequisites: a GitHub account; Claude Code (for routines to run).

1. Open the app and **sign in with GitHub** (scopes: `repo`, `read:user`).
2. First run: accept the wizard that creates your private
   `steward-data-<you>` repo from the template.
3. **Add a routine** (prompt → name → size → schedule/host) and **Sync**.
4. **Enact it** — each widget card prints the exact line:
   `npx @devord/steward sync --apply --repo <owner>/steward-data-<owner>`. It
   creates the cloud routine or launchd agent and reconciles drift on every
   later run. Scheduled-local (launchd) routines want a stable install —
   `npm i -g @devord/steward`.
5. Missed a trigger? Mint one with
   `npx @devord/steward trigger <slug> --repo <owner>/steward-data-<owner>`.
6. Widgets refresh on their own from then on; stale or never-run widgets say
   so on the card.

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
| `packages/cli`    | the `@devord/steward` routines CLI — bundled + published to npm            |
| `.claude/skills`  | the contract skills (run-routine, widget-artifact, publish-widget)         |
| `templates/`      | the data-repo template and the built-in routine templates                  |
| `docs/`           | ADRs, widget standard, roadmap                                             |
