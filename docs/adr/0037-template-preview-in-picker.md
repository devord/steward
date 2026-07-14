# Template preview in the add-routine picker

The picker lists a template by its `widget:` frontmatter — name, source
badge, and the one-line `artifact` description (ADR-0015/0021) — but nothing
shows what the template actually _makes_. You pick a routine, configure it,
sync, wait for a run, and only then see the widget. If it's not what you
imagined, the regret is expensive: the whole loop has to unwind. A one-line
description ("Open PRs awaiting review, new issues, and CI status per repo")
can't carry a layout, a density, a tone.

## Decision

A template may ship a **sample render** — a canned artifact HTML file — and
the picker previews it in place. Picking a template card in the add-routine
dialog reveals its sample, framed through the very same `frameArtifactHtml`
tile view and sandboxed `srcdoc` iframe the board uses for a live widget
(ADR-0002/0028/0031). The preview is faithful to what the widget will look
like; only the data is an example, so the card captions it as one.

**Placement — the sample lives with the template, keyed by id:**

- **Built-in** — `docs/samples/<id>.html`. These already exist as the
  canonical design archetypes the `widget-artifact` skill points at
  (ADR-0027); they _are_ the sample renders, so the picker reuses them
  rather than keeping a second copy that could drift. Inlined into the app
  bundle at build time (`import.meta.glob`), same as the built-in templates.
- **Repo/team** — `templates/routines/<id>.sample.html`, a sibling of the
  template markdown. Discovery already lists the repo tree to find
  `templates/routines/<id>.md`; a sample sibling in that same listing costs
  one extra contents fetch **only** for a template that ships one, so a
  previewless template adds no cost.

`DiscoveredTemplate` gains an optional `sample: string` (raw artifact HTML),
attached by discovery and streamed to the client with the rest of the picker
data (ADR-0030) — the board already ships full artifact HTML per widget the
same way, so this is the established shape, not a new one.

**Preview on selection, one at a time.** The sample renders nested inside the
selected card, under a hairline — the same slot and idiom the custom card
uses for its prompt textarea. Selection is the reveal, so at most one iframe
mounts; a template with no sample simply has no panel. No separate preview
button: the template card is a single button (its whole row is the pick
target), and a nested control would be an interactive-inside-interactive
a11y fault.

## Considered options

- **Sample file per template, previewed on selection (chosen).** Faithful
  (real framing, real artifact), cheap (built-ins bundled, repo samples
  fetched only when present), and honest (captioned as an example).
- **Render the template live on demand.** The only fully accurate preview,
  but it means running a Claude routine from inside a modal — seconds of
  latency and real cost for a glance. The picker is a browse surface.
- **A static screenshot per template.** Lighter than HTML, but a raster
  can't theme with the viewer (ADR-0009), goes stale against the design
  language silently, and isn't the thing the board renders.
- **Describe harder.** More frontmatter prose. Never conveys layout; the
  regret this targets is visual.

## Consequences

- A built-in without a `docs/samples/<id>.html` (today: `custom`, which has
  no fixed output) simply shows no preview — correct, not a gap. `custom`'s
  brief is the user's own prompt; there's nothing canned to show.
- Repo templates gain a documented convention for shipping a preview
  (widget standard, data-repo README). It's optional; the picker degrades to
  the description-only card it shows today.
- Sample HTML rides the streamed picker payload. For the two built-ins
  that's ~80 kB raw (well-compressed), consistent with the board already
  streaming every widget's artifact. If the sample set grows large enough to
  matter, moving the fetch behind an on-open resource route is a contained
  follow-up — the `sample` field is the only coupling.
- The samples now have two readers — the `artifact-sheet` design harness and
  the picker — so a change to one is seen by the other. That's the point:
  the picture the picker shows is the archetype the design language defines.
- The templates ledger (ADR-0029) receives `sample` on `DiscoveredTemplate`
  but doesn't render it yet; a ledger-row preview is a natural follow-up.
