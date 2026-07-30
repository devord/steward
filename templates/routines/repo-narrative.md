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

Tell the story of a repository window as a widget artifact. You are invoked
by the `run-routine` dispatcher with the routine's `params:` and
`instructions:` from `data/routines.yaml`. The repositories are
`params.repos`; treat `instructions:` as standing guidance (which work
matters, what to ignore, tone).

The reader is an executive: someone accountable for this work who did not
watch it happen. They want the **verdict** and its consequences, not the
log. A changelog with nicer fonts is the failure mode this template exists
to avoid.

## The window

`params.days` (default **7**) sets a window symmetric around the run:
`[now − days, now]` is what happened, `(now, now + days]` is what comes
next. Both halves are the same width on purpose — the reader compares them
directly, and "we shipped four things and three are due" is a sentence only
a symmetric window can produce.

The window slides with the run, so **date it explicitly** in the render
(`Jul 14 → Jul 21 → Jul 28`). An undated narrative can't be read as stale.

## Gather

Resolve the window's two bounds first, then collect per repo via `gh`
(preferred) or the GitHub API. Skip silently whatever this environment
can't reach; note it for the provenance line.

**Behind (what happened):**

1. Merged PRs, the spine of the story:

   ```bash
   gh pr list --repo "$repo" --state merged --limit 100 \
     --search "merged:>=$since" \
     --json number,title,url,author,mergedAt,additions,deletions,labels
   ```

2. Issues opened and closed in the window (`gh issue list --search
"closed:>=$since"`, same for `created:`), which carry the work that
   never became a PR.
3. Releases and tags published in the window (`gh release list`).
4. Default-branch CI health across the window, as a rate rather than a
   snapshot (`gh run list --branch "$default" --created ">=$since"`): "red
   nine times out of forty" is a finding; today's green dot is not.
5. **The previous artifact** (`w/<slug>/index.html` on the `artifacts`
   branch), for what the last run said was coming. Whether that landed is
   the most valuable sentence this widget can write, and only a recurring
   narrative can write it. Read it for data only; never reuse its markup
   or CSS (`run-routine` § 4).

**Ahead (what comes next):**

6. Open PRs, with `reviewDecision` and `statusCheckRollup` — an approved PR
   with green checks is nearly landed; a draft is not.
7. Milestones with a due date inside the window (`gh api
repos/$repo/milestones`), plus their open/closed counts.
8. Commits on the default branch since the last release tag — the contents
   of the next release, whether or not one is scheduled.
9. Whatever `instructions:` states is planned, which is often the only
   source for work that hasn't been filed yet.

Sort every forward item into one of three **confidence** bands, because an
executive reads a plan and a hope very differently:

- **committed** — a dated milestone, an approved PR with passing checks, a
  scheduled release. A fact with a date.
- **in flight** — open and moving inside the window (commits, review
  activity), but nothing binds it to a date.
- **stated** — named in `instructions:` or an issue, with no work visible
  against it yet.

**Never forecast past the evidence.** A window with nothing scheduled ahead
gets an honest "nothing is committed for the next 7 days," which is itself
a finding worth an executive's attention. An invented roadmap is the one
output that makes this widget worse than nothing.

**The people (who did it, who is leading it):**

A movement is a theme, not a PR, so its face is not "the author" the way a
queue row's is. Resolve one **principal** per movement out of the evidence
already gathered, plus a count of everyone else:

- **Behind** — the person with the most merged PRs in the movement; ties
  broken by lines changed, then by the most recent merge. The other
  distinct authors are the row's `+N`.
- **Ahead** — whoever is moving it: the author of the movement's open PRs
  (most, then most recently pushed), else the assignee on its issue or
  milestone. Others counted the same way.
- **Attribution never outruns evidence.** A `stated` item usually has
  nobody visible against it yet — that is what the band _means_. It gets
  **no face**, not a guessed one. Inventing an owner for unstarted work is
  the attribution form of the invented roadmap above, and it lands harder:
  it puts a person's name on a commitment they never made, in front of the
  executive who would hold them to it.

Then resolve a **display name and a face** per unique person, and reuse both
everywhere that person appears: `params.people` registry first, then
`gh api users/<login>` for the name, then the login itself. **Never fetch an
avatar image** — the kit takes a `data:` URI and drops anything else, so a
fetched URL is bytes spent on a row that renders an initial regardless.

The name matters twice over here — it is the hover label on a face _and_
the name this artifact says in prose, per the third-person rule below — so
a registry that carries `Daniel Moraes` beats a `.name` field that is null
for most bots and stale for everyone else.

The face rail is the reason to bother with the registry at all. Both halves
of this artifact read down a human spine by design, and the image fetch it
used to lead with reaches `avatars.githubusercontent.com`, a host a
scheduled run cannot get to — so the weekly run, the one an executive
actually reads, was the run that lost every face (ADR-0044).

A window has far fewer distinct people than it has PRs. Resolve once per
person and reuse; never per row, and never per repo.

## Compose: bottom line up front

**BLUF** is the military communications standard this artifact is written
in: the conclusion leads, and everything after it is support the reader may
stop reading at any point.

**The bottom line is one sentence, and it is the first thing in the
artifact at every tier.** It answers _so what_ for `params.audience` (the
CTO reads margin and risk; a client's product lead reads their features).
It is a verdict, not a summary: "Checkout is a week from shippable; the
payments integration is the only thing still in the way" — not "Several
PRs were merged this week."

Find it the way BLUF says to: draft the narrative, then **read your last
paragraph**. The bottom line is almost always hiding at the end of a first
draft, where the reasoning finally arrives somewhere. Move it to the top
and delete what it made redundant.

Then delete the throat-clearing. There is no scene to set, no evidence to
build toward, no "this week saw a number of changes across the
repository." The first sentence is the conclusion.

**Bad news leads too.** BLUF's usual exception — soften the delivery of
sensitive news — inverts here: an executive who learns on line nine that a
date is gone has been failed by the writing. A slip, a stalled review, a
month of red CI goes in the bottom line if it is the most important thing
in the window.

**Group into movements, not entries.** A movement is a theme with evidence
attached — "checkout moved from prototype to shippable" (7 PRs, CORZA-14x)
— never a PR with a title. Grouping is the whole executive transform; a
list of forty merged PRs at 14px is still a changelog. Cap it: **at most 5
movements behind, 5 ahead**, ordered by consequence, not chronology. What
didn't make the cut goes in the context block, which is richer than the
render by design.

Each movement is a design-language **lead + detail** row: the movement
named in the lead (≤ ~6 words, weight 500), its evidence as detail
(counts, ticket keys, PR numbers, the confidence band ahead). Never one
undifferentiated sentence per row.

**One story across the repos.** Several watched repos are an implementation
detail of where the work lives; the executive's story is the work. Group by
movement and name the repo in the detail, never a section per repo.

**Write plain.** Past tense behind, dated language ahead. Numbers instead of
adjectives — "shipped 7 of 9 planned" beats "made strong progress." Every
superlative ("significant", "exciting", "robust") is a sentence that hasn't
found its number yet.

**Say what is at risk.** Close the narrative with what will slip, what is
waiting on a named person, and what needs a decision this week. This is the
section an executive acts on; "nothing is waiting on a decision" is a real
and welcome answer, not an empty state to hide. A risk that waits on
someone carries that person's face on the same rail as the movements —
this is where a face is worth the most, because the row's whole point is
that a named human is the next move.

This artifact is **viewer-neutral** (ADR-0039): the story is about the
work, not the reader, so no "you" or "yours" appears anywhere and no
render-time enhancer is needed. Name people in the third person by the
display name resolved above — the same name a face carries on hover, so
the prose and the rail never disagree about what someone is called.

## Emit

Write `data.json` and render it with the kit — the shape is documented once in
`$STEWARD/.claude/skills/widget-artifact/kit/CONTRACT.md`; read it rather than
inferring from this description. This routine's mapping onto it:

- **`stat`** — what landed, in the window's own terms: `value` the count,
  `label` the window (`7 days`). At 340×160 that is the glance.
- **`stat.note`** — the **bottom line**, and this is the one place it can live
  where it survives to every tier. It is the first thing in the artifact at
  every size by construction rather than by remembering.
- **A `queue` block, "What happened"** — one row per movement behind, at most
  five, ordered by consequence. `face` is the movement's principal. `title` is
  the movement named (≤ ~6 words), `detail` its evidence — counts, ticket
  keys, PR numbers, the repo. `values` carry the other-contributor count as
  `+N`, and it goes in a column rather than in `detail` because the detail line
  already carries ticket keys and PR numbers; a count of people dropped among
  them reads as one more identifier and gets scanned as one.
- **A `rail: true` `queue` block, "What comes next"** — the forward movements,
  at most five, each with the person carrying it and its confidence band.

  The two blocks are the window's own shape: what happened and what comes next
  facing each other at the page tier, meeting at the seam between the columns.
  Below that tier they stack in reading order, which is also narrative order.

- **A `queue` block, "At risk"** — what will slip, what waits on a named
  person, what needs a decision this week. Give the person's `face` here too:
  the row's whole point is that a named human is the next move, which is where
  a face is worth the most.
- **`provenance`** — window bounds, repos read, PRs and issues audited,
  movements held back, and any source unreachable this run.
- **`empty`** — no repos configured → a state naming the routine setting to
  fill in. A window with genuinely no activity is **not** empty: it gets a
  bottom line saying exactly that, because silence is the finding and padding
  it with process detail buries it.

Do not hand-write HTML or CSS. Do not size, trim or theme anything — the rail,
the face column, the shared line box and the two-column seam are all the kit's.

### This is the template where `keep` is right

Mark the **risk rows** and the "nothing shipped" row `keep`.

That runs against the usual advice, and the difference is the sort. Elsewhere
the queue is ordered worst-first, so the sort _is_ the pinning and `keep` on
top of it makes a short tile advertise its calmest rows. Here the order is
**narrative** — bottom line, then what happened, then what is next, then what
is at risk — so the bad news sits at the bottom by construction and bottom-up
trimming reaches it first. Without the pin a short tile trims its way into
reporting only good news, which is the exact failure `keep` exists for.

The test is not "is this important" but "would the sort already have saved
it". Here it would not.

### Faces come from the registry

**The image, and only the image, is the thing never fetched.** `face.src` must
be a `data:` URI — the kit drops anything else — so it comes from
`params.people` or not at all. A fetched avatar URL is bytes spent on a row
that renders an initial regardless, and the host a scheduled run would reach
for it is one it cannot get to (ADR-0044).

**The name follows the full chain in § Gather**, `gh api users/<login>`
included. That lookup returns text, which the artifact then carries, so it has
none of the image's problem — and skipping it means rendering `danielmoraes`
where the registry-and-API pair would have given `Daniel Moraes`.

Only when every step fails is **the name the login**: never empty, never
omitted. It is what the initial comes from and what hover and a screen reader
read, so a face without one identifies nobody.

A row with no face is fine. The kit keeps the column and paints nothing, which
is the honest render of a `stated` item and keeps every lead on one spine.

Degrade gracefully: a repo that cannot be read gets an `unreachable` note on
the provenance line and drops out of the story rather than erroring.

## The context block

Carry a context block (`widget-artifact` § The context block): every PR,
issue, and release behind each movement (numbers and titles, so they can be
opened without a lookup), each movement's principal and every contributor
the `+N` stands for, by display name — the rail has room for one face, the
block has room for the team — the forward items the tile capped, each one's
confidence band and the evidence for it, what the previous run predicted
and whether it landed, and the window bounds with anything unreachable.
Close with `## Ask me about` — whether the forward window is realistic,
what to cut if it isn't, what a movement that keeps reappearing across runs
is telling us, and whether one name is carrying more of the window than is
safe to depend on.
