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

Then resolve **display name and avatar in one authenticated call** per
unique person, and reuse both everywhere that person appears:

```bash
# Tab-separated, and split on tab ONLY: display names contain spaces
# ("Daniel Moraes"), so a bare `read -r name url` puts the surname in the
# URL and every fetch fails.
IFS=$'\t' read -r name avatar_url < <(
  gh api "users/$login" -q '[.name // .login, .avatar_url] | @tsv'
) || { name=$login; avatar_url=; }
```

`.name` falls back to the login when null or empty (most bots). It is the
one name this artifact uses — on hover over a face and in prose alike, per
the third-person rule below.

The avatar is inlined as a data URI, since widget-standard rule 1 forbids
images by URL. Fetch it **through `gh`, not bare curl**:

```bash
for attempt in 1 2; do
  # Authenticated (5000 req/hr). avatar_url always carries ?v=4, so &s=48
  # appends cleanly.
  [ -n "$avatar_url" ] && gh api "${avatar_url}&s=48" > "$tmp/$login" 2>/dev/null && break
  # Unauthenticated, rate-limited by IP — the backstop, never the default.
  curl -fsSL "https://github.com/$login.png?size=48" -o "$tmp/$login" && break
  sleep 2
done
```

`https://github.com/<login>.png` is throttled per IP, so on a busy day it
starts failing and rows silently drop to initials; `gh api` carries the
routine's token and shares the API's hourly budget, which is why it goes
first. Verify the result is an image (`file -b --mime-type`), base64 it
into a `data:<mime>;base64,…` URI, and only after **both** paths fail
twice let a person degrade to the initial fallback — never a broken image.

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

## Author the artifact

Follow the `widget-artifact` skill for the HTML contract; compose from its
design language (headings, sections, ledger rows with lead + detail,
avatars, the stat tier, pills, the now marker, the provenance line). The
`<h1>` carries the window the title bar can't (`Jul 14 → Jul 28`, mono).

### The face rail

Every movement opens with its principal's face, so both halves read down a
human spine: _who shipped this_ on the left, _who is carrying this_ on the
right. Use the design language's avatar component unchanged — an 18px
round `<img>` from the inlined data URI, wrapped in a link to
`https://github.com/<login>` (`target="_blank" rel="noopener"`), the link's
`title` and the img's `alt` both carrying the **display name**, so hover
answers _who_ with `Daniel Moraes` and never the handle `danielmoraes`.
Fetch failed → the initial-circle fallback at the same footprint.

Under the face sits the `+N` of other contributors, 12px mono
`--color-ink-faint`, rendered only when N ≥ 1. It belongs in the rail
rather than the detail line because the detail line already carries ticket
keys and PR numbers; a count of people dropped in among them reads as one
more identifier and gets scanned as one.

**Face and count are one cell, not two tracks.** The rail is a single
column whose cell stacks the two, and the stack is aligned deliberately:
the face on the lead's line, the count on the detail's, so the rail keeps
the row's two-line rhythm instead of introducing a third.

Give each item in the stack the row's own **20px line box** rather than
letting it size to itself. An 18px image and a 12px mono count both sit on
the text baseline otherwise, which rides the face 1px and the count 2.5px
above their partners — the ledger's "drifting rather than set" failure at
exactly the scale that reads as sloppiness without ever looking like a bug
(`widget-artifact` design.md · One shared line box per row):

```css
.face {
  display: grid;
  align-content: start;
  justify-items: center;
}
/* The row's line box, not the content's — this is what puts the face on
   the lead's centre (measured: 0px off with, 1px above without). */
.face > * {
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.face .n {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-ink-faint);
}
```

The same rule is what makes the initial-circle fallback interchangeable
with a real avatar: both are normalized to the row's box, so a run where
half the fetches failed still sets one clean spine.

**Declare the rail once per half.** The two columns face each other across
the `now` seam, so they are separate grids and cannot share tracks — each
side gets its own `max-content` rail at the head of its own template, and
each sizes to its own faces. Relay it the usual way (`section`, `ul`, `li`
each `display: grid; grid-template-columns: subgrid`) and hold the
unplaced-item rule on **both** halves: a heading or a stray block left
unplaced lands in the rail track, inflates it to its own width, and squeezes
the `minmax(0, 1fr)` lead column beside it to zero — the failure that reads
as "the widget broke" rather than as a mistake with an address
(`widget-artifact` design.md · Ledger rows).

**A row with no face keeps the track and paints nothing.** An empty rail
cell is the honest render of a `stated` item, and the reserved width is
what keeps every lead on one spine instead of stepping in and out by row.

Relaying the rail rather than faking it with padding is also what buys the
hanging indent: on a narrow tile the detail line wraps under the lead, not
under the face, because the body genuinely occupies its own track.

The rail rides every tier that renders rows, 2×1 up through the full page.
It is never on the 1×1 stat tier, which has no rows to attribute.

Size behavior:

- **1×1**: the stat tier — what landed, in mono (`7 shipped`, label `7
days`) — with the bottom line as its one support line, clamped to two
  lines. The stat is the glance; the sentence is why anyone would open it.
- **2×1 / 1×2**: the bottom line in full, then the top movement behind and
  the nearest committed item ahead, each with its face. Two rows is where a
  face is cheapest and clearest: the rail costs its width once, and the
  tile answers _who shipped it_ and _who has it now_ without a word.
- **2×2**: the bottom line, then the behind ledger, then risks.
- **Wide tile (3–4 cols)**: the window's own shape — `what happened` and
  `what comes next` as two columns facing each other, meeting at a **now**
  seam (the design language's now marker, ink at the divider). Spend the
  width on the second column, not on longer lines. The two rails cost about
  28px a side; take it from the detail line's measure, which wraps, and
  never by dropping evidence. Both columns carry `data-fit-list`: a column
  with no trimmable list is a floor the fit pass can't get under, and it
  will trim the other column to nothing while the tile still overflows
  (`widget-artifact` § fit-to-height).
- **Full view / raw page**: a page. The bottom line as a lede at the
  long-form measure (~72ch), then both halves in full with every movement's
  evidence, then risks, then the provenance line above the footer: window
  bounds, repos read, PRs and issues audited, movements held back, and any
  source unreachable this run.

Risk rows and the "nothing shipped" row are load-bearing — mark them
`data-fit-keep` so a short tile can't trim its way into reporting only good
news.

Degrade gracefully: a repo that can't be read gets an "unreachable" note in
the provenance line and drops out of the story rather than erroring. A
window with no activity behind it gets a bottom line that says exactly
that — silence is the finding, and padding it with process detail buries
it. No repos configured → an empty state telling the user to set the
routine's repositories.

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
