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
`data/routines.yaml` — treat those as the user's standing guidance (which
projects matter, what to ignore, tone).

## Gather

Collect, in order of usefulness, whatever is reachable from this
environment — skip silently anything that isn't:

1. Today's calendar events (if a calendar tool is connected).
2. Open tasks/issues assigned to the user in connected trackers.
3. Yesterday's plan (previous artifact at `w/<slug>/index.html` on the
   `artifacts` branch, if it exists) — anything unfinished becomes a
   carry-over.

## Compose

- **Top priorities**: at most 3, one line each. Derive from instructions +
  gathered data; when in doubt, prefer what the instructions emphasize.
- **Time blocks**: a full time-block plan (Cal Newport style) — every
  30-minute slot from day start to shutdown has a job, snapped to
  :00/:30. The day span comes from the day itself: the working hours the
  instructions state, else today's calendar (start at or before the
  first commitment, end at the workday's close). Build it in order:
  1. Place the fixed commitments: calendar events and personal blocks
     (gym, meals, family). Declined/cancelled events are not blocks —
     when their slot is reallocated, say so in the new block's note
     (`was: Corza sync — declined`).
  2. Give the largest remaining gaps to **deep blocks** executing the
     top priorities — 90m–2h each, earliest gaps first. Put a one-line
     `goal:` note on each (what done looks like by the block's end).
  3. Batch the shallow work — review queues, replies, small carry-overs —
     into named 30–60m blocks, and end the day with a 30m **shutdown**
     block (clear queues, plan tomorrow).
  4. Whatever remains is a **free** block: honest slack, labeled with
     what it buffers.
     Block types are deep / meeting / shallow / personal / free — the
     `widget-artifact` design language defines their tones and the three
     renderings (ledger, day strip, time grid).
- **Day totals**: sum deep / meetings / shallow / free hours — the
  process metric the totals line renders.
- **Carry-overs**: unfinished items from the previous plan, max 5.

## Author the artifact

Follow the `widget-artifact` skill for the HTML contract (self-contained,
gruvbox tokens, breakpoints, generated-at meta + footer). Size behavior:

- **1×1**: count of priorities done/total plus the single top priority.
- **2×1 / 1×2**: the three priorities as a list.
- **2×2 and larger**: priorities, then the day (strip + block ledger),
  then carry-overs; wide tiles add the totals line.
- **Tall wide tiles (~4 rows and up), raw page, full view**: the
  30-minute time grid with the live now line — the plan you read the
  day from, spanning the full day range. Past blocks always stay
  visible (they recede, never disappear).

Degrade gracefully: with no reachable data sources, still publish a plan
derived from the instructions alone, with an explicit "no live data" note.
