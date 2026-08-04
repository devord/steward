---
name: repo-pulse
description: >-
  Summarize the recent pulse of a set of GitHub repositories as a steward
  widget artifact: open PRs awaiting review, freshly opened issues, and CI
  status. Executed by the run-routine dispatcher (ADR-0021).
widget:
  artifact: "Open PRs awaiting review, new issues, and CI status per repo"
  sizes:
    default: { cols: 2, rows: 1 }
    min: { cols: 1, rows: 1 }
  schedule: "0 */4 * * *"
  # Instances slug themselves <first-repo>-pulse (ADR-0040); `kind` defaults
  # to `pulse` from the template id.
  subjectParam: repos
  # Default band on every board (ADR-0044). A review queue and CI state is
  # engineering-facing whatever repo it watches. A routine overrides it with
  # its own `category:`, or opts out with `category: null`.
  category: Engineering
  params:
    - key: repos
      label: Repositories to watch
      type: repos
      required: true
      hint: Each run reports PRs, new issues, and CI for these
    - key: jira
      label: Jira base URL
      placeholder: https://acme.atlassian.net
      hint: Ticket keys found in PR titles link into this site
    - key: people
      label: People registry
      placeholder: owner/repo:data/avatars-48.json
      hint: >-
        Optional. A committed JSON map, login to name and 48px data URI,
        for real faces on rows. Needs the repo in the routine's repos list;
        without it every row shows an initial circle
---

# Repo pulse

What is open across these repos, and what is stopping it.

## Compose

1. **`/github-prs`** over `params.repos` — open PRs, plus new issues since the
   previous artifact's generated-at (else the last 24h) and default-branch CI.
   Pass `params.jira` so ticket keys come back linked.
2. **`/people-registry`** over the authors it reported, using `params.people`.

`instructions:` say what to emphasize or ignore; they never change what is
gathered.

## Present

Write `data.json` per `$STEWARD/.claude/skills/widget-artifact/kit/CONTRACT.md`
and render it with the kit.

- **`stat`** — `counts.open`, label `"open PRs"`, `note` carrying the worst CI
  state and the blocked count (`"2 blocked · CI passing"`). It stays
  viewer-neutral at every tier: the glance is one figure, and that figure has
  to be true for a reader who is not signed in.
- **One `queue` block, grouped** — the reading's groups in its order, `Blocked`
  → `In review` → `Open`, each with its count. One block, not three: groups
  share a column set, so every glyph and age sits on one vertical.
- **Rows.** `face` is the author from the registry. `data` carries
  `{author, reviewers}` as raw logins. `title` is `#num` plus the display
  title, linked to the PR, with the raw title as its tooltip. `values`:

  | column | from     | notes                                                                                   |
  | ------ | -------- | --------------------------------------------------------------------------------------- |
  | ticket | `detail` | `tone: "info"`, linked when the reading gave it an href                                 |
  | size   | `page`   | `+adds −dels`, U+2212 minus                                                             |
  | review | `always` | `icon`: `check` approved · `circle-x` changes requested · `pencil` draft · `clock` else |
  | ci     | `always` | `icon`: `check` passing · `circle-x` failing · `clock` pending; omit when no checks     |
  | age    | `always` | numeric, **`ageDays` with its unit** — `"20d"`, never a bare `20`                       |

  **Tone only what is actionable.** A passing check and an approval take no
  tone — the column reads as texture until something is wrong.

  **A number carries its unit in the value.** The column header that would say
  `age` only appears from the page tier (900px), and most of a tile's life is
  spent below it, so a bare `20` in a 2-column tile is an unlabelled quantity —
  and `age` would not have said _days_ anyway. The same goes for the `icon`
  columns' `value`: it is the word a reader sees beside the glyph wherever
  there is room, so write `"changes requested"`, not `"x"`.

  **No `detail` line on these rows.** The raw title belongs in the title's
  tooltip, which is where this template already puts it. Setting it as `detail`
  instead prints `morning briefing` over
  `skill(corza-good-morning): morning briefing` — the conventional-commit
  prefix that `displayTitle` just stripped, restated as a second line, at
  roughly half the ledger's height on a tile that clips. Spend `detail` on a
  fact the row does not already carry (which repo, who was asked) or leave it
  unset.

- **`viewerGroups`** — `{reviewer: "Needs your review", author: "Yours",
rest: "Open"}`, so the board re-buckets per signed-in viewer at render time.
  **One watched repo only.**
- **Several repos** — make the groups the repos instead, each carrying its own
  summary on `count` (`"6 PRs · 2 new issues · CI ✓"`), ordered by activity,
  and set no `viewerGroups`: re-bucketing by viewer flattens the repos away,
  and which repo a PR belongs to is what that shape exists to show.
- **`provenance`** — repos watched, open PRs, new issues, default-branch state,
  and any repo the reading listed as unreachable.
- **`empty`** — "No open pull requests" when the repos read clean, or a pointer
  to set the routine's Repositories when none are configured. Two states.

## The context block

Viewer-neutral, like the render — whoever copies it is unknown to the run.

Spend it on every PR the tile trimmed, why each blocked one is blocked, the age
outliers, and any repo that read as unreachable. Name PR numbers and logins so
they can be acted on without a lookup.

Close with `## Ask me about` — what to review first, which PRs have gone stale
enough to close, and what a repeatedly-failing check is telling us.
