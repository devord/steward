# ADR-0041: react-grid-layout for dashboard drag/resize

## Status

Accepted (2026-07-15)

## Context

The dashboard grid's move/resize was a hand-rolled Pointer Events engine
(`use-grid-drag.ts` + `placement.ts`): screen-space pointer deltas snapped to
whole cells, a floating card via CSS transform, a ghost cell, and a drop that
was **rejected on collision**. Two behaviours it got wrong:

- **Scroll misalignment.** The lifted card's position was a delta from the
  pointer-down point (`clientX/Y`), with no scroll compensation. Scrolling
  mid-drag moved the in-flow card with the page while the delta stayed put, so
  cursor and card drifted apart.
- **Can't drop between widgets.** A drop overlapping any other widget was a
  no-op — placement only succeeded into empty space that fit. There was no
  reflow: dropping "between" or "onto" neighbours did nothing.

On top of that the engine was desktop-only for moves, carried a keyboard
fallback we maintained by hand, and had no real touch story. Fixing scroll and
adding push-to-reflow by hand meant reimplementing a coordinate system,
compaction, and collision cascade — the exact core of an existing, maintained
library.

## Decision

Adopt **react-grid-layout v2** (`react-grid-layout@^2`, the TypeScript rewrite;
verified to mount under React 19 + StrictMode with no warnings) as the grid's
drag/resize engine, driven as a **controlled component**.

- **`ResponsiveGridLayout`**, its `layouts` prop derived from the draft each
  render (memoised on a value signature so a background poll can't hand it a
  fresh object mid-drag). `onDragStop`/`onResizeStop` fold the settled layout
  back into the draft, guarded against a no-op so a click never forks a draft.
- **Free-form placement with push**, not vertical compaction:
  `getCompactor(null, false, false)` (`allowOverlap: false`,
  `preventCollision: false`). Dropping onto/between widgets slides the
  neighbours aside — the behaviour the old model refused — while **not**
  reflowing a board on load. Vertical compaction was rejected precisely because
  it would yank every widget upward the first time an existing board opened,
  disrupting layouts authored with intentional gaps.
- **The YAML schema is unchanged.** `data/dashboards/<slug>.yaml` stays
  1-indexed `position`/`size`; a boundary adapter (`rgl-layout.ts`) is the only
  place the stored coordinates meet RGL's flat 0-indexed `{i,x,y,w,h}`, and it
  re-clamps on the way back so the schema invariant holds.
- **The title bar is the drag handle** (`.widget-drag-handle`); resize is RGL's
  own `se` grip. The old full-cover drag overlay (needed because iframes
  swallow pointer events) is gone — you grab the bar, and the artifact iframe
  stays interactive.
- **Breakpoints stay viewport-keyed** (1100 / 700), matching the widget
  standard's cell sizes and the prior `@media` behaviour, even though RGL's
  pixel geometry comes from the measured container width. Editing (drag/resize)
  stays desktop-only, as it was.
- A Vite `define` compiles away react-draggable's `process.env.DRAGGABLE_DEBUG`
  read, which otherwise throws `process is not defined` in the client bundle on
  the first drag.

## Consequences

- The two reported bugs are fixed: no scroll drift (RGL owns drag geometry with
  auto-scroll), and drop-between/onto now pushes neighbours. Touch and pointer
  are handled by the library across devices.
- Positioning moves from CSS Grid (`grid-column`/`grid-row` custom properties)
  to RGL's transform placement. `docs/widget-standard.md` §"The grid" is updated
  to describe the RGL-driven grid; the artifact contract (breakpoints, no-scroll
  tiles ADR-0019, top-align ADR-0032) is unchanged — those live inside the
  iframe and are indifferent to how the cell is positioned.
- Accepted regressions: keyboard grid-editing (arrow/shift-arrow/delete) is
  dropped for now; the edit-mode size readout is the committed size, not a live
  preview; and narrow-grid row-resize goes away (editing is desktop-only). None
  block the core flow; keyboard editing can return as a follow-up.
- `use-grid-drag.ts` and its test are deleted; `placement.ts` stays for
  `findFreeSlot` (new-widget placement). New dependency + its base stylesheet
  (`react-grid-layout/css/styles.css`), skinned to gruvbox in `app.css`.
