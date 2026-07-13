# ADR-0032: Tiles top-align content; only the glance tier centers

## Status

Accepted (2026-07-13) — refines ADR-0027's shared-shell rule.

## Context

ADR-0027 gave every artifact a flex-column body with its `<main>` on the
tile's optical center when sparse (`main { margin-block: auto }`). That
rule was aimed at the half-empty tile — a lone stat adrift in the
top-left reads as broken, and centering fixes it.

But most tiles are not sparse: they carry a ledger that nearly fills the
cell. Row heights snap to the grid unit (~150px), so a list almost never
matches the iframe height exactly, and `margin-block: auto` splits the
leftover into equal top and bottom bands. On the daily-plan archetype —
where all priorities and carried-over rows fit with room to spare — the
result is a fat empty strip above the first section and below the last,
with the content floating mid-tile. Centering a _list_ doesn't read as
"centered", it reads as "misaligned": the eye expects a list to start at
the top edge, under the title bar, and run down.

The footer would normally anchor the bottom, but the board hides the
artifact `<footer>` (widget-standard §4), so on a tile `<main>` is the
only flex child and nothing counterbalances the auto-margins.

## Decision

Top-align tile content by default; center only the one-row glance tier.

- `main` drops `margin-block: auto` from the base skeleton — content
  stacks from the top edge, the way a list reads.
- Centering returns, scoped, for the glance tier only:

  ```css
  @media (max-height: 160px) {
    [data-steward-tile] main {
      margin-block: auto;
    }
  }
  ```

  A one-row tile (≤160px, the standard's 1-row height breakpoint) is
  inherently sparse — its content is the single KPI/stat — so centering
  still earns its place there and the lone number is never adrift. The
  `[data-steward-tile]` gate keeps it board-only; raw pages and the full
  view always read top-down.

- The `:root:not([data-steward-tile]) main { margin-block: 0 }` override
  in each artifact's ≥900px block is now redundant (the base no longer
  centers) and is removed.

Lands in the same three places every shell rule lives: the
`widget-artifact` skill's `design.md` and the two canonical samples
(`docs/samples/daily-plan.html`, `repo-pulse.html`).

## Consequences

- Ledger tiles fill from the top under the title bar — no mid-tile float,
  no symmetric dead bands. The glance tile keeps its centered KPI.
- Published artifacts pick this up only when their routine reruns — the
  standard's usual rescale caveat (widget-standard §6).
- ADR-0027's "content on the tile's optical center when sparse" now means
  _the glance tier_, not every under-full tile; that bullet is annotated
  to point here.
