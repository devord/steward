---
name: run-routine
description: >-
  The bulletin dispatcher (ADR-0005): every scheduled run enters here. Given
  a routine slug, resolve it in the data repo's data/routines.yaml, execute
  that routine's skill with its instructions, enforce the widget standard,
  and publish the artifact. Use when a prompt says "Run the bulletin routine
  <slug>".
---

# run-routine

You were invoked by a pointer prompt of the form _"Run the bulletin routine
`<slug>` — follow the `run-routine` skill."_ The prompt is deliberately
stable; everything that can change lives in the data repo's YAML.

## 1. Locate the data repo

The data repo is `bulletin-data-<login>` for the account you run as
(ADR-0001). In order of preference:

1. The current working directory, if it contains `data/routines.yaml`.
2. A sibling checkout (e.g. `~/bulletin-data-*` or a repo mounted into the
   cloud environment).
3. Clone it: `gh repo clone <login>/bulletin-data-<login>` (get `<login>`
   from `gh api user --jq .login`).

If the repo is unreachable, stop and report — do not invent config.

## 2. Resolve the routine

Read `data/routines.yaml` and find the entry whose `slug` matches the
prompt. Then:

- **No such slug** → stop and report the available slugs. Never guess.
- **`enabled: false`** → stop quietly ("routine disabled, nothing to do").
  A disabled routine firing is schedule drift, worth one line in the report
  (`pnpm routines:sync` fixes it), not an error.

## 3. Execute the routine's skill

Invoke the skill named in the routine's `skill:` field (it comes from the
shared repo's catalog). Pass the routine's `instructions:` field as the
user's standing guidance — the skill treats it as configuration, not
conversation. While executing, keep the routine's `slug` authoritative: the
artifact path is derived from it, never from the skill name.

## 4. Author and publish

The routine's skill produces content; the artifact itself MUST follow the
`widget-artifact` skill (self-contained HTML, gruvbox tokens, breakpoints,
generated-at meta + footer, graceful empty state). Then publish it with the
`publish-widget` skill to `w/<slug>/index.html` on the `artifacts` branch.

## 5. Report

One short summary: routine, skill, data gathered (or "no live data"),
publish commit SHA. A run that gathered nothing still publishes an artifact
with an explicit empty state — staleness on the dashboard is the failure
signal, not a missing file (ADR-0005).
