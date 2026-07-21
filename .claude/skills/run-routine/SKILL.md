---
name: run-routine
description: >-
  The steward dispatcher (ADR-0005): every run enters here, whether
  scheduled, manual, or dry. Given a routine slug, resolve it in the data repo's
  data/routines.yaml, execute that routine's template with its
  instructions and params, enforce the widget standard, and
  publish the artifact. Use when a prompt says "Run the steward routine
  <slug>" or "Dry-run the steward routine <slug>".
---

# run-routine

You were invoked by a pointer prompt of one of these forms (ADR-0005,
ADR-0010, ADR-0017):

- _"Run the steward routine `<slug>` — follow the `run-routine` skill."_
- _"Run the steward routine `<slug>` in `<owner/repo>` — follow the
  `run-routine` skill."_
- Either form starting with **"Dry-run"** instead of "Run" is a dry run
  (ADR-0017). **Decide this first**: dry mode changes step 1 (local tree
  only, no remotes) and step 3 (no plugin install/clone). See § Dry runs.
- Legacy: "Run the bulletin routine …" (the pre-rename phrase, ADR-0024)
  still dispatches here during migration; treat it identically.

The prompt is deliberately stable; everything that can change lives in the
data repo's YAML.

## 1. Locate the data repo

**Dry run?** The current working directory is authoritative, full stop: it
must contain `data/routines.yaml`, dirty state included. No remote
matching, no push-access check, no fetch, no clone. If the cwd has no
routines file, stop and report; never fall through to the network steps
below.

Otherwise: when the prompt carries an ``in `<owner/repo>` `` clause, that
repo IS the data repo. Every prompt names its repo now that a user can
have many data repos (ADR-0023). Legacy prompts without the clause resolve
to the home repo: `steward-data-<login>` for the account you run as
(ADR-0001). In order of preference:

1. The current working directory, if it contains `data/routines.yaml`
   and, when the prompt names a repo, its `origin` remote matches it.
2. A sibling checkout (e.g. `~/steward-data-*` or a repo mounted into the
   cloud environment), same remote check.
3. Clone it: `gh repo clone <owner/repo>`. For personal runs that is
   `<login>/steward-data-<login>` (get `<login>` from
   `gh api user --jq .login`).

If the repo is unreachable (or you cannot push to it), stop and report.
Do not invent config. When GitHub answers 404/"not found" for the data
repo, report it as a **likely access problem, not a missing repo**: data
repos are private, and an environment whose GitHub grant lacks the repo
can't tell the difference. Say which repo you looked for and point at the
fix: add it to the cloud routine's Repositories list, or grant it to the
Claude GitHub App on the owner's account.

## 2. Resolve the routine

Read `data/routines.yaml` and find the entry whose `slug` matches the
prompt. Then:

- **No such slug** → stop and report the available slugs. Never guess.
- **`enabled: false`** → stop quietly ("routine disabled, nothing to do").
  A disabled routine firing is schedule drift, worth one line in the report
  (`pnpm routines:sync` fixes it), not an error.

## 3. Produce the content

Every routine names a `template:` (ADR-0022; freeform routines name the
`custom` built-in). Resolve `templates/routines/<template>.md`, in order:

1. the **data repo** checkout (a private or team template);
2. the **steward checkout**, the repo this very skill lives in, so it
   is always present where you are (built-in templates ship next to the
   dispatcher).

Neither file exists → **hard-fail loudly**: stop, report the bad
`template:` reference and where you looked. That error surface is the
point of the structured field; never improvise a missing template's job.

Then follow the template's body, passing the routine's `instructions:` as
the user's standing guidance (configuration, not conversation) **and its
`params:` map verbatim** (ADR-0020), the structured answers to the inputs
the template declares in its `widget:` frontmatter (e.g. repo-pulse's
repositories to watch). Params win over prose: if `instructions:` and a
param disagree, the param is authoritative. A param the template doesn't
recognize is ignored, not an error.

While executing, keep the routine's `slug` authoritative: the artifact
path is derived from it, never from the template name.

## 4. Author and publish

Whatever the content source, the artifact MUST follow the
`widget-artifact` skill (self-contained HTML, gruvbox tokens, breakpoints,
generated-at meta + footer, graceful empty state), **authored fresh from
that skill's current design language on every run**. A previous artifact a
template gathers is a data source (carry-overs, the last generated-at),
never an authoring base: reusing its markup or CSS freezes the widget at
whatever design the first run shipped, and design fixes never reach the
board. Before publishing, run the skill's validator on the finished file:

```bash
node <steward checkout>/.claude/skills/widget-artifact/scripts/validate.mjs <artifact.html>
```

Fix every error it reports; a run never publishes an artifact that
fails validation. Then publish it with the `publish-widget` skill to
`w/<slug>/index.html` on the `artifacts` branch.

## Dry runs (ADR-0017)

A "Dry-run …" prompt changes exactly two behaviors, and routine templates
never know they are being dry-run:

- **In**: resolve `data/routines.yaml` and templates from the **local working
  tree, dirty state included**. The cwd checkout is authoritative; no
  remote matching, no push-access requirement, no fetch, no clone (steps 1
  and 3 above carry the specifics). What's being edited is what runs.
- **Out**: tell `publish-widget` this is a dry run, so it writes the
  artifact to a local file and opens it in the browser. Nothing is
  committed or pushed; the live widget never sees a test run.

## 5. Report

One short summary: routine, template, data gathered (or
"no live data"), publish commit SHA (or the local file path on a dry run).
A run that gathered nothing still publishes an artifact with an explicit
empty state. Staleness on the dashboard is the failure signal, not a
missing file (ADR-0005).
