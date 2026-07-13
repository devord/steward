# ADR-0027: One design language for widget artifacts

## Status

Accepted (2026-07-13)

## Context

The widget standard constrained artifacts structurally — tokens
(ADR-0007), breakpoints, type floors, no-scroll tiles (ADR-0019) — but
said nothing about composition. Each routine run invented its own layout
from scratch: flat `::before`-bullet lists whose wrapped lines fell under
the bullet, no column alignment, content adrift in the top-left of a
half-empty tile, and a "full view" that was the same stack stretched
wide. A board of such widgets read as a pile of unrelated pages, and
every run risked drifting further, since the authoring model had no
shared vocabulary to reach for.

## Decision

Add a **design language layer** to the artifact contract, owned by the
`widget-artifact` skill as `design.md` and required by
`docs/widget-standard.md` §7:

- **A shared shell**: flex-column body, content on the tile's optical
  center when sparse (narrowed to the one-row glance tier by ADR-0032 —
  taller tiles top-align so ledgers read top-down), footer pinned; page
  generosity (outer padding,
  top-anchored flow, page-only elements) gated on
  `:root:not([data-steward-tile])`, because width alone cannot tell a
  wide tile from the full view.
- **A component set** artifacts compose from instead of inventing
  visuals per routine: section label + hairline rule, subgrid **ledger
  rows** (aligned key columns, hanging indents, optional trailing
  values), the 1×1 **stat**, **pills** mirroring the chrome's tag
  vocabulary (tone/10 fill, tone/40 border), status dots, meters,
  sparklines, the **now marker** for today-scoped timelines, and
  designed empty states.
- **A tier playbook**: each breakpoint tier is designed, not cropped —
  stat at 1×1, single-line ledgers at 1-row tiles, columns (not longer
  lines) on wide tiles, a capped top-anchored page off the board.
- **Two canonical samples** in `docs/samples/` (daily-plan: the
  plan/ledger archetype; repo-pulse: the stats/pulse archetype) that the
  skill names as the reference output.

It is a documentation-and-samples layer, not a runtime: artifacts stay
single self-contained files (no shared CSS to fetch — the sandbox has no
network), so uniformity comes from the authoring skill, the way the
token snippet already travels (ADR-0007).

## Consequences

- Widgets from different routines read as one product; the authoring
  model picks components instead of improvising layout, which also makes
  runs cheaper and outputs more predictable.
- The language and the chrome co-evolve deliberately: pill/dot styling
  mirrors `widget-card`'s vocabulary, and a change on either side is a
  design decision, not drift.
- Published artifacts only pick up the language when their routine
  reruns — the standard's usual rescale caveat.
- `design.md` grows a component only when a real routine needs it; the
  bans (no nested cards, one accent element per tier, floors) keep
  additions inside the register.
