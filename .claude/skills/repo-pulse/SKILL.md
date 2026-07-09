---
name: repo-pulse
description: >-
  Summarize the recent pulse of a set of GitHub repositories — open PRs
  awaiting review, freshly opened issues, CI status — as a bulletin widget
  artifact. Run by the run-routine dispatcher; not meant for interactive
  invocation.
widget:
  artifact: "Open PRs awaiting review, new issues, and CI status per repo"
  sizes:
    default: { cols: 2, rows: 1 }
    min: { cols: 1, rows: 1 }
  schedule: "0 */4 * * *"
---

# Repo pulse

Author a digest of repository activity as a widget artifact. You are invoked
by the `run-routine` dispatcher with the routine's `instructions` from
`data/routines.yaml`; the instructions MUST name the repositories to watch
(e.g. "watch Form-Factory/bulletin and Form-Factory/devtools").

## Gather

For each watched repo, via `gh` (preferred) or the GitHub API:

1. Open PRs, flagging ones where the user's review is requested and ones
   older than 3 days.
2. Issues opened since the last run (previous artifact's generated-at time,
   else the last 24h).
3. Latest default-branch CI status — filter explicitly, or the latest run
   may come from a feature branch:
   `gh run list --branch "$(gh repo view <repo> --json defaultBranchRef -q .defaultBranchRef.name)" --limit 1`.

## Compose

Per repo, one compact row: `repo · N PRs (M need you) · K new issues · CI ✓/✗`.
Order repos by how much needs attention (review requests first).

## Author the artifact

Follow the `widget-artifact` skill for the HTML contract. Size behavior:

- **1×1**: total count of PRs needing the user's review, plus worst CI state.
- **2×1**: the per-repo rows.
- **2×2 and larger**: per-repo rows plus PR titles under each repo.

Degrade gracefully: a repo that can't be read gets an "unreachable" row, not
an error; no watched repos configured → an empty state telling the user to
set `instructions`.
