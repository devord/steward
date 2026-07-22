# Module relationships render as a matrix, never a graph

ADR-0027 gave artifacts a component set and one rule for growing it:
`design.md` grows a component only when a real routine needs it. The
`module-entropy` template is that routine. Its verdict — _where is this
codebase rotting_ — rests on a claim no existing component can draw:
that two modules are **coupled**. Every component in the language today
is one-dimensional. A ledger row, a magnitude bar, a meter, a sparkline
each say something about _one_ subject; none of them can say something
about a **pair**.

The obvious answer is a node-link diagram, and it is the wrong one. A
graph needs a layout, and layout is the part a headless run cannot do:
the artifact is authored blind, in one pass, with no measurement of the
box it will land in and no iteration against what it looks like. Force
layouts need a solver the sandbox can't run (no network, no library),
hand-placed nodes need the author to see the result, and either way edge
crossings — the thing that decides whether a graph is readable at all —
are decided by luck. It also degrades the wrong way: dropping a node
from a graph moves every remaining node, so the 2×2 tile and the full
view would show two pictures that don't look related.

A matrix has none of those problems. It is a grid, and the design
language is already built on grids. Position is determined by the row
and column labels rather than by a solver, so there is nothing to lay
out and nothing to iterate against. It degrades by dropping rows and
columns, which leaves every surviving cell exactly where it was. And it
scales to the density this needs: N modules cost N² cells of ~14px, not
N² edges competing for the same space.

## Decision

Add a **coupling matrix** to `design.md`'s component set: a square
`<table>` of modules against themselves, one cell per pair.

- **The cell's shade is temporal coupling** — how often the pair changes
  in the same commit — on a `color-mix` ramp over one accent token, the
  same technique the pill and time-block components already use. The
  diagonal is the module against itself and carries cohesion, drawn as a
  distinct quiet tone so it reads as the spine rather than as the
  strongest coupling on the board.
- **A declared-edge overlay marks the mismatch.** A cell whose pair
  changes together but has no import between them carries a marker. That
  cell is the finding: coupling nobody declared, invisible to the import
  graph and to every linter that guards it. The matrix therefore
  _argues_ the artifact's verdict instead of decorating it.
- **Markup is a real `<table>`** with `scope`-carrying headers, because
  this is genuinely tabular data. Screen readers get row and column
  headers for free, which no `<div>` grid can offer, and each cell
  carries its own text label so the encoding never stands on color
  alone (the meter's rule).
- **It is capped per tier, not scrolled.** Tiles render the top N
  modules by score; the full view renders all of them. Cropping a
  matrix is a contract violation the same way cropping a ledger is
  (ADR-0019), so the cap is a designed tier, and the count held back is
  stated.

The component is generic — a labelled square matrix of a pairwise
quantity — so a later routine that needs one for a different pair
relationship reaches for the same component, which is the whole point of
ADR-0027's shared set.

## Considered options

- **A matrix (chosen).** No layout to solve, degrades in place, dense at
  tile scale, and honest about what a headless author can produce.
- **A node-link graph.** The intuitive picture of a dependency
  structure, and the one every architecture tool draws. Rejected on
  layout: unsolvable blind, unreadable when edges cross, and it
  rearranges itself at every tier.
- **Mermaid, as `/improve-codebase-architecture` uses.** The source
  skill's own answer, and it solves layout properly. Impossible here:
  it loads from a CDN and the sandbox has no network (widget standard
  §1). Bundling it would break the self-contained-file rule.
- **No component; state couplings as ledger rows.** Cheapest, and the
  language already has the row. Rejected because a list of pairs is the
  data without the shape — the reason to draw a matrix at all is that a
  cluster of hot cells is visible at a glance and a list of forty pair
  names is not.

## Consequences

- `design.md` gains its first two-dimensional component. The bans hold:
  no nested cards, one accent element per tier, the 12px label floor —
  the matrix's labels sit at the floor, not below it.
- The component is drawn but not owned by `module-entropy`; a second
  routine may use it, and any change to it is a design decision across
  both, not a per-routine tweak.
- Existing artifacts are unaffected. As always, a published artifact
  picks the language up only when its routine reruns.
- The matrix asserts a relationship the reader cannot verify from the
  render alone, so the artifact's context block carries the pair
  evidence — file pairs and commit counts — for anything the matrix
  marks.
