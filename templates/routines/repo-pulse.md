---
name: repo-pulse
description: >-
  Summarize the recent pulse of a set of GitHub repositories — open PRs
  awaiting review, freshly opened issues, CI status — as a steward widget
  artifact. Executed by the run-routine dispatcher (ADR-0021).
widget:
  artifact: "Open PRs awaiting review, new issues, and CI status per repo"
  sizes:
    default: { cols: 2, rows: 1 }
    min: { cols: 1, rows: 1 }
  schedule: "0 */4 * * *"
  params:
    - key: repos
      label: Repositories to watch
      type: repos
      required: true
      hint: Each run reports PRs, new issues, and CI for these
---

# Repo pulse

Author a digest of repository activity as a widget artifact. You are
invoked by the `run-routine` dispatcher with the routine's `params:` and
`instructions:` from `data/routines.yaml`. The repositories to watch are
`params.repos`; treat `instructions:` as extra guidance (what to
emphasize, what to ignore).

## Gather

Resolve the viewer once — every row is marked relative to them:

```bash
login="$(gh api user -q .login)"
```

For each watched repo, via `gh` (preferred) or the GitHub API:

1. Open PRs with per-PR structure, one call:

   ```bash
   gh pr list --repo "$repo" --limit 50 \
     --json number,title,url,author,isDraft,reviewDecision,reviewRequests,statusCheckRollup,createdAt
   ```

   Derive per PR: **mine** (`author.login == login`), **needs me**
   (`login` among `reviewRequests` — direct requests only; a
   team-only request doesn't count as "need you"), **state**
   (`draft` / `changes requested` / `approved` / `review required`,
   from `isDraft` + `reviewDecision`), **CI** (worst conclusion in
   `statusCheckRollup`: failing > pending > passing; no checks →
   none), and **age** from `createdAt`.

2. Issues opened since the last run (previous artifact's generated-at time,
   else the last 24h).
3. Latest default-branch CI status — name the watched repo explicitly
   (the cwd is the data repo, not the repo being watched) and filter to
   its default branch, or the latest run may come from a feature branch:

   ```bash
   repo=<owner/name>  # each entry of params.repos
   branch="$(gh repo view "$repo" --json defaultBranchRef -q .defaultBranchRef.name)"
   gh run list --repo "$repo" --branch "$branch" --limit 1
   ```

## Compose

Order PRs by actionability, never by number: **needs your review**
first, then **yours that are blocked** (changes requested or failing
CI), then yours in flight, then the rest; oldest first within each
group — old _and_ waiting on you is the emergency.

- **One repo watched**: PR rows at top level, grouped under section
  rules — `Needs your review` / `Yours` / `Open` — with counts in the
  section labels.
- **Several repos**: per-repo summary rows
  (`repo · N PRs (M need you) · K new issues · CI ✓/✗`), repos with
  review requests first, PR rows nested under each.

## Author the artifact

Follow the `widget-artifact` skill for the HTML contract; compose from
its design language (ledger rows, pills, dots, links). Row anatomy —
a PR is a ledger row:

- `#num title` is a **link** to the PR (`target="_blank"
rel="noopener"`, widget-standard §7); repo names link to the repo's
  PR list.
- Key column marks ownership: `you` in orange on review-requested rows,
  `mine` in faint ink on the user's own, empty otherwise.
- Trailing meta, right-aligned: a state pill only when the state
  demands action (`changes requested` bad, `approved` ok, `draft`
  neutral — and dim the whole draft row; plain `review required` needs
  no pill), a CI dot when the PR has checks, age in 12px mono. Age
  colors yellow only when the wait is on the user (needs-you rows
  older than 3 days) — a big number alone is not an alarm.

Size behavior:

- **1×1**: total count of PRs needing the user's review, plus worst CI state.
- **2×1**: per-repo summary rows (or the top group when one repo).
- **2×2 and larger**: the grouped PR rows.
- **Wide tile / full view**: a real table — the same ledger grid with a
  12px mono header row (`pr · state · ci · age`), columns aligned by
  subgrid, hairline-separated rows. Spend width on columns, not longer
  lines.

Degrade gracefully: a repo that can't be read gets an "unreachable" row, not
an error; no watched repos configured → an empty state telling the user to
set the routine's repositories.
