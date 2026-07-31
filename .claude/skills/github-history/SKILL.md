---
name: github-history
description: >-
  Report what happened in a set of GitHub repositories over a window — merged
  PRs, issues opened and closed, releases, default-branch CI as a rate, and
  what is in flight ahead — with a principal resolved per theme. Use when a
  routine template composes it, or when the user asks what shipped, what
  changed, or what is coming in a repo.
---

# github-history

`github-prs` answers _what is open right now_. This one answers _what moved,
over a window_, and it is the primitive a narrative or an intel report is
built from.

You reach GitHub; `scripts/derive.mjs` resolves the window, counts, and works
out who led what. **Its stdout is the reading.**

## 1. Resolve the window

`--days` (default 7) makes a window **symmetric around the run**:
`[now − days, now]` is behind, `(now, now + days]` is ahead. Both halves the
same width, so "we shipped four things and three are due" is a sentence the
data can actually support.

Pass `--now` to score a fixed point instead of the wall clock — a historical
run must not silently reuse today's trailing window.

## 2. Reach

Per repo, whatever the environment gives you (`gh` first, else
`mcp__github__*`; a cloud run has only the latter, ADR-0018). Behind:

```bash
gh pr list --repo "$repo" --state merged --limit 100 --search "merged:>=$since" \
  --json number,title,url,author,mergedAt,additions,deletions,labels
gh issue list --repo "$repo" --state all --limit 100 --search "created:>=$since"
gh release list --repo "$repo" --limit 20
gh run list --repo "$repo" --branch "$default" --created ">=$since" --limit 100 \
  --json conclusion,status,createdAt
```

Ahead:

```bash
gh pr list --repo "$repo" --state open --limit 100 \
  --json number,title,url,author,isDraft,reviewDecision,statusCheckRollup,updatedAt
gh api "repos/$repo/milestones?state=open"
gh api "repos/$repo/compare/$lastTag...$default" --jq '.commits | length'
```

Skip silently what this environment cannot reach and record it — a repo that
cannot be read is `{"reachable": false}`, never a guess.

_Done when_ every repo has an entry in `$RUN_DIR/github-history/raw.json`.

### `raw.json`

Keyed by `owner/repo`, fields as `gh` returns them. Every list is optional;
what is absent is reported as unmeasured rather than as zero.

```json
{
  "Form-Factory/steward": {
    "reachable": true,
    "merged": [
      {
        "number": 401,
        "title": "feat(checkout): CORZA-142 land the payment seam",
        "url": "…",
        "author": { "login": "octocat" },
        "mergedAt": "2026-07-28T10:00:00Z",
        "additions": 300,
        "deletions": 40,
        "labels": [{ "name": "feature" }]
      }
    ],
    "issuesOpened": [{ "number": 88, "title": "…", "createdAt": "…" }],
    "issuesClosed": [{ "number": 81, "title": "…", "closedAt": "…" }],
    "releases": [{ "tagName": "v1.4.0", "publishedAt": "…", "url": "…" }],
    "runs": [
      { "conclusion": "failure", "status": "completed", "createdAt": "…" }
    ],
    "open": [
      {
        "number": 412,
        "title": "…",
        "author": { "login": "kelly" },
        "isDraft": false,
        "reviewDecision": "APPROVED",
        "statusCheckRollup": [
          { "conclusion": "SUCCESS", "status": "COMPLETED" }
        ],
        "updatedAt": "…"
      }
    ],
    "milestones": [
      {
        "title": "Aug release",
        "dueOn": "2026-08-04T00:00:00Z",
        "openIssues": 3,
        "closedIssues": 9
      }
    ],
    "commitsSinceTag": 14,
    "lastTag": "v1.4.0"
  }
}
```

## 3. Derive

```bash
node "$STEWARD/.claude/skills/github-history/scripts/derive.mjs" \
  --raw "$RUN_DIR/github-history/raw.json" \
  --out "$RUN_DIR/github-history" \
  [--days 7] [--now 2026-07-31T09:00:00Z] [--jira https://acme.atlassian.net]
```

It writes `history.json` and prints the reading. What it works out for you:

- **Window bounds**, both halves, dated — an undated narrative cannot be read
  as stale.
- **Confidence bands ahead** — `committed` (a dated milestone, or an approved
  PR with passing checks), `in flight` (open and moving, nothing binding it to
  a date), `stated` (named, no work visible). An executive reads a plan and a
  hope very differently.
- **CI as a rate over the window**, not today's dot: `red 9 of 40` is a
  finding; a green snapshot is not.
- **A principal per person-bearing item** — most merged PRs behind, ties on
  lines changed then most recent merge; the mover ahead — plus the count of
  everyone else. Logins only; run `/people-registry` over them for names and
  faces.

_Done when_ the script exits 0.

## What it will not do

**Attribution never outruns evidence.** A `stated` item has nobody visible
against it, which is what the band means, so it comes back with no principal.
Inventing one puts a person's name on a commitment they never made.

**Nothing is forecast past the evidence.** A window with nothing scheduled
comes back as exactly that. An invented roadmap is the one output that makes a
narrative worse than nothing.
