---
name: repo-narrative
description: >-
  Narrate a repository's window as a steward widget artifact — what happened
  in the last N days and what lands in the next N — bottom line up front.
  Executed by the run-routine dispatcher (ADR-0021).
widget:
  artifact: "What shipped in the last N days and what lands in the next N, bottom line first"
  sizes:
    default: { cols: 3, rows: 2 }
    min: { cols: 1, rows: 1 }
  schedule: "0 7 * * 1"
  # Instances slug themselves <first-repo>-narrative (ADR-0040); `kind`
  # defaults to `narrative` from the template id.
  subjectParam: repos
  # Default band on every board (ADR-0044). Shipped-and-landing is a status
  # narrative, read by whoever tracks the window rather than the diff.
  category: Project Management
  params:
    - key: repos
      label: Repositories to narrate
      type: repos
      required: true
      hint: One story across all of them, never a section per repo
    - key: days
      label: Window in days
      placeholder: "7"
      hint: Looks back this many days and forward the same many
    - key: audience
      label: Who reads this
      placeholder: The CTO
      hint: Decides what counts as material and what is noise
    - key: jira
      label: Jira base URL
      placeholder: https://acme.atlassian.net
      hint: Ticket keys found in titles link into this site
    - key: people
      label: People registry
      placeholder: owner/repo:data/avatars-48.json
      hint: >-
        Optional. A committed JSON map, login to name and 48px data URI,
        for real faces on the rail. Needs the repo in the routine's repos
        list; without it faces fall back to GitHub, then to initials
---

# Repo narrative

The reader is an executive: accountable for this work, did not watch it
happen. They want the **verdict** and its consequences, not the log. A
changelog with nicer fonts is the failure mode this template exists to avoid.

## Compose

1. **`/prior-run`** — what the last run said was coming. Whether that landed is
   the most valuable sentence this widget can write, and only a recurring
   narrative can write it.
2. **`/github-history`** over `params.repos`, `--days params.days` (default 7),
   passing `params.jira`. It returns both halves of the window, the confidence
   bands ahead, CI as a rate, and a principal per half.
3. **`/people-registry`** over the logins it reported, using `params.people`.

`instructions:` say which work matters and what to ignore — and are often the
only source for work not yet filed, which lands in the `stated` band.

## Present

Write `data.json` per `$STEWARD/.claude/skills/widget-artifact/kit/CONTRACT.md`
and render it with the kit.

**Group into movements, not entries.** A movement is a theme with evidence
attached — "checkout moved from prototype to shippable" (7 PRs, CORZA-14x) —
never a PR with a title. That grouping is the whole executive transform; a list
of forty merged PRs at 14px is still a changelog. **One story across the
repos**: name the repo in the detail, never a section per repo.

- **`stat`** — what landed, `label` the window (`7 days`), and the window's own
  dates so it cannot be read as fresh when it is stale. Where the honest
  headline is a word rather than a count — a window where nothing moved, a gate
  that will not be met — use `verdict` instead, with the window on its `gate`
  and the figures as `clauses`.
- **`bottomLine` is the whole point of this template, and it is never
  optional.** One sentence, a verdict rather than a summary, answering _so
  what_ for `params.audience`. Find it the way BLUF says to: draft the
  narrative, read your last paragraph, move it to the top. **Bad news leads** —
  an executive who learns on line nine that a date is gone has been failed.
  It is not `verdict.caveat` (what the run could not check) and not a `note`
  (an aside): those are the slots a run reaches for when it has skipped this
  one, and a brief without this sentence is the changelog this template exists
  to avoid.
- **A `queue` block, "What happened"** — at most 5 movements, ordered by
  consequence, not chronology. `face` is the principal, `title` the movement
  (≤ ~6 words), `detail` its evidence, and the other-contributor count as a
  `+N` column rather than in the detail, where it would scan as one more
  identifier among the ticket keys.
- **A `rail: true` `queue` block, "What comes next"** — at most 5, each with
  its carrier and confidence band. The two face each other at the page tier and
  stack in narrative order below it.
- **A `queue` block, "At risk"** — what will slip, what waits on a named
  person, what needs a decision this week. Faces here too: the row's point is
  that a named human is the next move.
- **`keep` the risk rows and any "nothing shipped" row.** This is the one
  template where pinning is right, and the difference is the sort: the order
  here is narrative, so bad news sits at the bottom by construction and
  bottom-up trimming reaches it first. Elsewhere the queue is worst-first and
  the sort is the pinning.
- **`provenance`** — window bounds, repos read, PRs and issues audited,
  movements held back, anything unreachable.
- **`empty`** — no repos configured → a state naming the setting. A window with
  no activity is **not** empty: it gets a bottom line saying exactly that.

Viewer-neutral (ADR-0039) — the story is about the work. Name people in the
third person by their resolved display name, the same name the face carries on
hover, so the prose and the rail never disagree.

**Write plain.** Past tense behind, dated language ahead, numbers instead of
adjectives. Every superlative is a sentence that has not found its number yet.

## The context block

Every PR, issue and release behind each movement with numbers and titles; each
principal and every contributor the `+N` stands for, by name; the forward items
the tile capped with their evidence; what the previous run predicted and
whether it landed; the window bounds and anything unreachable.

Close with `## Ask me about` — whether the forward window is realistic, what to
cut if it isn't, what a movement that keeps reappearing is telling us, and
whether one name is carrying more of the window than is safe to depend on.
