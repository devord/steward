---
name: daily-plan
description: >-
  Produce today's working plan as a steward widget artifact: top priorities,
  scheduled blocks, and carry-overs. Executed by the run-routine dispatcher
  on a morning schedule (ADR-0021).
widget:
  artifact: "Today's plan: top 3 priorities, time blocks, and carry-overs"
  sizes:
    default: { cols: 2, rows: 2 }
    min: { cols: 1, rows: 1 }
  schedule: "0 8 * * *"
  connectors: [Google_Calendar]
---

# Daily plan

Author today's working plan as a widget artifact. You are invoked by the
`run-routine` dispatcher with the routine's `instructions` from
`data/routines.yaml`. Treat those as the owner's standing guidance (which
projects matter, what to ignore, tone).

A daily plan has **one subject**, the person it is for, and the board it
lands on may be shared, so it is read by people who are not that person
(widget-standard "Person-relative content", ADR-0039). **Name the owner in
the third person; never write "you."** Title the artifact
`<Owner>'s Daily Plan` and phrase throughout as "Daniel has 3 deep blocks
left," not "you have." Resolve the owner's display name once, from the
richest source reachable this run: a connected calendar/account's own
identity, else `gh api user -q .name` (falling back to the login), else a
name the `instructions` state. If nothing resolves, title it plainly
`Daily Plan` and stay third-person ("today's plan"), never inventing a
name.

## Gather

Collect, in order of usefulness, whatever is reachable from this
environment, skipping silently anything that isn't:

1. Today's calendar events (if a calendar tool is connected).
2. Open tasks/issues assigned to the owner in connected trackers, the
   actionable items a single day is planned around. Exclude epics,
   projects, and milestones at the source (e.g. Jira `issuetype not in
(Epic)`) so their keys never enter context: they group work, they are
   not a day's work. The exclusion is total. An epic must not appear
   _anywhere_ in the plan (see Compose), only the concrete child tasks
   under it.
3. Yesterday's plan (previous artifact at `w/<slug>/index.html` on the
   `artifacts` branch, if it exists), where anything unfinished becomes a
   carry-over. Read it for data only; never reuse its markup or CSS
   (`run-routine` § 4).

## Compose

- **Top priorities**: at most 3, one line each. A short imperative
  **lead** (what to do, ≤ ~6 words) followed by the ticket key and the
  evidence as **detail** (the design language's lead + detail row), never
  one undifferentiated sentence. Derive from instructions + gathered data;
  when in doubt, prefer what the instructions emphasize.
- **Time blocks**: a full time-block plan (Cal Newport style), where every
  30-minute slot from day start to shutdown has a job, snapped to
  :00/:30. The day span comes from the day itself: the working hours the
  instructions state, else today's calendar (start at or before the
  first commitment, end at the workday's close). Build it in order:
  1. Place the fixed commitments: calendar events and personal blocks
     (gym, meals, family). Declined/cancelled events are not blocks.
     When their slot is reallocated, say so in the new block's note
     (`was: Corza sync — declined`).
  2. Give the largest remaining gaps to **deep blocks** executing the
     top priorities, 90m–2h each, earliest gaps first. Put a one-line
     `goal:` note on each (what done looks like by the block's end). Name
     the concrete task the block advances, never the epic it rolls up to.
     Epics stay out of labels and goal notes just as they stay out of the
     item lists.
  3. **Label every work block `Type — Project: task`**, concise (≤ ~6
     words after the colon): the label is the block's name on the grid,
     the `goal:` note is its detail, so ticket enumerations go in the note,
     never the label. The project is the tracker's project (or what the
     instructions call it); it is what per-project totals sum, so spell it
     consistently across blocks. Personal and free blocks carry no
     project.
  4. Batch the shallow work (review queues, replies, small carry-overs)
     into named 30–60m blocks, and end the day with a 30m **shutdown**
     block (clear queues, plan tomorrow).
  5. Whatever remains is a **free** block: honest slack, labeled with
     what it buffers.
     Block types are deep / meeting / shallow / personal / free. The
     `widget-artifact` design language defines their tones and the three
     renderings (ledger, day strip, time grid).
- **Day totals**: sum deep / meetings / shallow / free hours, and the
  hours per project from the work blocks' `Type — Project: task` labels.
  Those are the two process metrics the totals lines render (by type, by
  project).
- **Carry-overs**: unfinished items from the previous plan, max 5.

## Author the artifact

Follow the `widget-artifact` skill for the HTML contract (self-contained,
gruvbox tokens, breakpoints, generated-at meta + footer). Size behavior:

- **1×1**: count of priorities done/total plus the single top priority.
- **2×1 / 1×2**: the three priorities as a list.
- **2×2 and larger**: priorities, then the day (strip + block ledger),
  then carry-overs; wide tiles add the totals lines (by type, by
  project).
- **Tall wide tiles (~4 rows and up), raw page, full view**: the
  30-minute time grid with the live now line, the plan its owner reads
  the day from, spanning the full day range, with its right-side
  details column carrying each block's `goal:` note beside the block
  (design language: the box keeps the concise label, the column keeps
  the detail). Past blocks always stay visible (they recede, never
  disappear).

Degrade gracefully: with no reachable data sources, still publish a plan
derived from the instructions alone, with an explicit "no live data" note.
