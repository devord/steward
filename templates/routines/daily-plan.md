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
  connectors: [Google-Calendar]
  # No `category:` on purpose (ADR-0044). A daily plan is person-owned, not
  # a facet of a project, so it has no honest place on the band axis and
  # leads a board in the unlabeled band. Give an instance one with its own
  # `category:` if a board wants it filed.
---

# Daily plan

One person's day, planned. It has **one subject** and lands on a board others
read, so **name the owner in the third person and never write "you"**
(ADR-0039): "Daniel has 3 deep blocks left." Title it `<Owner>'s Daily Plan`,
resolving the name from the richest source this run reaches — a connected
account's own identity, else `gh api user -q .name`, else what `instructions:`
state. Nothing resolves → plainly `Daily Plan`, still third person, never an
invented name.

## Compose

1. **Today's calendar events**, if a calendar connector is attached.
2. **`/jira-issues`** for what is assigned to the owner and still open,
   excluding types that group work — `issuetype not in (Epic)` — at the query,
   so their keys never enter context. The exclusion is total: an epic must not
   appear anywhere in the plan, only the concrete tasks under it.
3. **`/prior-run`** — yesterday's plan, whose unfinished items are today's
   carry-overs.

`instructions:` are the owner's standing guidance: which projects matter, what
to ignore, tone. Skip silently whatever this environment cannot reach.

## Present

Write `data.json` per `$STEWARD/.claude/skills/widget-artifact/kit/CONTRACT.md`
and render it with the kit.

**Build the day in this order**, snapped to :00/:30, spanning the working hours
`instructions:` state or the day the calendar shows:

1. **Fixed commitments** — calendar events and personal blocks. A declined or
   cancelled event is not a block; when its slot is reallocated, say so in the
   new block's note (`was: Corza sync — declined`).
2. **Deep blocks** into the largest remaining gaps, 90m–2h, earliest first, each
   executing a top priority with a one-line `goal:` note saying what done looks
   like. Name the concrete task, never the epic.
3. **Label every work block `Type — Project: task`**, ≤ ~6 words after the
   colon. The label is the block's name on the grid and the `goal:` note is its
   detail, so ticket enumerations go in the note. Spell the project
   consistently — it is what the per-project totals sum.
4. **Batch the shallow work** into named 30–60m blocks, and end with a 30m
   **shutdown**.
5. **Whatever remains is `free`** — honest slack, labelled with what it buffers.

Then:

- **`stat`** — priorities done over planned (`2 of 3`), label `"priorities
done"`, `note` what is left and the day's shape (`3 deep blocks left · 4.5h
deep · 2h meetings`). At 340×160 that is the whole plan.
- **A `queue` block, "Top priorities"** — at most 3. `state` is `done` / `now` /
  `next`, `title` the imperative lead (≤ ~6 words), `detail` the ticket key and
  the evidence. Never one undifferentiated sentence.
- **A `day` block** — the day's span, `now` the run time, one entry per block
  with its `type` (`deep` / `meeting` / `shallow` / `personal` / `free`), its
  label and its `goal:` as the `note`. **Do not lay out the grid** — placing
  blocks by their real times, receding what is past and drawing the now line is
  the whole of what the kit does here.
- **A `rail: true` `queue` block, "Carry-overs"** — at most 5, with how long
  each has been waiting.
- **`provenance`** — hours planned, and the by-type and by-project sums the
  block labels produce. Those are the two process metrics.
- **`empty`** — nothing reachable → a designed state naming what could not be
  read, with the plan still derived from `instructions:` where they carry
  enough. A plan with no live data is a real answer; a blank tile is not.

## The context block

The full carry-over list rather than the capped five, what each priority is
waiting on, the conflicts and overruns the grid could only show as geometry,
and which sources were unreachable.

Close with `## Ask me about` — resequencing the day, what to drop when the
blocks don't fit, and what a carry-over keeps slipping past.
