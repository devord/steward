# bulletin-data

Your private [Bulletin](https://github.com/Form-Factory/bulletin) data repo,
created from the template by the app's first-run wizard — or, for a team,
the shared team data repo everyone with access can see (ADR-0010).
Everything Bulletin knows about this dashboard's owner lives here — the app
itself stores nothing (ADR-0001).

- `main` holds config: [`data/routines.yaml`](./data/routines.yaml) (what
  runs, on what schedule) and one grid layout per dashboard under
  [`data/dashboards/`](./data/dashboards/) (`main.yaml` is the default
  board; add a file to add a dashboard).
- The orphan `artifacts` branch holds published widget artifacts at
  `w/<slug>/index.html` — written by routines via the `publish-widget`
  skill, never by hand (except once, to prove the render path).

Edit config through the Bulletin app (drafts → Sync panel → commit or PR),
or by hand — it's plain YAML, and the app validates on load.

## Running a routine now

Scheduled runs fire on their own (ADR-0005). To also trigger a routine on
demand — a "Run now" button on each widget, plus the Actions tab and
`gh workflow run run-routine.yml -f slug=<slug>` — this repo ships
[`.github/workflows/run-routine.yml`](./.github/workflows/run-routine.yml)
(ADR-0012). It runs the same dispatcher prompt as the schedule, so a manual
run and a scheduled run are identical. To enable it:

1. Set `manualRun: true` in [`data/routines.yaml`](./data/routines.yaml).
2. Add a Claude credential as an Actions secret (Settings → Secrets and
   variables → Actions): `ANTHROPIC_API_KEY` (metered API billing) **or**
   `CLAUDE_CODE_OAUTH_TOKEN` (a subscription's headless token). Whichever you
   add is how manual runs get billed. For a team repo, use a shared/org
   credential — this is the one place a data repo holds an execution
   credential, and anyone with repo (or dashboard) access can spend it.

The workflow checks out the shared Bulletin repo for its skills. That repo is
private in the standard deployment, so also add a read-scoped PAT as
`BULLETIN_REPO_TOKEN` and uncomment the `token:` line in the workflow (skip
this only if your shared repo is public). A 5-minute cooldown per widget
throttles repeat runs.

## Bootstrapping the artifacts branch

The wizard creates this repo with `main` only. The first `publish-widget`
run creates the `artifacts` orphan branch automatically; to hand-publish a
sample artifact before any routine exists:

```bash
git checkout --orphan artifacts && git rm -rf .
mkdir -p w/daily-plan
# author w/daily-plan/index.html per docs/widget-standard.md
git add w && git commit -m "publish: daily-plan (sample)" && git push -u origin artifacts
```
