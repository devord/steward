---
name: widget-artifact
description: >-
  The artifact authoring contract (docs/widget-standard.md): how a steward
  widget's HTML file is produced. Artifacts are compiled by the kit from a
  data.json a routine emits (ADR-0050) — never hand-written. Use whenever
  producing or reviewing a widget artifact.
---

# widget-artifact

**You do not write HTML, CSS or JavaScript.** You write a `data.json` and the
kit renders the file:

```bash
node "$STEWARD/.claude/skills/widget-artifact/kit/render.mjs" data.json index.html
```

The shape of that JSON — every field, every block kind, what each one is
_for_ — is **`kit/CONTRACT.md`**. Read it before emitting. It is the document
this skill exists to point at; nothing here restates it.

Two more, when they apply:

- **`design.md`** — the composition judgments the kit cannot make for you:
  what to make prominent, what a tier is for, when colour is a claim.
- **`docs/widget-standard.md`** (app repo) — the contract between the board
  and the artifact, if you need the reasoning behind a rule.

## Why there is no hand-authoring path

ADR-0050: the same fit-to-height algorithm existed in three drifted copies
across four live artifacts, each file hand-rolled 7–14 media queries, and 22%
of routine-template prose did nothing but restate the rendering contract.
Instructions do not hold across 900 lines of generated CSS; mechanisms do.

So the kit owns the whole rendering contract end to end — tiers, fit-to-height,
tokens, the footer, the generated-at stamp, link targeting, the context-block
wrapper, the empty state, escaping. A hand-authored file is not merely
discouraged: it carries no `steward-kit-version` stamp, so the validator
rejects it, **and** the board never injects the current stylesheet into it, so
it silently misses every design fix that ships after the day it was published.

## What the kit cannot do for you

The renderer is faithful. That is the point, and it is also the whole list of
ways an artifact can still be wrong.

### An honest glance

The 1×1 tier is one number and its label. It is the only thing most readers
ever see, so it must be the true headline — not the most flattering figure
available, and not a count of everything when the finding is that three of them
are bad.

### Person-relative content (ADR-0039)

"You" is resolved when the artifact is **rendered**, not when it is built: one
published file is shown to everyone who can see the board.

- **Person-owned** (one subject — a daily plan): name the owner in the **third
  person**, decided at build time. "Daniel has 3 deep blocks left", never
  "your". A stranger opening the board must be able to read whose it is.
- **Shared, per-viewer facets** (a review queue): publish **viewer-neutral**.
  Group by an objective axis and stamp rows with the raw relationship — who
  authored, who was asked — via `row.data`. Never a pre-computed "mine".

You write no JavaScript for this. The board resolves the viewer against
`row.data` at render time and regroups if the routine opted in with
`viewerGroups`; a raw page, or a reader with no stake, keeps the neutral render.
What stays yours is the **words**: a `title`, a row `detail`, a prose `body` or
a briefing that says "your" is baked in and cannot be un-said at render time.

### The briefing (ADR-0043)

The `context` field, and the one part of the artifact that is pure writing. A
tile is a compressed view — 15 of 61 rows, a bar standing in for 200 tickets —
so this carries the fuller story as markdown. The board offers a
Chat-with-Claude button that copies it.

**Richer than the render, never thinner.** This is the block's entire reason to
exist. A markdown transcription of the visible tile is a wasted block. Spend it
on:

- what the tile cropped — every held-back item, the full question list;
- the reasoning behind a headline number;
- what this run could **not** verify, and what that makes the numbers mean.

**Sections, not a wall.** Where things stand, then the detail, then the gaps.

**Close with `## Ask me about`** — two to four questions this widget actually
invites, in the reader's own terms. A gaps widget invites "where did these come
from and how do we stop generating them"; a progress report invites "why are we
behind and what do we cut". Name the ticket keys, repos and people involved so
Claude can act without a second round trip.

**No secrets.** It travels to a Claude conversation by the reader's own paste,
but it is published to the artifacts branch all the same — the same disclosure
rules as the visible render.

**The host writes the header.** It prepends the routine name and freshness from
what the card already shows, so don't restate them. Escaping is the kit's
problem, not yours: a literal `</script>` in your markdown cannot truncate the
block.

### Nothing external

No URL in your data may point at a resource the file will try to _load_ — an
avatar `src`, an icon, a font. Links out are fine and expected (`href` on a
row, `provenanceLink`); the kit targets them into a new tab itself. The sandbox
has no network, so anything external simply fails to paint.

## Validate before publishing

```bash
node "$STEWARD/.claude/skills/widget-artifact/scripts/validate.mjs" <artifact.html>
```

Fix every **error** and re-run until clean; never publish with errors.
**Warnings** are judgment calls: resolve or consciously accept each one. A
clean kit render reports **zero of both** — so a warning is a real signal here,
not background noise.

The validator checks only what a correct kit render can still get wrong: the
kit stamp, self-containment, class coverage against the inlined stylesheet,
trimmable units inside a fit list, off-palette inline styles, and a static
"you". Everything else the kit guarantees structurally. Composition it cannot
see at all; that half is `design.md` and you.

## Before you publish

- [ ] `render.mjs` ran clean — it validates the document shape field by field
- [ ] `validate.mjs` passes with zero errors
- [ ] The 1×1 glance is the honest headline, not the flattering one
- [ ] Tones are spent on findings, not texture; one accent per tier
- [ ] No "you"/"your" in any string you wrote (ADR-0039)
- [ ] `context` present and **richer than the render**, closing with
      `## Ask me about`
- [ ] Rendered and **looked at** — `scripts/artifact-sheet.ts` in the app repo
      renders every tier in the board's own frame. Nearly every layout defect
      this kit has shipped was found by looking, not by a test
