# The kit's input contract

What a routine emits (ADR-0050). This shape is the same for every routine, so
it is documented once here rather than restated in each template — a template
describes _what to say_, not _how the document is structured_.

```bash
node "$STEWARD/.claude/skills/widget-artifact/kit/render.mjs" data.json index.html
```

The kit owns the rendering contract end to end: tiers, fit-to-height, tokens,
the footer, the generated-at stamp, link targeting, the context block wrapper,
the empty state. **Never hand-write HTML or CSS for a kit-rendered routine.**

## The document

| field            | required | what it is                                                        |
| ---------------- | -------- | ----------------------------------------------------------------- |
| `slug`           | yes      | the routine's slug; names the artifact in its footer              |
| `title`          |          | document heading, screen-reader-only; defaults to the slug        |
| `generatedAt`    | yes      | ISO-8601 UTC                                                      |
| `stat`           | yes      | the 1×1 glance — see below                                        |
| `blocks`         |          | ordered content bands                                             |
| `provenance`     |          | countable facts about what the run looked at                      |
| `provenanceLink` |          | `{ href, label }` — where the underlying record lives             |
| `state`          |          | `[{ id, data }]` inert JSON the artifact carries for its next run |
| `empty`          |          | shown instead of blocks when there is nothing to list             |
| `context`        |          | the ADR-0043 briefing, markdown                                   |

### `stat` — the glance

```json
{ "value": 3, "label": "to file", "tone": "attn", "note": "12 held back" }
```

At 340×160 this _is_ the artifact; a tier is a viewport, not a crop. From the
detail tier up the kit steps it down to a header KPI so the ledger gets the
height. `tone` is one of `neutral` `attn` `warn` `bad` `good` — conventionally
`neutral` at zero and `attn` above it.

### `blocks[]` — a queue

```json
{
  "kind": "queue",
  "label": "Recommended",
  "count": "12 held back",
  "showHeader": true,
  "rows": [
    /* see below */
  ]
}
```

`count` is where facts that are **not rows** go. A held-back tally belongs on
the label, never in a sentence underneath.

**`note`** is one quiet line under the band, for a fact that qualifies it
without belonging to it — `plus 15 in own backlog · 42h` under a ledger that
deliberately excludes it. It takes no tone and stays subordinate; giving it the
ledger's weight invites the reader to add it to the number above, which is the
error the exclusion exists to prevent. It is the first thing the fit pass drops.

**`rail: true`** puts the band in the page tier's right-hand column instead of
the main one. Say it about **rank**, not layout: _this qualifies the story, it
is not the story_. Below the page tier every band stacks in reading order
regardless, and the kit decides what the split looks like. Without it a wide
frame runs every band down one narrow ribbon — a shipped run spent 35% of a
2560px frame that way.

Any band may take the rail, prose included — a short aside beside the ledger is
a fair use of it. Two columns need two columns' worth of content, though: if
every main band comes back empty, the rail **is** the content and renders as one
stack rather than beside an empty track.

**`pageOnly: true`** keeps a band off tiles entirely — raw page and full view
only, gated on the tile stamp rather than a width, so a four-column tile at
1200px still does not get it. For an auditor's band rather than a glancer's: a
rule trace in evaluation order restates, more slowly, what the verdict and the
drivers already said, and rendering it on a wide tile put the same figure on
screen four times. Prose is page-only whether or not you set it.

**`trimFirst: true`** makes this block give way before every other list,
whatever the reading order. It exists for a bookkeeping band that sits _above_
the content it serves: trimming is bottom-up, so without it the queue the
widget exists for collapses entirely before one housekeeping row goes.

### `rows[]`

| field      | what it is                                                |
| ---------- | --------------------------------------------------------- |
| `id`       | stable key                                                |
| `state`    | `{ label, tone }` leading chip                            |
| `title`    | the emphasised lead the reader scans                      |
| `href`     | makes the title a link; opened in a new tab automatically |
| `detail`   | the evidence line under the title, detail tier and up     |
| `values[]` | trailing columns: `{ label, value, from, tone, numeric }` |
| `action`   | `{ payload, label }` — a copy button, detail tier and up  |
| `keep`     | survive the fit trim                                      |

`from` decides the tier a column first appears at: `always` `compact` `detail`
`page`. Order columns by what earns space soonest.

**`meter`** turns a column into a magnitude bar of that many units, with
`value` as its printed count. Every bar in the column shares one scale — the
column's own largest — so lengths compare across rows and the ledger sorts
itself on sight. Give it a `tone` only when the magnitude **is** the finding: a
drift count earns orange because nothing else on the row competes, while commit
volume beside a confidence chip stays neutral and reads as texture.

### `blocks[]` — prose

```json
{
  "kind": "prose",
  "label": "Dives",
  "items": [{ "id": "d1", "title": "…", "href": "…", "body": "…", "meta": "…" }]
}
```

The long-form band: a ledger headline opening into the reasoning behind it.
Blank lines in `body` become paragraphs, capped at the same measure as the
ledger's flexible column.

**Page only** — the whole band, heading included, appears on the raw page and
the full view and never on a tile, however wide. A four-column tile is 1200px
and still not a reading surface, and a paragraph is not a trimmable unit: a
dive cut to `+1 more` is a truncated argument rather than a shorter list.

**`keep` is for rows carrying bad news that would otherwise sink.** Trimming is
bottom-up, so a repo with zero commits or a check that never ran gets cut
first, and the tile ends up reporting only good news. But **never use it on a
queue already sorted by badness** — there the sort _is_ the pinning, the calm
rows are at the bottom by construction, and pinning them makes the tile
advertise exactly the rows with no urgency.

## What the kit does for you

- **Fits the tile.** Trims to `+N more`, drops a section that cannot fit a
  tier, re-fits after interaction. You size nothing.
- **Themes.** Colour comes from tones and palette roles; the board re-points
  them per viewer theme. Inventing a colour opts out of that.
- **Degrades.** `empty` renders a designed state, never a blank or an error.
- **Escapes.** A `</script>` inside `context` — or inside a `state` payload —
  cannot truncate the block.
- **Rejects unstyled classes.** `validate.mjs` errors on any class with no rule
  in the inlined stylesheet, so an off-surface utility fails at publish rather
  than rendering invisibly wrong.

## What you still owe

- An honest `stat` at the glance tier.
- A `context` block **richer than the render** — what the tile cropped, the
  caveats, the run's own limits — closing with `## Ask me about`.
- Deciding which columns matter enough to appear early.
