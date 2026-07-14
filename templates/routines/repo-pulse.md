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
    - key: jira
      label: Jira base URL
      placeholder: https://acme.atlassian.net
      hint: Ticket keys found in PR titles link into this site
---

# Repo pulse

Author a digest of repository activity as a widget artifact. You are
invoked by the `run-routine` dispatcher with the routine's `params:` and
`instructions:` from `data/routines.yaml`. The repositories to watch are
`params.repos`; treat `instructions:` as extra guidance (what to
emphasize, what to ignore).

## Gather

Do **not** resolve a "you" here. Whoever runs the routine is not the
viewer — the artifact is published once and read by everyone the board is
shared with, so "needs your review" / "yours" is settled at render time
against the signed-in viewer, not baked to the runner (widget-standard
"Person-relative content", ADR-0039). Carry each PR's **raw
relationships** — author and requested reviewers — and let the artifact
bucket them per viewer.

For each watched repo, via `gh` (preferred) or the GitHub API:

1. Open PRs with per-PR structure, one call:

   ```bash
   gh pr list --repo "$repo" --limit 50 \
     --json number,title,url,author,isDraft,reviewDecision,reviewRequests,statusCheckRollup,createdAt,additions,deletions
   ```

   Derive per PR: **author** (`author.login`), **reviewers** (the
   directly-requested reviewer logins from `reviewRequests` — users
   only, drop teams; a team-only request is nobody's "need you"),
   **state** (`draft` / `changes requested` / `approved` /
   `review required`, from `isDraft` + `reviewDecision`), **CI**
   (worst conclusion in `statusCheckRollup`: failing > pending >
   passing; no checks → none), **age** from `createdAt`, **size** from
   `additions`/`deletions`, **ticket** — the first Jira-style key
   (`[A-Z][A-Z0-9]+-\d+`) in the title, if any — and **display
   title**: the title with any conventional-commit prefix
   (`type(scope):` / `type:`) stripped; keep the raw title too, it
   becomes the row's tooltip. If stripping leaves nothing, keep the
   raw title. Carry `author` and `reviewers` onto the row as data —
   the "mine" / "needs me" judgement is deferred to render time, not
   decided here.

   Then, for each unique author, resolve two things once and reuse
   them on every row by that author:

   - **Display name** — `gh api users/$author -q .name` (fall back to
     the login when it is null/empty, e.g. most bots). This is the
     avatar's hover label, so a row answers _who_ with a real name
     (`Daniel Moraes`), not a handle (`danielmoraes`).
   - **Avatar** — inline it as a data URI so the artifact stays
     self-contained (widget-standard rule 1 — no images by URL):

     ```bash
     curl -fsSL "https://github.com/$author.png?size=48" -o "$tmp/$author"
     ```

     Verify it is an image (`file -b --mime-type`) and base64 it into
     a `data:<mime>;base64,…` URI. A failed fetch (or a bot author)
     degrades to the initial fallback — never a broken image.

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

One file carries two renderings (widget-standard "Person-relative
content", ADR-0039): a **viewer-neutral static** render everyone and the
raw page see, and a **viewer-faceted** enhancement the board applies at
render time. "Needs your review" / "yours" is never in the published
markup — it is produced by the enhancer against the signed-in viewer.

**Neutral static (published).** Group PRs by state — the objective axis:
`Blocked` (changes requested or failing CI) → `In review` (review
required or pending CI) → `Open` (approved, draft, otherwise idle) —
oldest first within each group; counts in the section labels. No
"you"/"yours" anywhere in this render.

**Viewer-faceted (render-time).** When a viewer is injected and authors
or is directly requested on ≥1 PR, re-group into `Needs your review`
(viewer among the row's `reviewers`) → `Yours` (viewer is the `author`;
blocked first) → `Open` (the rest); oldest first within each — old _and_
waiting on you is the emergency. A viewer with no PRs here, or the raw
page, keeps the neutral render untouched.

- **One repo watched**: PR rows at top level under the section rules
  above.
- **Several repos**: per-repo summary rows
  (`repo · N PRs · K new issues · CI ✓/✗`), PR rows nested under each.
  The neutral render orders repos by activity; the enhancer moves repos
  with PRs requesting the viewer to the front and appends `(M need you)`
  to their summary.

## Author the artifact

Follow the `widget-artifact` skill for the HTML contract; compose from
its design language (ledger rows, avatars, pills, dots, links). Every PR
row also carries the viewer-agnostic data the render-time enhancer buckets
on — `data-author="<login>"`, `data-reviewers="<space-separated requested
logins>"`, plus `data-state` and `data-created` for its re-grouping and
ordering. Row anatomy — a PR is a ledger row with these columns, in
order:

- **Avatar key**: the author's avatar, wrapped in a link to their
  GitHub profile (`https://github.com/<login>`, `target="_blank"
rel="noopener"`) — the picture is the click-through to the person.
  The design-language avatar component: 18px round `<img>` from the
  inlined data URI; the link's `title` (and the img's `alt`) carry the
  author's **display name**, so hover answers _whose PR is this_ with
  a real name; initial-circle fallback when the fetch failed. Never a
  `you`/`mine` word on the row — the section grouping already says it,
  and a bare pronoun reads as noise.
- **Title**: `#num display-title` (conventional-commit prefix
  stripped) as a **link** to the PR (`target="_blank" rel="noopener"`,
  widget-standard §7), with the raw title in the `title` attribute so
  the prefix is one hover away. Repo names link to the repo's PR
  list.
- **Ticket**: the Jira key in 12px mono, tinted reference-blue
  (`--color-blue`) so the column scans as "linked, tracked work";
  when the `jira` param is set, a link to `<jira>/browse/<KEY>`. Empty
  cell when the title carries no key.
- **Size**: `+adds −dels` in 12px mono (tabular, U+2212 minus),
  diff-colored — additions a muted `--color-green`, deletions a muted
  `--color-red`, each mixed toward `--color-ink` so it reads as the
  familiar diffstat and stays calm, never the alarm-red of a failing
  pill.
- **State**: a pill only when the state demands action
  (`changes requested` bad, `approved` ok, `draft` neutral — and dim
  the whole draft row; plain `review required` needs no pill), a CI
  dot when the PR has checks. The `needs you` marker (12px mono
  orange, outranked by a bad-state pill) is viewer-relative — the
  enhancer adds it to rows requesting the signed-in viewer (in the
  several-repos shape, where no section carries ownership); it is
  never in the published markup.
- **Age** in 12px mono. The enhancer tints it yellow only when the
  wait is on the viewer (a needs-you row older than 3 days) — a big
  number alone is not an alarm, and the neutral render carries no
  yellow age.

Columns must align **across the whole artifact, not per section**: one
grid on `main`, sections and their lists laid in with `subgrid`, so
every state pill and age sits on the same vertical down the page. A
per-`<ul>` grid gives each section its own column widths — the
misaligned-state smell. Ticket and size are wide-tier columns: reveal
them at 3-column widths and up (`min-width: 700px`) and in the full
view; 1–2-column tiles keep avatar · title · state · age.

**The enhancer.** Embed one self-contained script (widget-artifact's
person-relative snippet) that runs on `DOMContentLoaded`: read
`window.__STEWARD_VIEWER__?.login`, and if it matches any row's
`data-author` or `data-reviewers`, re-bucket the existing `<li>` nodes
into `Needs your review` / `Yours` / `Open`, swap the section headings
and counts, re-sort by actionability, add the `needs you` markers and
the needs-you age-yellow, and rewrite the 1×1 KPI to the viewer's review
count. Move nodes _within_ the one `main` grid so the subgrid alignment
survives — don't rebuild the grid. Wrap it in `try`/`catch` and bail on
no match: the neutral render is the floor. Register it before the
fit-to-height pass (or re-fit at its end) so fitting measures the
regrouped DOM.

Size behavior:

- **1×1**: the neutral render shows the open-PR count plus worst CI
  state; the enhancer rewrites it to the count needing the viewer's
  review.
- **Short tiles** (any width, under ~380px tall — 2×1 and 4×2 included):
  one ledger only, the actionable group — `Blocked` in the neutral
  render, swapped by the enhancer to `Needs your review` (one repo) or
  the review-requested repos (several) — with the rest trimmed to
  `+N more`. A short tile answers "what's actionable" (and "what needs
  me" once personalized), not "show me everything"; hide the lower
  groups outright rather than collapsing each to a header + `+N more`,
  which spends the height on empty section chrome. Gate this on the tile
  stamp so the raw page keeps every group.
- **Tall tiles** (~380px+): every group, each fit-trimmed from the bottom.
- **Wide tile / full view**: a real table — the same ledger grid with a
  12px mono header row (`pr · ticket · size · state · age`), columns
  aligned by subgrid, hairline-separated rows. Spend width on columns,
  not longer lines.

Degrade gracefully: a repo that can't be read gets an "unreachable" row, not
an error; no watched repos configured → an empty state telling the user to
set the routine's repositories.
