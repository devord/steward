# The widget title is the door to the full artifact

ADR-0019 made a tile a crop: it fits its height rather than scrolls, the
guard fades the bottom edge whenever content still overflows, and the
lightbox is where the held-back rows actually live. That makes expanding a
tile the board's most consequential action — the only way to see what the
crop is hiding.

It was also its least visible one. The control was a 20px `Maximize2` at
`opacity-0` until the card was hovered, and on coarse pointers not in the
title bar at all, folded into the `⋯` menu two taps deep. Readers who used
Steward daily did not know tiles expanded. The guard's fade has been
promising "there's more — expand" since ADR-0019; the door it pointed at
was invisible.

Decision, in two parts:

- **The title is the expand control.** `routine.name` renders as a button
  inside an `h2`, carrying a trailing `Maximize2` glyph. The standalone
  icon is retired from the action cluster _and_ from the `⋯` menu, so
  there is one expand affordance per card on every pointer type — the rule
  the run controls already follow (ADR-0016: never a disabled refresh arrow
  beside a running one). The title is the widest, steadiest thing in the
  bar, it is the name of the thing being opened, and it needs no hover to
  be seen. Wrapping it in `h2` also gives each `article` the accessible
  name it never had, so a board is navigable by heading and not only by eye.

- **A clipped tile says so.** The tile guard already computed the overflow
  that drives its fade; it now posts that boolean up as
  `steward:tile-clipped`, beside the existing `steward:tile-painted` and
  matched the same way (by `e.source` — the sandbox has an opaque origin,
  so there is no origin to check). The cue rests in `ink-faint` on a tile
  whose artifact fits and one step up in `ink-dim` on one that is holding
  rows back. It is the fade's own sentence, said where the door is.

The glyph is three states and no more: `ink-faint` at rest (DESIGN.md's
glyph role, ≥3:1 — the faint-at-rest idiom the band heading's chevron and
`⋯` already use), `ink-dim` when clipped, `foreground` under pointer or
keyboard focus, where the name also underlines in `ink-dim`.

Below `16rem` of title bar the glyph is dropped by a container query. It
costs 20px, and the freshness cluster beside it never gives ground, so on a
1-column cell of a 6-column board that 20px is the difference between
"Turt…" and "T…". A hint on a tile too narrow to show what it hints at is
the wrong trade; the heading stays clickable at every width.

## Considered options

- **Keep the icon, just stop hiding it** — resting it in `ink-faint`
  instead of `opacity-0` fixes visibility with a one-line change. Rejected
  as the whole answer: it leaves two controls for one action once the title
  is also clickable, and a lit 20px icon beside a 16px heading spends chrome
  on a target the heading already provides for free.
- **Click anywhere on the artifact** — the largest target on the card, and
  the one readers reach for. Impossible: the artifact is a sandboxed
  cross-origin iframe, so clicks never reach the host, and an overlay to
  catch them would break the links ADR-0028 exists to let escape.
- **A first-run coach mark** — teaches the gesture once and is then debt.
  Notion-style hand-holding is a named anti-reference in PRODUCT.md.
- **A keyboard accelerator** (`keymap.ts`) — costs nothing and helps nobody
  who does not already know the feature exists. Discoverability was the
  problem; an accelerator is for people past it.
- **One uniform cue, no clipped state** — simpler, no new message on the
  guard contract. Rejected because it makes the tile with hidden rows look
  identical to the one showing everything, which is the honesty ADR-0019
  spent a whole layer buying.

## Consequences

- `steward:tile-clipped` joins `data-steward-tile` and
  `steward:tile-painted` as tile-guard contract surface: renaming it is a
  breaking change to the standard. Unlike `tile-painted` it fires
  repeatedly over a tile's life — a sort, a filter, a resize all re-run the
  guard's check — so the card's listener stays mounted after `painted`
  latches.
- Artifacts published before this ADR gain the cue for free: the guard is
  injected at frame time, not baked into the file (ADR-0009's seam).
- `widget.expandShort` survives as the title's tooltip; only the menu item
  it used to label is gone.
