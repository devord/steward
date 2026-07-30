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

Author a digest of repository activity as a widget artifact. You are
invoked by the `run-routine` dispatcher with the routine's `params:` and
`instructions:` from `data/routines.yaml`. The repositories to watch are
`params.repos`; treat `instructions:` as extra guidance (what to
emphasize, what to ignore).

## Gather

Do **not** resolve a "you" here. Whoever runs the routine is not the
viewer. The artifact is published once and read by everyone the board is
shared with, so "needs your review" / "yours" is settled at render time
against the signed-in viewer, not baked to the runner (widget-standard
"Person-relative content", ADR-0039). Carry each PR's **raw
relationships** (author and requested reviewers) and let the artifact
bucket them per viewer.

For each watched repo, via `gh` (preferred) or the GitHub API:

1. Open PRs with per-PR structure, one call:

   ```bash
   gh pr list --repo "$repo" --limit 50 \
     --json number,title,url,author,isDraft,reviewDecision,reviewRequests,statusCheckRollup,createdAt,additions,deletions
   ```

   Derive per PR: **author** (`author.login`), **reviewers** (the
   directly-requested reviewer logins from `reviewRequests`, users
   only, drop teams; a team-only request is nobody's "need you"),
   **state** (`draft` / `changes requested` / `approved` /
   `review required`, from `isDraft` + `reviewDecision`), **CI**
   (worst conclusion in `statusCheckRollup`: failing > pending >
   passing; no checks → none), **age** from `createdAt`, **size** from
   `additions`/`deletions`, **ticket** (the first Jira-style key
   `[A-Z][A-Z0-9]+-\d+` in the title, if any), and **display
   title**: the title with any conventional-commit prefix
   (`type(scope):` / `type:`) stripped; keep the raw title too, it
   becomes the row's tooltip. If stripping leaves nothing, keep the
   raw title. Carry `author` and `reviewers` onto the row as data. The
   "mine" / "needs me" judgement is deferred to render time, not
   decided here.

   Then resolve a **display name and a face** for each unique author, and
   reuse both on every row by that author: `params.people` registry first,
   then `gh api users/<login>` for the name, then the initial circle. **Do
   not fetch an avatar image** — the kit takes a `data:` URI and drops
   anything else, so a fetched URL is bytes spent on a row that will render
   an initial anyway.

   The registry is the step that matters here. A PR queue is a column of
   faces, and the fetch it used to lead with reaches
   `avatars.githubusercontent.com` — a host a scheduled run cannot get
   to, so every row degraded to an initial on exactly the runs nobody
   was watching (ADR-0044). Set `params.people` and the faces come from
   a file instead.

2. Issues opened since the last run (previous artifact's generated-at time,
   else the last 24h).
3. Latest default-branch CI status. Name the watched repo explicitly
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
markup; it is produced by the enhancer against the signed-in viewer.

**Neutral static (published).** Group PRs by state, the objective axis:
`Blocked` (changes requested or failing CI) → `In review` (review
required or pending CI) → `Open` (approved, draft, otherwise idle),
oldest first within each group; counts in the section labels. No
"you"/"yours" anywhere in this render.

**Viewer-faceted (render-time).** When a viewer is injected and authors
or is directly requested on ≥1 PR, re-group into `Needs your review`
(viewer among the row's `reviewers`) → `Yours` (viewer is the `author`;
blocked first) → `Open` (the rest); oldest first within each, since old
_and_ waiting on you is the emergency. A viewer with no PRs here, or the
raw page, keeps the neutral render untouched.

- **One repo watched**: PR rows grouped by state, per the rules above, and
  the faceting applies.
- **Several repos**: the repo becomes the grouping axis, each carrying its
  own summary (`N PRs · K new issues · CI ✓/✗`), ordered by activity.
  **The faceting does not apply here** — see Emit: re-bucketing by viewer
  would flatten the repos away, and which repo a PR belongs to is the thing
  this shape exists to show.

## Emit

Write `data.json` and render it with the kit — the shape is documented once in
`$STEWARD/.claude/skills/widget-artifact/kit/CONTRACT.md`; read it rather than
inferring from this description. This routine's mapping onto it:

- **`stat`** — the open-PR count, `label` `"open PRs"`, `note` carrying the
  worst CI state and the blocked count (`"2 blocked · CI passing"`).

  It stays viewer-neutral at every tier. The count a viewer actually wants —
  how many wait on them — arrives as the first group's heading
  (`Needs your review · 3`), which is both where they are already looking and
  the only place it can be honest, since the glance tier is one figure and
  that figure has to be true for a reader who is not signed in.

- **One `queue` block, grouped.** `groups` are the states in order — `Blocked`
  → `In review` → `Open` — each with its count. One block, not three: groups
  share a column set, so every review glyph and age sits on the same vertical
  down the whole ledger. Three separate blocks would give each its own column
  widths, which is the misaligned-state smell.
- **`viewerGroups`** — `{reviewer: "Needs your review", author: "Yours",
rest: "Open"}`. The board resolves those against the signed-in viewer at
  render time and re-buckets the rows itself. **Do not write an enhancer**:
  that behaviour is injected now, and a transcribed copy of it would be the
  one kind of drift nobody sees — a mis-bucketed queue shows one person
  another person's work and looks entirely correct doing it.
- **Rows.** `face` is the author (name plus a `data:` avatar from the
  `people` registry — a URL is dropped, see below). `data` carries
  `{author: "<login>", reviewers: "<space-separated logins>"}`, which is what
  the board buckets on. `title` is `#num display-title` linking to the PR,
  with the raw title in `title` so the stripped prefix is one hover away.
  `values`, in order:

  | column | from     | notes                                                                                                             |
  | ------ | -------- | ----------------------------------------------------------------------------------------------------------------- |
  | ticket | `detail` | the Jira key, `tone: "info"`, linked when `jira` is set                                                           |
  | size   | `page`   | `+adds −dels`, U+2212 minus                                                                                       |
  | review | `always` | `icon`: `check` approved · `circle-x` changes requested · `pencil` draft · `clock` review required                |
  | ci     | `always` | `icon`: `check` passing · `circle-x` failing · `clock` pending; omit the value entirely when the PR has no checks |
  | age    | `always` | numeric                                                                                                           |

  **Tone only what is actionable.** A passing check and an approval are the
  healthy states and take no tone — the column reads as texture until
  something is wrong. The kit renders the glyph with the word beside it at the
  page tier and screen-reader-only below, so a state is never carried by shape
  alone.

- **Several repos** — make the groups the repos rather than the states, with
  each repo's summary on the group's `count`
  (`"6 PRs · 2 new issues · CI ✓"`). Order by activity. One repo keeps the
  state grouping above.

  **Set `viewerGroups` only in the one-repo shape.** The two groupings compete
  for the same axis: re-bucketing into `Needs your review` / `Yours` / `Open`
  flattens the repos away, and which repo a PR belongs to is the thing the
  several-repos shape exists to show. So several repos keep the repo grouping
  and lose the personalisation, rather than getting a personalisation that
  destroys their organising idea.

  This is a deliberate reduction from what the widget did before, where a
  per-row `needs you` marker carried ownership inside repo sections. The
  injected regrouping does not write per-row markers, and the alternative —
  reintroducing a routine-authored enhancer to do it — is exactly the
  transcribed behaviour this migration removes. Worth revisiting as a kit
  component if the several-repos shape turns out to need it; not worth a
  hand-written script per run.

- **`provenance`** — `["3 repos watched", "14 open PRs", "2 new issues",
"default branch passing"]`.
- **`empty`** — "No open pull requests" when the repos read clean, or a
  pointer to set the routine's Repositories when none are configured. Two
  states, not one.

Do not hand-write HTML, CSS or JavaScript. Do not size, trim or theme
anything.

### The faces come from the registry

`face.src` must be a `data:` URI and the kit **drops anything else**. The
resolution chain used to lead with a fetch to `avatars.githubusercontent.com`,
a host a scheduled run cannot reach, so every row degraded to an initial on
exactly the runs nobody was watching (ADR-0044). Set `params.people` and the
faces come from a file. An initial circle is the honest fallback; a request
that cannot succeed is not.

### Ordering is the trim priority

Emit `Blocked` first and the fit pass sheds from the calm end by itself, which
is what a short tile should do — it answers "what is actionable", not "show me
everything". **Do not pin rows** to protect the blocked ones: on a set already
ordered worst-first the order is the pinning, and `keep` on top of it makes a
short tile advertise the rows it was supposed to shed.

A group trimmed to nothing keeps its heading and its count, so `Open · 7`
still reports seven where hiding it would say none.

### Degrade gracefully

A repo that cannot be read gets an `unreachable` row rather than an error. No
watched repos configured → the empty state naming the routine setting to fill
in.

## The context block

`context` is markdown and stays **viewer-neutral like the render** — the block
is copied by whoever is looking, and the run does not know who that is.

Spend it on every PR the tile trimmed, why each blocked one is blocked
(failing check, requested reviewer, merge conflict), the age outliers, and any
repo that read as unreachable. Name PR numbers and logins so they can be acted
on without a lookup.

Close with `## Ask me about` — what to review first, which PRs have gone stale
enough to close, and what a repeatedly-failing check is telling us.
