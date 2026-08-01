# The mark is a real bow tie, in one ink

A rebrand moved the identity to a new burnt orange and redrew the bow as a real
bow tie — two folded wings, a square knot, two buttons. Three decisions fall out
of that, and they hold together only in a particular order.

The new brand palette is four colours: **`#c75117`** burnt orange, **`#1e1e1e`**
near-black, **`#665c54`** warm taupe, **`#fbf1c7`** cream. Three of them already
live in the gruvbox rows of the registry (`bg`, `inkDim`, and — see below —
`accentDeep`); `#1e1e1e` is the one brand neutral with no registry twin, within
three points of gruvbox-dark `bg1` but specified by the sheet, so it is named
rather than borrowed.

## The ember cannot carry a label, so it does not

`#c75117` is a superb _mark_ colour and a failing _accent_. Measured as a button
fill — the job the accent has to do — a bg1 label on it reads **3.79:1 in dark,
3.62:1 in light**, both under the 4.5:1 AA floor `theme.test.ts` holds. It sits
in the valley where neither near-black nor cream clears AA, which is exactly why
gruvbox already ships two oranges (`#fe8019` bright, `#af3a03` faded) for the
accent.

So the ember is spent where it is an object, not text:

- **the chip tile** — a saturated tile the bow is cut out of;
- **`accentDeep`** — the focus ring, the selection wash, the deep accent — which
  is what puts the rebrand's primary colour _into_ the theme. It clears the ≥3:1
  `accentDeep` floor on both twins (**3.24 dark, 4.01 light**).

The interactive **`accent` is unchanged** (`#fe8019` / `#af3a03`): buttons keep
their AA-clearing label. The brand's signature and the primary button are
different oranges on purpose, the same way GitHub's mark is ink and its accent
is blue.

**Decision: the mark is a neutral ink** — near-black on light, cream on dark —
and the ember lives on the chip and `accentDeep`, never on the bow. This is also
what the brand sheet shows: the primary logo is a near-black bow, and the orange
one is the "filled" variant.

## The knot and the buttons come back (amending ADR-0053)

[ADR-0053](0053-the-bow-is-one-shape.md) deleted the knot because it was a third
shape whose only job was to be a _different colour_ from the cloth, and at 16px
that ink-against-ink boundary measured 1.40:1 while every test passed. That
decision was about **colour**, not shape: _"the knot is a colour relationship,
not a shape the outline depends on."_

The rebrand removes the colour relationship. The mark is a **single ink** in
every framing now — the knot and the buttons carry the wings' own fill, so the
gaps around them are _ground_ showing through, not an ink-against-ink edge. The
only contrast boundary the mark has is still itself against its surface, which
is precisely the invariant ADR-0053 protected. A same-ink knot costs nothing the
coloured one could not afford.

**Decision: the mark is a real bow tie again** — folded wings (a concave `notch`
in the outer edge, a `puff` on the top and bottom), a square knot, two buttons.
The size gate (`mark.test.ts`) still holds every _region_ above a device pixel
at the declared minimum; the fold modulates an edge rather than drawing a region,
so it is not gated, as `sweep` was not. Every region — bow, knot, each button —
clears the floor at both minimums (the buttons at 1.2px at 16px), so the favicon
keeps them.

The maskable icon is a separate placement question. It is the Android adaptive
icon — the launcher masks and crops it, and it sits on a home screen beside
other apps — so it takes the conventional keyline padding, not the chip's
full-bleed fill. The bow fills ~56% of the canvas (`MASK_FILL` 0.70 of the safe
zone, the target the icon's scale `MASK_INSET` derives from), less than the chip
and well off the mask, so Steward is not tighter than its neighbours. Chasing
the _unmasked_ square looking bold — a view Android never renders — read as
cramped against every other icon on the real home screen.

## The chip is flat

The old chip ran a diagonal two-stop gradient so that at least one stop cleared
each ground. The flat `#c75117` clears the graphics floor on every ground the
chip lands on by itself — **≥3.19 across the fourteen themes, ≥3.47 on the
browser tab strips, 4.01 for the cream bow against the tile** — so the gradient
buys nothing. A flat object is one drawing at every size, and the `.ico` could
never carry a gradient faithfully anyway.

**Decision: the chip is a single flat ember tile**, no gradient and no border.

## Consequences

- `apps/web/app/lib/mark.ts` is redrawn: `MARK_RATIOS` gains the fold, the knot
  and the buttons; `chipTransform` centres the whole mark (buttons included) on
  the tile; `CHIP_INSET` rises to 0.92 so the icon fills its tile.
- `apps/web/app/lib/theme.ts`: `gruvbox` `accentDeep` → `#c75117`; the mark
  identity becomes a `BRAND` palette; `--mark-ink` replaces `--mark-wing-flat`,
  `--chip-tile` replaces the `--chip-tile-top`/`--chip-tile-deep` pair.
- Every static asset and the measured-claims regions regenerate from
  `scripts/gen-brand.ts`; `mark.test.ts` and `theme.test.ts` move to the new
  contract. The wordmark lockups drop the tile — the reference lockup is the
  bare mark, and orange stays on the app icon.
