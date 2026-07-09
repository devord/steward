# bulletin-data

Your private [Bulletin](https://github.com/Form-Factory/bulletin) data repo,
created from the template by the app's first-run wizard. Everything Bulletin
knows about you lives here — the app itself stores nothing (ADR-0001).

- `main` holds config: [`data/routines.yaml`](./data/routines.yaml) (what
  runs, on what schedule) and [`data/dashboard.yaml`](./data/dashboard.yaml)
  (the grid layout).
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
