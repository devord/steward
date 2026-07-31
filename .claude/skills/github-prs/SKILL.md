---
name: github-prs
description: >-
  Gather open pull requests across GitHub repositories and report them grouped
  by what blocks them — author, requested reviewers, review state, CI rollup,
  age, size and ticket key. Use when a routine template composes it, or when
  the user asks what is open, what needs review, or what is blocked across a
  set of repos.
---

# github-prs

You reach GitHub; `scripts/derive.mjs` does the arithmetic. Everything a
reader could miscount — the CI rollup, the grouping, the ages, the totals —
belongs to the script, because two widgets counting the same queue by hand is
how they end up publishing different numbers.

Write raw facts to `$RUN_DIR/github-prs/raw.json`, run the script, and hand
back what it prints. **The script's stdout is the reading**: don't paraphrase
it, don't re-tally it.

## 1. Reach

Whichever of these the environment gives you — try `gh` first, fall back to
MCP. A scheduled cloud run has neither `gh` nor GitHub API egress, so there
GitHub is only `mcp__github__*` (ADR-0018), and a `node` subprocess cannot
call those tools; that is why this step is yours and not the script's.

```bash
gh pr list --repo "$repo" --state open --limit 100 \
  --json number,title,url,author,isDraft,reviewDecision,reviewRequests,statusCheckRollup,createdAt,additions,deletions
```

Over MCP: `list_pull_requests` (state=open), plus `pull_request_read` for the
check rollup when the list omits it.

Two optional extras, when the caller asks for them:

- **New issues** — those opened since a given time (`--since`), via
  `gh issue list --repo "$repo" --search "created:>$since"` or
  `list_issues`. Pull requests are issues on this endpoint; drop anything
  carrying a `pull_request` field.
- **Default-branch CI** — name the repo explicitly and filter to its default
  branch, or the latest run comes back from whatever feature branch ran last:

  ```bash
  branch="$(gh repo view "$repo" --json defaultBranchRef -q .defaultBranchRef.name)"
  gh run list --repo "$repo" --branch "$branch" --limit 1 --json conclusion,status
  ```

A repo you genuinely cannot read is recorded, never guessed:
`{"reachable": false}`. It degrades the run; it does not fail it.

_Done when_ every requested repo has an entry in `raw.json` — a PR list or an
explicit `reachable: false`.

### `raw.json`

Keyed by `owner/repo`. Fields are `gh`'s own, so a dump needs no reshaping;
absent ones are fine.

```json
{
  "Form-Factory/steward": {
    "reachable": true,
    "prs": [
      {
        "number": 412,
        "title": "fix(publish): guard the push race",
        "url": "https://github.com/Form-Factory/steward/pull/412",
        "author": { "login": "octocat" },
        "isDraft": false,
        "reviewDecision": "CHANGES_REQUESTED",
        "reviewRequests": [{ "login": "kelly" }],
        "statusCheckRollup": [
          { "conclusion": "FAILURE", "status": "COMPLETED" }
        ],
        "createdAt": "2026-07-25T18:23:43Z",
        "additions": 120,
        "deletions": 8
      }
    ],
    "issues": [{ "number": 77, "title": "…", "url": "…", "createdAt": "…" }],
    "ci": { "conclusion": "success", "branch": "main" }
  },
  "Form-Factory/beachify": { "reachable": false }
}
```

## 2. Derive

```bash
node "$STEWARD/.claude/skills/github-prs/scripts/derive.mjs" \
  --raw "$RUN_DIR/github-prs/raw.json" \
  --out "$RUN_DIR/github-prs" \
  [--jira https://acme.atlassian.net]
```

It writes `prs.json` — every PR with its derived `state`, `ci`, `ageDays`,
`ticket`, `group`, and the `author`/`reviewers` pair rows carry as raw
relationship data — and prints the reading to stdout.

Rows come back **worst-first**: `Blocked` (changes requested, or CI failing) →
`In review` (review required, or CI pending) → `Open` (approved, draft, idle),
oldest first inside each. That order is deliberate — a consumer that trims
from the bottom sheds the calm end by itself.

_Done when_ the script exits 0 and `counts.open` equals the PRs across every
reachable repo.

## 3. Hand back the reading

Print what the script printed. It names `prs.json`; a caller that needs every
row reads the file rather than asking you to recite it.

## Resolving "yours"

**Never.** Rows carry `author` and `reviewers` as raw logins because one
published artifact is read by everyone a board is shared with, so the viewer
is unknown at gather time (ADR-0039). Report states, not ownership.
