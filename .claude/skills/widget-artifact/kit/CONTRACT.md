# The kit's input contract

What a routine emits (ADR-0050). This shape is the same for every routine, so
it is documented once here rather than restated in each template — a template
describes *what to say*, not *how the document is structured*.

```bash
node "$STEWARD/.claude/skills/widget-artifact/kit/render.mjs" data.json index.html
```

The kit owns the rendering contract end to end: tiers, fit-to-height, tokens,
the footer, the generated-at stamp, link targeting, the context block wrapper,
the empty state. **Never hand-write HTML or CSS for a kit-rendered routine.**

## The document

| field | required | what it is |
| --- | --- | --- |
| `slug` | yes | the routine's slug; names the artifact in its footer |
| `title` | | document heading, screen-reader-only; defaults to the slug |
| `generatedAt` | yes | ISO-8601 UTC |
| `stat` | yes | the 1×1 glance — see below |
| `blocks` | | ordered content bands |
| `provenance` | | countable facts about what the run looked at |
| `empty` | | shown instead of blocks when there is nothing to list |
| `context` | | the ADR-0043 briefing, markdown |

### `stat` — the glance

```json
{ "value": 3, "label": "to file", "tone": "attn", "note": "12 held back" }
```

At 340×160 this *is* the artifact; a tier is a viewport, not a crop. From the
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
  "rows": [ /* see below */ ]
}
```

`count` is where facts that are **not rows** go. A held-back tally belongs on
the label, never in a sentence underneath.

### `rows[]`

| field | what it is |
| --- | --- |
| `id` | stable key |
| `state` | `{ label, tone }` leading chip |
| `title` | the emphasised lead the reader scans |
| `href` | makes the title a link; opened in a new tab automatically |
| `detail` | the evidence line under the title, detail tier and up |
| `values[]` | trailing columns: `{ label, value, from, tone, numeric }` |
| `action` | `{ payload, label }` — a copy button, detail tier and up |
| `keep` | survive the fit trim |

`from` decides the tier a column first appears at: `always` `compact` `detail`
`page`. Order columns by what earns space soonest.

**`keep` is for rows carrying bad news that would otherwise sink.** Trimming is
bottom-up, so a repo with zero commits or a check that never ran gets cut
first, and the tile ends up reporting only good news. But **never use it on a
queue already sorted by badness** — there the sort *is* the pinning, the calm
rows are at the bottom by construction, and pinning them makes the tile
advertise exactly the rows with no urgency.

## What the kit does for you

- **Fits the tile.** Trims to `+N more`, drops a section that cannot fit a
  tier, re-fits after interaction. You size nothing.
- **Themes.** Colour comes from tones and palette roles; the board re-points
  them per viewer theme. Inventing a colour opts out of that.
- **Degrades.** `empty` renders a designed state, never a blank or an error.
- **Escapes.** A `</script>` inside `context` cannot truncate the briefing.

## What you still owe

- An honest `stat` at the glance tier.
- A `context` block **richer than the render** — what the tile cropped, the
  caveats, the run's own limits — closing with `## Ask me about`.
- Deciding which columns matter enough to appear early.
