# The artifact design language

Every widget on the board shares one visual system, so a dashboard of
artifacts written by different routines reads as one product.

**This document no longer tells you how to build anything.** It used to be
2,019 lines describing a shell, twenty components and their CSS, because every
artifact was hand-authored from prose on every run. ADR-0050 made the language
a kit: the shell, the components, the tiers, the type scale and the spacing are
code now, in `packages/artifact-kit/`, and each component documents its own
decisions in its own source at more length than this file ever managed. The
input shape is `kit/CONTRACT.md`.

What is left here is the part that is still a **judgment** — what to say, what
to make prominent, what a tier is for. The kit will render a bad composition
just as faithfully as a good one.

## The register

Terminal-calm, near-monochrome, colour only where it means something. Mono for
machine values (times, counts, slugs, repo names, ages), sans for human titles.
Hierarchy comes from weight, colour and alignment.

**Colour is a claim.** A tone says _this is the finding_, so spending one on
texture leaves nothing to say it with when something is actually wrong. At most
**one accent-coloured element per tile tier** — the ledger sorted worst-first
already puts the bad news on top, and a second orange competes with it rather
than reinforcing it. `neutral` is the honest default and the most common
correct answer.

**No motion.** An artifact is glanced at, not watched: it must look settled the
moment it paints. Bars growing, numbers counting up and labels travelling read
as flicker in a tile and overlap mid-transition. The kit emits none; the Alpine
escape hatch is where one could be introduced, so it is a rule rather than a
guarantee.

**One datum is clearly the most prominent.** At the glance tier that is the
`stat` or the `verdict` and there is nothing else. Above it, the thing that
answers the question the widget exists to answer. If a reader has to choose
which number to read first, the artifact has not decided what it is about.

**One representation per quantity.** A bar, a percent and a stepper are the
same number three times. This is the rule most often broken by accident,
because each one arrives from a different part of the routine and each looks
reasonable alone — a `meter` column beside a printed percentage beside a rail
saying the same thing. Pick the one that carries the comparison and drop the
others.

## The tier playbook

A **tier is a viewport, not a crop**. The same file serves 340×160 and a full
page, and each size is a deliberate answer rather than the previous one with
the bottom cut off.

| tier                    | what it is                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| **1×1**                 | the stat or the verdict, nothing else — one number, its label, one optional support           |
| **2×1 / 1×2**           | one ledger, single-line rows, no detail lines                                                 |
| **2×2**                 | the full ledger, detail lines, trimming from the bottom                                       |
| **Wide tile (3–4 col)** | width spent on _columns_ — a rail beside the ledger, more value columns — not on longer lines |
| **Full view / raw**     | a page: every row, the prose, the charts, the page-only bands                                 |

**Do not decide in advance what will not fit.** The fit pass measures; a
routine that withholds content because a tile "won't have room" is guessing
against a real measurement, and it guesses wrong in the direction that hurts —
a short ledger leaves the tier mostly empty while the band it declined to emit
would have fitted. Emit the content and let the pass trim. Where a band is
genuinely not part of the small tiers, say so with `pageOnly` (`CONTRACT.md`),
which is a statement about the band rather than a bet about the height.

**Leftover height is not a defect.** An artifact with little to say should look
calm, not inflated. Do not pad rows, uncap an editorially-capped list, or
promote a minor band to fill a tier.

## What is no longer yours to decide

Listed because the habit outlived the mechanism, and a routine template that
still reasons about these is describing a document the kit does not produce:

- **The shell** — top-alignment, the glance tier's centred KPI, the footer,
  page padding, the scroll spacer.
- **Width at the full view** — content shrinks to fit and surplus lands as one
  trailing right gutter. There is no cap and no centring (`Shell.tsx`).
- **Type and spacing** — the 14px body, the 12px label floor, the section
  rhythm. `ink-faint` is a glyph role, never text.
- **The fit pass, the theme, the mono face, link targeting** — all injected by
  the board at render time, so they reach artifacts published months ago.
- **Every component** — the queue table, the stat, the verdict band, meters,
  sparklines, the coupling matrix, the day grid, rails, the stage strip, the
  provenance line, the empty state. Ask for a component; do not compose one out
  of utilities.

The one bound that still costs something to cross: **a new visual shape is an
app-repo PR.** That is the trade ADR-0050 made — slower to invent, impossible
to drift.
