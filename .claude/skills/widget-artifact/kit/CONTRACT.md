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
| `stat`           | one of   | the 1×1 glance as a number — see below                            |
| `verdict`        | one of   | the 1×1 glance as a judgement — see below                         |
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
height. `tone` is one of `neutral` `attn` `warn` `bad` `good` `info` —
conventionally `neutral` at zero and `attn` above it. `info` is the blue step,
outside the hot ramp entirely: it is for a state that is _notable but not
graded_, like a signal that has gone cold or a condition with no input, where
any of the other five would imply a severity the value does not carry.

### `verdict` — the glance, when it is a judgement

```json
{
  "level": "attn",
  "word": "Behind",
  "gate": "Aug 6 · 7d",
  "clauses": [
    { "lead": "ready", "value": "40%", "tail": "against 69% expected" },
    {
      "value": "2 in review",
      "refs": [{ "label": "EXAMPLE-147", "href": "…" }]
    }
  ],
  "caveat": "GitHub cross-check unavailable — Jira only"
}
```

**Exactly one of `stat` and `verdict`.** Two hero figures at the glance is two
glances, and the renderer rejects a document carrying both — or neither, since
every artifact has to say something at 340×160.

Use `verdict` when the honest headline is a **word** rather than a number: a
release that is behind, a gate that will not be met. `level` is `good` `attn`
`bad` `pending` and picks the colour and the glyph; **`word` is yours**,
because the level is the severity and the word is the vocabulary this routine
publishes. `gate` is the countdown, pushed right. `clauses` are the fired
reasons, each with its measured `value` emphasised between an optional `lead`
and `tail`; `caveat` is the completeness line, for what the run could not
check.

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

**`groups` instead of `rows`** puts labelled runs in **one** table sharing one
set of column widths:

```json
{
  "kind": "queue",
  "groups": [
    { "id": "blocked", "label": "Blocked", "count": "2", "rows": [] },
    { "id": "review", "label": "In review", "count": "3", "rows": [] }
  ]
}
```

One block, not three. Three separate queue blocks would give each its own
column widths, so the `age` column would land in a different place in every
section and the reader would re-anchor at each heading rather than reading
down one ledger. A group's `count` survives even when every row under it is
trimmed, so a short tile still reports that the group exists and how big it
is — which is why the heading is not a lie at 2×2.

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
| `face`     | `{ name, src?, href? }` — the person this row belongs to  |
| `data`     | `{ … }` inert relationship facts, for viewer resolution   |
| `action`   | `{ payload, label }` — a copy button, detail tier and up  |
| `keep`     | survive the fit trim                                      |

`from` decides the tier a column first appears at: `always` `compact` `detail`
`page`. Order columns by what earns space soonest.

**`delta`** puts movement on a value — `{ value: "3d", direction: "up" }`
beside `12d behind`, rendered as `12d behind ▲3d`. `direction` is `up` `down`
`flat`; it is the arrow's geometry, not a judgement, so a rising bad number and
a rising good one both point up and the tone says which it is.

### The viewer, and why rows carry relationships

**`face`** needs a `name` even when it has a `src`, because the avatar falls
back to an initial and a face with no name fails as a missing field rather than
a blank circle.

**`data`** is the ADR-0039 seam. One published file is read by everyone the
board is shared with, so "yours" cannot be decided when the artifact is built.
Stamp the row with the **relationship** — `{ "author": "kelly", "reviewers":
"devon sam" }` — never a resolved "mine", and opt into the regrouping by naming
the labels:

```json
{
  "kind": "queue",
  "viewerGroups": {
    "reviewer": "Needs your review",
    "author": "Yours",
    "rest": "Everything else"
  }
}
```

The board resolves the signed-in viewer against those keys at render time. A
raw page, a signed-out reader, or a viewer who appears in no row keeps the
neutral render — so the published grouping must be honest on its own, which
means an objective axis (by state, by repo) rather than a placeholder waiting
to be replaced.

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

### `blocks[]` — series

```json
{
  "kind": "series",
  "label": "Burn-up",
  "spec": {
    "from": "2026-06-25",
    "to": "2026-08-06",
    "today": "2026-07-30",
    "max": 40,
    "lines": [
      {
        "id": "landed",
        "label": "16 landed",
        "role": "hero",
        "points": [{ "x": "2026-07-01", "y": 4 }]
      }
    ]
  }
}
```

A cumulative line chart. **Page only**, like prose, and for the same reason
plus one: tiles never scroll, so a chart on a tile either steals the ledger's
rows or opens into the clipped region.

**You name what a line _is_; the kit decides how it looks.** `role` is the
whole vocabulary:

| role      | what it means                      | how it draws                           |
| --------- | ---------------------------------- | -------------------------------------- |
| `hero`    | the series that is the point       | solid, the accent hue, end marker      |
| `ceiling` | a moving limit                     | stepped, gray — holds until it changed |
| `target`  | a slope not yet realised           | dashed, ink                            |
| `ghost`   | the hero at its optimistic ceiling | dotted, the hero's hue quieted         |

There is no `role` for "another identity", on purpose. This is an **emphasis**
chart — one hue plus gray — so a second identity hue would spend an accent
budget the rest of the page owns and turn a legible chart into four things
shouting. Two measures of different scale are two charts, never two axes;
every line here is the same unit, so that holds by construction.

Identity never rests on colour: four line styles, a direct label at every
endpoint, and a legend whenever there is more than one line. End labels are
nudged apart when lines finish close together — the marker stays on the real
point.

A line needs **two points**. One is a dot claiming a trend, and the band does
not render.

**`keep` is for rows carrying bad news that would otherwise sink**, and it is
the most over-used field in this contract. Trimming is bottom-up, so a check
that never ran gets cut first and the tile ends up reporting only good news.
Two questions have to come back the right way before you reach for it, and each
one has killed a real widget:

1. **Would the sort already have saved it?** On a queue sorted worst-first the
   sort _is_ the pinning — the calm rows are at the bottom by construction, and
   pinning them makes the tile advertise exactly the rows with no urgency. Fix
   the order instead; the ordering was the actual defect every time this came up.
2. **Does the pin cost a band above it?** A pinned row makes its whole band
   un-collapsible, so the fit pass takes the height out of the band _above_
   instead. Measured: pinning the one quiet repo in a trailing "Activity" band
   collapsed the entire "Signals" band above it at the four-column tile height,
   and the widget reported one idle repo and none of its findings.

The second question is the one that surprises people, because the pin looks
locally correct — the quiet row genuinely sorts last, exactly where trimming
starts. Losing it is usually the right trade: a row survives on the tiers that
carry its band, and a tier with no room for the band is not entitled to one
orphaned row of it. A tier is a viewport, not a crop.

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

### `blocks[]` — progress and the day

```json
{ "kind": "progress", "rails": [{ "id": "gate", "label": "Aug 6 gate", "percent": 40, "tick": 68, "verdict": "12d behind", "tone": "attn", "caption": "needs 11.2/wk" }],
  "stages": [{ "id": "a", "label": "Discovery", "state": "done" }] }

{ "kind": "day", "spec": { "from": "08:00", "to": "18:00", "now": "13:20",
  "blocks": [{ "id": "b1", "start": "09:00", "end": "11:00", "type": "deep", "label": "Deep — attribution", "note": "goal: merged" }] } }
```

**A rail's `tick` is the verdict drawn.** Put it where the calendar says the
fill should have reached: past it reads ahead, short of it reads behind, so the
judgement arrives from geometry before a word does. The tick takes the `tone`;
the fill never does. `secondary: true` is a quieter second horizon.

**A stage strip answers _where_**, which no rail does — rails answer _how far_.
That is the only thing that earns it a row beside one. The kit gates it on
height itself.

**The day grid places blocks by their real times**, so an unplanned hour
renders as a gap rather than closing up. Blocks whose end is past `now` recede
rather than disappearing: a morning that is gone is still why the afternoon
looks as it does. `type` is `deep` `meeting` `shallow` `personal` `free`, and
`deep` takes the accent because those are the blocks hardest to get back.

Both are **page-only** by default.
