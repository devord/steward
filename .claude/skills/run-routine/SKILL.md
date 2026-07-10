---
name: run-routine
description: >-
  The bulletin dispatcher (ADR-0005): every run enters here — scheduled,
  manual, or dry. Given a routine slug, resolve it in the data repo's
  data/routines.yaml, execute that routine's skill (or its bare
  instructions) with its instructions, enforce the widget standard, and
  publish the artifact. Use when a prompt says "Run the bulletin routine
  <slug>" or "Dry-run the bulletin routine <slug>".
---

# run-routine

You were invoked by a pointer prompt of one of these forms (ADR-0005,
ADR-0010, ADR-0017):

- _"Run the bulletin routine `<slug>` — follow the `run-routine` skill."_
- _"Run the bulletin routine `<slug>` in `<owner/repo>` — follow the
  `run-routine` skill."_
- Either form starting with **"Dry-run"** instead of "Run" — a dry run
  (ADR-0017). **Decide this first**: dry mode changes step 1 (local tree
  only, no remotes) and step 3 (no plugin install/clone) — see § Dry runs.

The prompt is deliberately stable; everything that can change lives in the
data repo's YAML.

## 1. Locate the data repo

**Dry run?** The current working directory is authoritative, full stop: it
must contain `data/routines.yaml`, dirty state included — no remote
matching, no push-access check, no fetch, no clone. If the cwd has no
routines file, stop and report; never fall through to the network steps
below.

Otherwise: when the prompt carries an ``in `<owner/repo>` `` clause, that
repo IS the data repo — team routines name the shared team repo this way
(ADR-0010). Without the clause, the data repo is personal:
`bulletin-data-<login>` for the account you run as (ADR-0001). In order of
preference:

1. The current working directory, if it contains `data/routines.yaml` —
   and, when the prompt names a repo, its `origin` remote matches it.
2. A sibling checkout (e.g. `~/bulletin-data-*` or a repo mounted into the
   cloud environment), same remote check.
3. Clone it: `gh repo clone <owner/repo>` — for personal runs that is
   `<login>/bulletin-data-<login>` (get `<login>` from
   `gh api user --jq .login`).

If the repo is unreachable (or you cannot push to it), stop and report —
do not invent config.

## 2. Resolve the routine

Read `data/routines.yaml` and find the entry whose `slug` matches the
prompt. Then:

- **No such slug** → stop and report the available slugs. Never guess.
- **`enabled: false`** → stop quietly ("routine disabled, nothing to do").
  A disabled routine firing is schedule drift, worth one line in the report
  (`pnpm routines:sync` fixes it), not an error.

## 3. Produce the content

Two shapes of routine (ADR-0013):

- **`skill:` present** — invoke that skill, passing the routine's
  `instructions:` as the user's standing guidance (the skill treats it as
  configuration, not conversation). Skills resolve through your normal
  skill resolution: the data repo's own `.claude/skills/` and installed
  plugins (ADR-0014). If the named skill does not resolve, first try
  installing the team's plugins repo (`Form-Factory/plugins`) — or clone
  it and read the skill from `<plugin>/skills/<name>/` directly. **On a
  dry run skip that install/clone entirely** — only locally-present
  skills count (ADR-0017). Still unresolved → **hard-fail loudly**: stop,
  report the bad `skill:` reference and where you looked. That error
  surface is the point of the structured field — never improvise a
  missing skill's job.
- **`skill:` absent** — a prompt-only routine: execute `instructions:`
  directly as the content brief. The contract holds either way; a prompt
  is a degenerate skill.

While executing, keep the routine's `slug` authoritative: the artifact
path is derived from it, never from the skill name.

## 4. Author and publish

Whatever the content source, the artifact MUST follow the
`widget-artifact` skill (self-contained HTML, gruvbox tokens, breakpoints,
generated-at meta + footer, graceful empty state). Then publish it with the
`publish-widget` skill to `w/<slug>/index.html` on the `artifacts` branch.

## Dry runs (ADR-0017)

A "Dry-run …" prompt changes exactly two behaviors — routine skills never
know they are being dry-run:

- **In**: resolve `data/routines.yaml` and skills from the **local working
  tree, dirty state included** — the cwd checkout is authoritative; no
  remote matching, no push-access requirement, no fetch, no clone, no
  plugin install (steps 1 and 3 above carry the specifics). What's being
  edited is what runs.
- **Out**: tell `publish-widget` this is a dry run — it writes the
  artifact to a local file and opens it in the browser. Nothing is
  committed or pushed; the live widget never sees a test run.

## 5. Report

One short summary: routine, skill (or "prompt-only"), data gathered (or
"no live data"), publish commit SHA (or the local file path on a dry run).
A run that gathered nothing still publishes an artifact with an explicit
empty state — staleness on the dashboard is the failure signal, not a
missing file (ADR-0005).
