# The grid chrome was never applied, and the artifact still ate the pointer

Two of ADR-0041's decisions did not survive contact with the browser. Both were
invisible to the test suite, and both made resizing a widget feel broken.

## The chrome lost the cascade

`app.css` writes the board's grid chrome — the drop placeholder, the resize
grip, the lifted card's z-index — inside `@layer components`. The library's own
stylesheet was imported from the board component:

```ts
import "react-grid-layout/css/styles.css"
```

A plain import lands **unlayered**, and unlayered declarations outrank every
layer no matter how specific the layered selector is. So every rule in that
block lost, and the board wore the library's defaults instead. Read back off a
real card in Chromium:

| what app.css asks for            | what the board actually had     |
| -------------------------------- | ------------------------------- |
| grip lit in edit mode            | `opacity: 0`, lit only on hover |
| 8px chevron in `--color-ink-dim` | 5px chevron in `rgba(0,0,0,.4)` |
| dashed accent drop well          | `background: red`               |
| lifted card at `z-index: 20`     | `z-index: 3`                    |

The comment above the block said the placeholder was "a calm dashed accent well,
not the library default's opaque red block". It was the red block. A near-black
5px chevron that only appears once the pointer is already on the card is not an
affordance — there is nothing to aim at, which is most of what "resizing doesn't
work well" was.

**Decision: vendor CSS is imported into a layer.** `app.css` declares the order
`theme, base, vendor, components, utilities` before its first `@import` (layer
statements are the one rule allowed to precede `@import`, and a layer's place is
fixed where its name first appears), and pulls the library's stylesheet in with
`layer(vendor)`. Nothing else in the app puts a class on an RGL-positioned
element, so moving the library under `utilities` costs nothing.

## The artifact still ate the pointer

ADR-0041 removed the old full-cover drag overlay on the grounds that grabbing
the title bar was enough: _"the artifact iframe stays interactive."_ That holds
for dragging. It does not hold for resizing.

A cell resizes in whole rows and columns while the pointer moves continuously,
so on an inward drag the grip is always a fraction of a step behind the finger
— and what sits under the finger there is the card's own artifact. Traced in
Chromium, mid-shrink:

```
mousedown@1190,650 -> react-resizable-handle    the grip
mousemove@1143,626 -> size-full border-0        the artifact iframe
(nothing further: no moves, no mouseup)
```

A cross-origin frame takes the pointer with it. Every event after that one goes
to the frame, never to the parent document `react-draggable` listens on, so the
gesture dies where it stands — no `onResizeStop`, no commit, the card left at
whatever size it had reached. Growing is fine, because the pointer travels
_away_ from the card. That asymmetry is why the complaint was specifically about
sizing an edge **down**.

**Decision: artifacts are inert for the duration of a gesture.** While the
board holds a `.react-draggable-dragging` or `.resizing` cell, every widget
iframe takes `pointer-events: none`. This is the old overlay's job, scoped to
the only window where it is needed — at rest the artifact is as interactive as
ADR-0041 intended.

**The board**, not the grid. The first cut scoped that `:has()` to the
`.dash-grid` holding the gesture, which is wrong for the same reason it was
easy to write: a board is not one grid. Every band is its own RGL instance
(ADR-0044), so a band standing its own artifacts aside left every other band's
answering the pointer — and growing a cell downwards is exactly the gesture
that leaves its band. It failed on a boundary, too, which is why it read as
intermittent rather than broken: the cell tracks the pointer exactly, so the
pointer rides its edge for the whole gesture, and whether a hit lands on the
cell or on what lies past it comes down to a sub-pixel. Reported as _"sometimes
it freezes and I need to move the mouse to the sides"_ — sideways being the
direction that finds something still willing to answer. The selector is scoped
to the document.

## Escape abandons a gesture

Nothing did, before: once a drag or resize began, the only way out was to let
go, and wherever the cell had got to was where it stayed. Escape meanwhile was
the board's "leave edit mode" key, so during a gesture it did the wrong thing
twice — dropped the reader out of the mode they were still working in, and kept
the placement they were trying to escape.

RGL has no cancel to call. Rather than reach into its state after the fact, the
gesture is **rewound**: put the pointer back where it was pressed, release it
there, and the library settles the cell home along the same path it would have
taken if the reader had dragged it back by hand. The commit that follows
carries the placement the board already had, so it reads as the no-op it is and
never forks a draft. No library internals are touched.

The order matters and is not obvious. A `mousemove` is a _continuous_ event, so
React batches what it produces — and the grid settles against the geometry it
holds at the moment of release. Sent in one tick, the release lands on the size
from _before_ the rewind and stores exactly the placement being thrown away.
The rewind is therefore `flushSync`ed before the release is sent. Deferring the
release a frame instead only moves the race, since the reader's own mouseup can
arrive first and settle it the same wrong way.

The live gesture is module state, in `grid-gesture.ts`, because that is what it
is: a pointer belongs to the document, not to a component, and only one of a
board's grids is ever being gestured at. Hanging it off a single grid would
repeat the mistake the iframe shield just made. Escape is claimed in the
capture phase and marked handled, so the edit-mode Escape — which already
stands down for a handled event — lets it through and the two never fire at
once.

## Editing is armed at every breakpoint, and narrow grids commit only rows

ADR-0041 kept drag/resize desktop-only and listed narrow-grid row-resize as an
accepted regression. The reason given was inertia — _"as it was"_ — but the
library was never the obstacle: `react-draggable` binds `touchstart`/`touchmove`
/`touchend`, and both gestures drive RGL correctly under a real touch sequence.
What blocked a phone was ours: `gridEditing` gated on `breakpoint === "lg"`, and
the grip never opted out of scroll gestures.

The gate was load-bearing for one real reason, though. RGL generates the tablet
and phone layouts from the desktop one, so the item it hands back on a phone
says `x: 0, w: 1` for **every** widget regardless of where it sits on the board.
`commitLayout` wrote what it was handed, so lifting the gate naively would have
flattened a reader's desktop columns the first time they dragged on a phone —
rewriting an arrangement that reader was never shown.

**Decision: a grid commits only what it can honestly state.** `settledRect`
takes the whole rect on the board's own grid, and on a narrower one keeps the
stored `col`/`cols` and takes only `row`/`rows`. Rows are the part a narrow grid
states faithfully — it stacks in the board's vertical order, and a height
changed there is a real height.

Reordering on a phone therefore reorders the board, which is the point. Widgets
that shared a desktop row do not stay split by it: vertical compaction floats
each one up until it collides, so two widgets in non-overlapping columns rejoin
the same row on the next desktop render. The columns are what had to survive,
and they do.

## What the chrome looked like once it was applied

Rules that never rendered were never reviewed, so applying them was not the end
of it. Rendered on a real board and read back, three of them were wrong:

- **The well had no dashes.** `opacity: 0.12` was set on the element, so it took
  the dashed outline down with the fill and the "calm dashed accent well" was a
  muddy slab. The alpha belongs in the background colour —
  `color-mix(in srgb, var(--color-primary) 12%, transparent)` — leaving the
  outline at full strength.
- **The well painted over its neighbours.** RGL ranks the placeholder above
  every settled cell, so a resize growing past a neighbour washed that
  neighbour's artifact in accent. A well is a hole in the board; the cells
  stand on it. Cells take `z-index: 1`, the well `0`, the lifted cell `20`.
- **The edge grips floated over the artifact.** The library dresses every grip
  as the same corner caret and rotates it to point along its axis, which lands
  the glyph several pixels inside the cell. widget-card keeps exactly one rule
  about that space — _"controls live in the bar, never floating over the
  artifact"_ — and three loose carets per card read as marks on the data. The
  edge grips are now a 2px bar lying on the border they move, inside a shallow
  grab band; only the corner keeps a caret, because a corner is where a corner
  caret belongs.

The same pass turned up a defect that had nothing to do with the cascade:
**every resize dragged a text selection across the board behind it**, and left
it standing afterwards. A press-and-sweep is also how you select text.
react-draggable lays down a user-select hack for the duration of its own drag,
which is why dragging never showed this — but the resize grips come from
react-resizable, which RGL exposes no way to configure. Guarded in CSS
alongside the iframe shield, on the same `:has()` condition: while a gesture is
open, the board selects nothing.

## Two smaller amendments to ADR-0041

- **The grips are `se`, `s` and `e`,** not `se` alone. One corner moves width
  and height together, so making a widget shorter without also making it
  narrower meant dragging a 20px box along a perfectly vertical line. Each
  dimension gets its own handle; the array lives in `rgl-layout.ts` so the board
  and its test harness cannot drift.
- **The grips opt out of touch scrolling** (`touch-action: none`, the same
  opt-out the title bar already carried) and widen to 32px under
  `(pointer: coarse)`. Without the opt-out the browser claims the gesture for
  scrolling before RGL sees a `touchmove`; 20px is a mouse target, not a finger
  one.

## Why the tests said nothing

Two gaps, both now closed.

The grid tests all rendered `artifact={undefined}` — a never-published card,
which has no iframe at all. The one surface that swallows the pointer was
absent from every test of the feature that the pointer drives.

And they drove gestures with `userEvent.dragAndDrop`, which is Playwright's
two-move drag: press, jump, release. A grid gesture is dozens of positions with
the cell resnapping under each one. Under a two-move drag the pointer never
lingers where the bug lives, and the resize passes. `app/mocks/pointer-commands.ts`
adds `mouseDrag`/`touchDrag` browser commands that walk the whole path with
Playwright's mouse and CDP touch; the shrink test fails deterministically
without the shield and passes with it.

`mouseDrag` can also hold the button at the end of its path, which is the only
way to assert on chrome that exists solely while a gesture does — the drop
well, the lifted cell's rank, the selection a resize is dragging behind it. All
three are now pinned mid-gesture rather than inferred from a synthesised
element, and each was confirmed to fail with its own fix reverted.

## Consequences

- The board's chrome is applied for the first time: lit corner caret, bars on
  the two resizable edges, a dashed accent well behind the cells. This is a
  visible change — it is the design `app.css` has described since ADR-0041,
  corrected where describing it and rendering it turned out to disagree.
- A rule that cannot render is a rule nobody reviewed. Three of the four
  corrections above were only findable by looking at the board, so the layer
  fix and the design pass are one change and not two.
- Any future vendor stylesheet must be imported through `app.css` with
  `layer(vendor)`. A bare `import "…/foo.css"` in a component silently outranks
  the whole design system.
- ADR-0041's "editing stays desktop-only" is superseded, and its accepted
  regression "narrow-grid row-resize goes away" with it.
- A phone still cannot change a widget's width. That is a property of the
  medium, not a gap to close later: a one-column grid has no width to state.
  Per-breakpoint stored layouts would let it, at the cost of a schema change, a
  migration and a second arrangement to keep in your head — not worth it while
  a phone's job is reading the board and nudging its order.
- `commitLayout` now depends on the breakpoint, so `useViewportBreakpoint()`
  moves above it in the component. What a settled layout may say about a widget
  is a function of the grid it settled on, and the commit path is where that is
  decided.
