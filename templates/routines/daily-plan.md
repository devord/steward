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
- **Time blocks**: the day's fixed commitments in chronological order.
- **Carry-overs**: unfinished items from the previous plan, max 5.

## Author the artifact

Follow the `widget-artifact` skill for the HTML contract (self-contained,
gruvbox tokens, breakpoints, generated-at meta + footer). Size behavior:

- **1×1**: count of priorities done/total plus the single top priority.
- **2×1 / 1×2**: the three priorities as a list.
- **2×2 and larger**: priorities, then time blocks, then carry-overs.

Degrade gracefully: with no reachable data sources, still publish a plan
derived from the instructions alone, with an explicit "no live data" note.
