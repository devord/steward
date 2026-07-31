# The bow is one shape, and every edge has a floor

The mark shipped illegible with a full green test suite, and the two facts are
the same fact.

`theme.test.ts` asserted the mark's contrast nine ways and every one of them
measured **ink against ground** — the wing on the page, the wing on the
sidebar, the knot on the page, the knot on the tile. Not one measured **ink
against ink**. The boundary between the knot and the wings, which is the only
thing that makes the silhouette a _bow_ rather than a lozenge, was held by
nothing. It measured **2.41:1 in the light colourway and 1.40:1 in the dark**.
1.40:1 is invisible. That was the favicon.

The claim in `brand/README.md` at the time — _"validated down to 16px… contrast
floor 4.30:1… zero failures"_ — was true about the trials it named and false
about the mark.

## The knot could not be saved, and the arithmetic says so

The knot is 14 units tall crossing an 8-unit waist, so it protruded past the
cloth and touched the page. That gave it two neighbours at opposite ends of the
lightness range, and no colour satisfies both:

| dark colourway  | vs the wing | vs the page |
| --------------- | ----------- | ----------- |
| pure black knot | 5.43 ✓      | **1.02** ✗  |
| pure white knot | **2.53** ✗  | 14.74 ✓     |

Not one of the 34 gruvbox rows passes both. Neither does black or white. The
wing cannot move to make room, because the wing is the silhouette and is pinned
by its own ≥3:1 against the page.

Enclosing the knot was tried, and it works arithmetically: with one neighbour
the tone that wins is each colourway's own paper, at 5.40:1 and 5.84:1. It also
requires the waist to open from 36% of the tip height to 47–59%, and the bow
stops reading as a bow — it becomes a slab with a letterbox slot in it. Bunching
the cloth behind the knot so it could stay upright was tried next, and produced
a belt buckle. Every cut that saved the knot spent the mark to do it.

**Decision: the knot is not drawn.** The waist pinch carries the read alone.

This is not a new idea in this repo — `gen-brand.ts` already argued it for the
one-colour cut, in as many words: _"the knot is a colour relationship, not a
shape the outline depends on. At one ink it simply stops being drawn, and
nothing is lost."_ That was true at every ink, not only at one.

With one shape the problem is not solved, it is **absent**: no interior edge to
hold at 3:1, no feature to keep above a pixel, no clearance to measure. Gone
with the knot: `knotW`, `knotH`, `knotCorner`, `cinch`, and the `gather` /
`pinchGap` pair invented to enclose it.

## The two gates

**Every visible edge, not every ink on its ground.** The rule that let this
ship was "ink clears its background", which is a different set from "every
boundary a viewer can see". An interior edge is an edge. The mark now has one
boundary and it is held; the chip has two and both are.

**Every drawn feature clears one device pixel at the declared minimum**, in
`mark.test.ts`. Contrast says two regions differ, never that either is big
enough to be a region. At 16px the old cut drew a `notch` of 0.65px, a `corner`
of 0.45px and a `cinch` of 0.17px — three named ratios, two of them chosen by a
failing test, rendering nothing at all. Zero passes: a feature either survives
at the minimum or is not drawn. What is not allowed is the third state, where it
is carried in the path data and argued for in prose and invisible.

**The minimum is declared in device pixels at 1×** — chip 16, glyph 20 wide. A
floor that assumes a 2× display is not a floor: the `.ico` frames are packed at
16, and Windows at 100% and every external monitor render there.

## The bow got bigger, and the tile got the presence

At 44×22 on a 64-unit tile the bow covered 69% × 34%. A 2:1 shape in a square
can never cover more than half of it, so the icon read as small beside other
products' and no curve refinement was going to fix that. Stretching toward
square fixes the fill and costs the read — at 1.25:1 the mark is an X.

So the bow keeps its 2:1 and grows to **56×28** (88% × 44%), and the rest of
the presence comes from the tile: the chip is **drenched** in the identity, with
the bow cut out of it in paper and turned 12°, because a bow tie is worn rather
than laid flat.

**The chip is one colourway in both modes.** Drenched and mode-keyed, it
produced a polarity flip — deep tile with a pale bow in light, bright tile with
a near-black bow in dark — so figure and ground traded places on an OS setting
and it read as two logos. A drenched chip is a saturated _object_, not a
surface; it is not borrowing the page's tone, so it has no reason to follow the
page's mode. The `.ico` and the maskable icon could never media-query anyway.

Only the **bare glyph** stays keyed on mode, because it is the one framing that
sits directly on a surface it does not own.

## Consequences

- **The chip has no border.** It existed only because the old tile sat within a
  hair of the page tone, and `stroke-width: 1` on a 64-unit tile is a quarter
  of a device pixel at 16px — a feature that never rendered on the surface it
  was for. The drenched tile holds its own edge, though neither gradient stop
  does it alone: they fail on opposite grounds, so the gradient runs diagonally
  and both stops reach the perimeter. That is the load the diagonal carries,
  and `theme.test.ts` holds it as "at least one stop clears".
- **The tile is a superellipse**, not a rounded rect. A circular arc meets the
  straight edge at a curvature discontinuity; continuous curvature is what
  platform icon grids use. `CHIP_RADIUS` is gone.
- **The chip is measured against habitats that are not ours** — Chrome's and
  GitHub's light and dark chrome. A favicon that only works inside its own app
  has not been tested.
- **DESIGN.md's "the knot is the same block that ends the wordmark"** is
  retired, and with it the borrow that filled the logotype from the knot's
  colour. `LOGOTYPE_INK` is its own token; without that split the dark lockup
  would have rendered near-black on near-black the moment the knot moved.
- **`brand/`'s clear-space rule was defined in knot widths** and has no referent
  now. It is restated in tile units.
- `steward-icon-{light,dark,auto}.svg` collapse into one `steward-icon.svg`,
  and `favicon.svg` loses its `prefers-color-scheme` block.

The alternative considered was keeping the knot and raising the declared
minimum until it could be drawn. Rejected: the favicon is 16px whether or not
we declare it, and a minimum that excludes the surface the mark is most often
seen on is a way of not answering the question.

## Amendment: the declared minimum needed a ceiling

Three of the values this ADR derived were wrong, and they were wrong in the
same way: each satisfied the 16px floor and was never rendered above 64px.

- **`notch` 5 → 4.** The size gate wants ≥1 device pixel at 16px, which is 4
  units exactly; 5 was picked with room to spare and is past the ~4.6 where
  this repo already knew each wing rounds into its own lobe. At 16px the bite
  is 1.25px and invisible. At 96px it is a bone.
- **`CHIP_TILT` 12° → 4°.** Chosen by eye, flagged twice as the one number in
  the mark that could not point at a measurement, and it was the single thing
  deciding whether the chip read as a bow tie. The bow is symmetric by
  construction and the tile is square; past ~4° the rotation fights both.
- **The cut is clipped to the tile, and inset to `CHIP_INSET`.** Turned, the
  bow reached ~62.3 of 64 units and the escaping tip was paper drawn on a
  paper page — invisible, so it read as sliced off rather than as overflowing.

The law is unchanged. What was missing is its other half:

> A declared minimum without a declared **maximum** only proves the mark
> survives being small. It says nothing about whether it is still the thing.

`MARK_MINIMUM` answers "can you see it". Nothing answered "is it a bow tie",
because every proof sheet stopped at 64px — the size at which all three defects
above are invisible. `brand/proof/form-*.png` now renders 96/160/256, and
building it surfaced that the sheet harness itself broke above an 88px cell,
cropping neighbouring marks into each frame. The instrument would have lied
even if it had been pointed at the right question.

The lesson generalises past the mark: a gate that only tests the hard end of a
range will pass things that fail at the easy end, and will do it silently.
