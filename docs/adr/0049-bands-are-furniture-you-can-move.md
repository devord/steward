# Bands are furniture you can move

ADR-0044 gave the board category bands and stopped at rendering them. Two
things followed from that, and the second one hid the first.

The band heading resolved to the one caption tier ADR-0048 had just
consolidated: 11px, tracked, caps, `ink-dim`. In the rail that tier heads 14px
nav rows inside a 200px column, and small reads as a deliberate caption. On
the board it heads widget cards whose own titles are 16px semibold across the
full canvas, so the heading ranked **below its own children** — the inversion
the caption idiom exists to avoid. ADR-0048 anticipated the objection and
answered it ("a band heading earns its prominence from its chevron, its count,
and the air above it, not from two extra pixels"), which was the right answer
to the wrong question: the rejected change was the _same tier_ at 13px, drift
rather than hierarchy. The heading did not need two more pixels; it needed to
stop being a caption.

And `categories:` had no UI at all. Order could only be authored by hand-
editing `data/repo.yaml` on GitHub, and a category could only be created by
finding the free-text field inside the add/edit-routine dialog. A band was
something the board did _to_ you.

**Decision: the band heading is a heading, and it is the handle the band is
moved and made by.**

## The heading leaves the caption tier

`bandHeadingCls` (`lib/utils.ts`): mono, `text-sm` (14px), semibold, tracked,
caps, full `foreground`. The count beside it steps to `text-xs` — it is data at
the metadata tier, and the name is the landmark. `railCaptionCls` is unchanged
and still one token; the rail keeps it.

14px is not a bigger caption, it is the body/control tier, and DESIGN.md
already put the heading there: the row is the control that folds a whole band,
and "nav and other primary controls take body size, never the metadata floor."
Caps and tracking plus the full-bleed rule keep it a landmark rather than a
competitor to the 16px widget titles — at 14px its cap height sits _under_
theirs, so the band reads as the frame and the widgets stay the bright content.

**A collapsed band closes ranks** (`mb-2`, not `mb-8`). ADR-0048's rhythm law
spends 32px between bands so the band is the unit you scan; a folded band has
no content for that air to separate, and three of them 32px apart read as
debris scattered down the page rather than as a row of shut drawers.

## Order is a nudge, and it moves past what you can see

The heading carries the rail's hover-revealed `⋯` (repo-group-header,
`SectionLabel`) with **Move up** / **Move down**, gated on push permission and
absent — not disabled — at the ends, where the position already says why.

The move names a **neighbour**, not an index. `categories:` is repo-wide while
a board shows a subset, so swapping adjacent entries of the authored list would
routinely move nothing the reader can see. `moveCategory` lifts the band out
and drops it on the far side of the band displayed next to it; names this board
never shows keep their relative places.

It writes the **whole present order**, not a delta. The list carries only the
names it states and everything else sorts alphabetically after it, so a first
nudge has to write the rest down or the unlisted bands would jump the moment
one band moved. ADR-0039's parse-boundary move, one tier down.

It **commits directly** to `data/repo.yaml`, like the section order beside it
and unlike the widgets. Band order is repo config, not board layout, so it does
not belong in the draft that Sync ships. One commit per nudge, named for what
it did — git is visible (principle 3), not hidden behind a batch. The board
holds the order it just sent until the loader agrees, because GitHub's contents
API can serve the pre-commit blob for a beat and a band that doesn't move gets
nudged twice.

A refused move **snaps back** and says why, on the heading it belongs to — the
`role="status"` line the widget bar's Update control already uses, since a menu
item has no dialog to fail into.

## Creating a band is naming it and filling it

Same menu, **New band…**: a name plus a checklist of this board's widgets.

The two halves are one act because a band with no routines does not exist —
`categories:` carries sequence only, and a listed name no routine uses renders
nothing (ADR-0044's never-an-empty-heading rule). A create that wrote only a
name would appear to do nothing at all.

So it writes `category` on the picked routines, into the **draft** — the
opposite tier from the order above it, and correctly so: membership is a
routine field, and every routine edit ships through Sync (ADR-0003). That split
is also why the picker counts boards per row. The category rides on the routine
rather than the placement (ADR-0044), so filing a widget moves it on every
board that shows it; ADR-0042 wants that reach stated, which is exactly what
ADR-0044 refused to let a drag do silently.

## Considered options

- **Tabs instead of bands** — the ask that prompted this, and rejected on
  ADR-0044's own argument. Tabs are exclusive, and exclusivity is what that ADR
  refused when it declined to split `corza` into `corza-pm` + `corza-eng`: "the
  all-of-corza-at-once board — the one actually in use" disappears, and you
  never see Delivery Health beside Under Review again. Three more: the
  unlabeled lead band has no name, so it would have to invent one
  ("Uncategorized") or sit above the strip and demote it; a board below the
  two-category floor has no strip at all, so the chrome would appear and vanish
  as you move down the rail; and collapse is currently a cross-board viewing
  mode (fold Engineering once, it's folded everywhere), which a per-board tab
  selection cannot express.
- **A band index strip above the board** — tab-like affordances (drag to
  reorder, `+` to add) without the exclusivity. Rejected as chrome that
  duplicates the headings 40px below it, against principle 1.
- **Drag the heading to reorder** — one gesture, one commit, and the board
  already has a drag mode. Rejected for now: reordering sections that each
  contain an RGL instance is real machinery, it needs a keyboard path anyway,
  and the menu is that path. Revisit if nudging four bands starts to grate.
- **Batch the order into the draft** — one commit instead of one per nudge, and
  it would put order and membership in the same place. Rejected because
  `repo.yaml` is not in the draft's file set and adding it there widens the
  sync surface (a third file, a third conflict path) to save a commit nobody
  is paying for.
- **Rename / dissolve a band in the same menu** — the obvious neighbours, left
  out deliberately. Both are batch rewrites across every routine under the
  name, which is ADR-0039's section-rename shape rather than this one, and
  mixing a direct commit (order) with a draft edit (membership) under one menu
  makes it unreadable which actions Sync is holding. A category still
  disappears on its own when no routine uses it.
- **Overwrite a malformed `data/repo.yaml`** — what the section path effectively
  does, because a null parse can never change its order and so never writes.
  The reorder always writes, so it refuses instead: rewriting the file would
  silently drop whatever else the author had in there to fix a band order.

## Consequences

- Amends ADR-0048's "one caption tier" — the board's band heading leaves it.
  The tier itself is intact and still one token; DESIGN.md § Typography names
  both now.
- `data/repo.yaml` gains a second in-app writer (`categories:`, beside
  `sections:`). Both are the same shape: order only, committed directly,
  best-effort on read.
- The zero-band board keeps no on-ramp of its own. Below the floor there is no
  heading to hang the menu on, so the first band is still made in the
  add/edit-routine dialog's Category field. Acceptable while the built-ins ship
  two categories, so most boards band on their own; if that stops being true
  the entry belongs in edit mode's header.
- The `⋯` sits on top of the heading row rather than beside it, so the whole
  row stays the collapse target it was.
