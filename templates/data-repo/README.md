# bulletin-data

Your private [Bulletin](https://github.com/Form-Factory/bulletin) data repo,
created from the template by the app's first-run wizard — or, for a team,
the shared team data repo everyone with access can see (ADR-0010).
Everything Bulletin knows about this dashboard's owner lives here — the app
itself stores nothing (ADR-0001).

- `main` holds config: [`data/routines.yaml`](./data/routines.yaml) (what
  runs, on what schedule or on demand) and one grid layout per dashboard
  under [`data/dashboards/`](./data/dashboards/) (`main.yaml` is the
  default board; add a file to add a dashboard).
- `templates/routines/<id>.md` files are your **private routine
  templates** (ADR-0021): frontmatter with a `widget:` block (artifact
  line, sizes, schedule, params), body = the authoring procedure. They
  show up in the app's add-routine picker badged "private", alongside
  Bulletin's built-ins — a same-named private template wins.
- `data/triggers/<slug>.json` holds the API-trigger token for a manual
  cloud routine (ADR-0016) — trigger-only scoped, committed on purpose:
  everyone who can read this repo is exactly the set entitled to trigger.
- The orphan `artifacts` branch holds published widget artifacts at
  `w/<slug>/index.html` — written by routines via the `publish-widget`
  skill, never by hand (except once, to prove the render path).

Edit config through the Bulletin app (drafts → Sync panel → commit or PR),
or by hand — it's plain YAML, and the app validates on load.

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
