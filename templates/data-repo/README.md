<p align="center">
  <a href="https://github.com/devord/steward">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset=".github/wordmark-dark.svg" />
      <source media="(prefers-color-scheme: light)" srcset=".github/wordmark-light.svg" />
      <img alt="Steward" src=".github/wordmark-dark.svg" width="240" />
    </picture>
  </a>
</p>

<p align="center">
  Your data repo. Steward stores nothing itself; everything it knows lives here.
</p>

## Layout

- **`data/routines.yaml`**: what runs, and when.
- **`data/dashboards/<slug>.yaml`**: one grid layout per board (`main` is the default).
- **`data/repo.yaml`**: optional rail display name, section order, and widget
  band order (`categories:`).
- **`data/triggers/<slug>.json`**: API-trigger token for a manual cloud routine.
- **`templates/routines/<id>.md`**: routine templates, shown in the app's picker.
- **`templates/routines/<id>.sample.html`**: optional sample render for a
  template; the picker previews it when adding a routine (ADR-0037).
- **`artifacts`** branch: published widgets, written via `publish-widget`.

Edit in the Steward app or by hand. It's plain YAML, validated on load.

## Enacting schedules & triggers

Run the `steward` CLI (published to npm) and point it at this repo. No
checkout needed; it manages its own clone:

```bash
npx @devord/steward sync --repo <owner>/<name>            # dry-run plan
npx @devord/steward sync --repo <owner>/<name> --apply
```

Scheduled-local routines (launchd) want a stable install:
`npm i -g @devord/steward`, then `steward sync …`. The app's per-widget setup
cards print these lines pre-filled.

## Bootstrapping the artifacts branch

The first `publish-widget` run creates the `artifacts` orphan branch
automatically. To hand-publish a sample before any routine exists:

```bash
git checkout --orphan artifacts && git rm -rf .
mkdir -p w/my-widget
# author w/my-widget/index.html per the widget standard
git add w && git commit -m "publish: my-widget (sample)" && git push -u origin artifacts
```
