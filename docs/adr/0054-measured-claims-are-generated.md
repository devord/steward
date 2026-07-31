# Measured claims are generated, and renders are committed

ADR-0052 made "keep in sync" a check instead of a comment — for the _geometry_.
Six hand-synced copies of the path data became one module and a CI drift check,
and the class of bug where two files disagree about the mark's shape stopped
existing.

The prose never got the same treatment, and that is where the next failure came
from. `brand/README.md` asserted the mark was _"validated down to 16px… contrast
floor 4.30:1… zero failures"_. The identity's hex table was typed out three
times — there, in `DESIGN.md § Mark`, and in ADR-0052 — plus once more in code
as the real thing. All four agreed on the day they were written. The claim about
16px was false the whole time, and nothing could tell.

Two decisions, from the same root.

## Measured claims are generated

**Every number about the mark that could be computed is emitted by
`scripts/gen-brand.ts` into a marked region**, and the documents include it
rather than restating it: hexes, contrast ratios and where each one is worst,
the device-pixel size every ratio lands at, the share of the tile the bow
covers. The prose around it stays hand-written; that is the part worth a human.

The regions are delimited in the files themselves:

```markdown
<!-- gen:mark-facts -->

…generated…

<!-- /gen:mark-facts -->
```

Plain markers rather than an MDX import, because the targets are a repo-root
`DESIGN.md`, a distributable `brand/README.md` and an MDX docs page, and only
one of those three can import anything. CI already re-runs `gen-brand.ts` and
fails on a dirty tree, so the prose now gets the check the SVGs have had.

## Renders are committed, and looked at

The gates in `mark.test.ts` and `theme.test.ts` can fail automatically, and
they are the reason this class of bug cannot recur. They still cannot tell you
whether the thing reads as a bow tie. Nothing can, except looking.

**`scripts/mark-sheet.ts` renders the mark at true device pixels and commits
the sheets to `brand/proof/`.** Two passes: everything is rendered at its real
size with `--force-device-scale-factor=1`, then that raster is magnified with
nearest-neighbour, so what you enlarge is the 16px render rather than a clean
re-render of the vector at a larger size. The second is a different question and
a flattering one.

These are **not** a CI check. Headless Chrome does not rasterise identically
across machines, which is the same reason `render-icons.sh` is local-only. They
are an instrument for a judgement, and they are committed because an agent
reading this repo needs a way to know how the mark renders rather than how it is
described. A live component preview does not do that: its source says
`<Logo />`, which is a statement of what was asked for, not of what came out.
The 1.40:1 knot was invisible to every form of documentation except a picture.

The sheets cover Steward's own surfaces and, separately, the ones the chip
actually lands on — Chrome's and GitHub's light and dark chrome. A favicon
tested only against its own app's themes has not been tested.

## The design section is public

The measured facts and the proof sheet surface at `/docs/design`, in the
existing Fumadocs site rather than a second one. The agent surfaces already
built there — `/llms.txt`, per-page `.md`, copy-for-agents — come free, and
`root.tsx` already emits `themeStylesheet()` to docs routes, so a preview can
set `data-theme` and render in any of the fourteen palettes with no plumbing.

It is public because the repo is, and because `brand/` is a distributable kit
whose usage rules want somewhere to live that is not a README in a monorepo.

## Consequences

- A measured claim typed by hand into any of the three documents is now a bug,
  and re-running `gen-brand.ts` reverts it.
- `brand/proof/*.png` is binary churn in the history whenever the mark or the
  palette moves. Accepted: the sheets are the artefact that would have caught
  the defect, and a diff nobody can read is better than a claim nobody can
  check.
- The generator has to keep working for `gen-brand.ts` to run at all, since a
  missing marker throws rather than silently skipping. That is deliberate — a
  generator that quietly does nothing is how the prose drifted in the first
  place.

The alternative considered was leaving the numbers hand-written and adding a
test that greps the documents for them. Rejected: it is the same duplication
with a third copy to maintain, and it fails the moment someone rewords the
sentence around the number.
