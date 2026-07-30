# Artifacts are compiled from a kit, not transcribed from prose

ADR-0027 gave artifacts a design language and chose, deliberately, to make it
"a documentation-and-samples layer, **not a runtime**", on the grounds that
"artifacts stay single self-contained files (no shared CSS to fetch — the
sandbox has no network), so uniformity comes from the authoring skill."

The premise is true and the conclusion does not follow. Nothing has to be
_fetched_. `frameArtifactHtml` already appends the theme tokens, the chrome
mono face, `EMBED_FRAME_STYLE`, `LINK_GUARD_SCRIPT`, `TILE_GUARD_STYLE`,
`TILE_GUARD_SCRIPT` and the viewer object into every iframe by string
concatenation at render time. The board has been a runtime host since
ADR-0009 and ADR-0031. The design language is the one thing that never used
the seam.

Everything since has followed from that. With no runtime, every artifact is
hand-authored CSS, HTML and JS from scratch on every run; because it is
re-derived every run, every invariant has to be a _prompt instruction_ rather
than a _mechanism_; instructions do not hold across ~900 lines of generated
CSS; and when one fails in production the fix has nowhere to live except more
prose in the routine template.

The damage is measurable:

- **The same algorithm exists in three versions in production.** The
  130-line fit-to-height script is specified once in `widget-artifact/SKILL.md`
  and transcribed by the model into every file. `corza-gated` and
  `shopify-intel` carry one variant; `corza-progress` and `corza-gaps` have
  each drifted into their own. Each artifact also hand-rolls 7–14 media
  queries.
- **992 of 4,520 lines of routine template (22%) restate the contract** —
  `Size behavior`, `Degrade honestly`, `Provenance`, `The context block` —
  before a single line describes what the routine is _about_.
- **The contract contradicts itself.** `docs/widget-standard.md` §2 says the
  artifact "fills the full width it is given… the content is never capped"
  (landed 2026-07-14); `widget-artifact/SKILL.md` says to "cap the content
  column (~72ch/900px, centered)". Both are live at HEAD, and `corza-gated`
  hard-codes the capped reading.
- **Failures calcify as prose.** `corza-gated` carries a 200-word passage
  explaining that the shared `data-fit-keep` advice _inverts_ for that
  routine, because a live run followed it and "the tile ended up advertising
  the only two rows on it that carry no urgency at all". A layout bug became
  a permanent paragraph in a content template.
- **`design.md` is 2,019 lines of prose** describing components, and the three
  canonical samples are 42–70 KB files maintained by hand — while
  `run-routine` §4 simultaneously forbids authoring from a previous run's
  markup.

We have already proved the alternative internally. `repo-stats` is the
shortest template in the fleet (66 lines, **0%** contract restatement) and
carries the most interactive widget on the board (scrubbable history, three
toggles). Its skill says why: _"Freezing them makes every instance identical
and regression-proof."_ Its renderer, `build.mjs`, is 612 lines of **Node
built-ins only** — no npm install — and it runs in the cloud routine
environment today.

**Decision: the design language becomes a kit that compiles artifacts.
Routines emit content; a committed renderer emits the file.**

## Three layers, split by who owns them and how often they change

**The kit (app repo, built in CI).** Authored in React + Tailwind, with
shadcn's presentational components (Table, Badge, Card, Separator, Avatar,
Progress, Skeleton) as the base and Steward's domain vocabulary on top:
`LedgerRow`, `StatTier`, `QueueTable`, `CouplingMatrix`, `NowMarker`,
`ProvenanceLine`, `EmptyState`. Tailwind owns layout, spacing and the tier
system; the named components own the vocabulary that makes a board of
unrelated routines read as one product. CI emits two products: `kit.css`, a
fixed stylesheet covering the kit's whole class surface, and `render.mjs`, a
bundled renderer with no runtime dependencies.

Tailwind is chosen for a reason that is about reliability, not taste: the
model is saturated with it. An LLM emitting `md:grid-cols-2` is working in
its highest-competence register; an LLM emitting a hand-rolled
`@media (min-width: 700px)` block against 2,019 lines of prose is working
from in-context instruction alone. That difference is the drift above.

**The renderer (run time).** `node render.mjs data.json` → `index.html`:
static markup plus inlined `kit.css`. No framework is shipped. This is
exactly what `repo-stats` does today, so it is already known to work on both
hosts (ADR-0012), including the cloud environment that has no `gh` and no
GitHub API egress.

**The routine template.** The content spec and nothing else: what to gather,
what the numbers mean, which components carry them, what to say at each tier.
Target 40–120 lines. No CSS, no breakpoints, no fit rules, no context-block
scaffolding.

## Interactivity: enhanced documents, never client-rendered apps

Artifacts stay **progressive-enhancement documents**. This is not a new
constraint, it is ADR-0039 restated: "the static render is neutral and
honest… enhance progressively, degrade to neutral." That is Alpine's
execution model and it is precisely not React's, which wants to own the
render or hydrate against a matched tree. It also protects `TILE_GUARD_SCRIPT`,
which mutates the DOM to hide overflowing rows and which any re-rendering
component tree would fight.

- **Alpine is injected by the board**, alongside the theme and the font
  (ADR-0009/0031). Injection rather than inlining gives the degradation for
  free: the raw file has no Alpine and therefore shows the honest static
  render — the exact fallback ADR-0039 already specifies — and a runtime
  upgrade reaches every widget without rerunning a single routine.
- **The kit provides the interaction floor** as committed, reviewed
  components (toggle groups, scrubbers, filter bars, sort headers,
  expand/collapse), so the common cases are written once rather than per run.
- **Routines may add their own `x-data` on top** when the kit has no
  component for the job, so a routine is never blocked waiting on an app-repo
  PR.
- **No app mode.** Canvas widgets, live simulations and client-rendered
  multi-view state are out of scope. Everything shipped today — toggles,
  filters, scrubbing, sorting, drill-down, tooltips — is reachable as an
  enhanced document.

Re-running the fit pass once a runtime settles is an established pattern here,
not a new risk: the artifact already re-fits on `document.fonts.ready` because
the injected mono changes row metrics after `DOMContentLoaded`. Alpine gets
the same treatment via `Alpine.nextTick`.

Two guards on the parts of this that are known to bite:

- **Alpine expressions live in `<script>`, not in attributes.** Alpine parses
  `x-data` as a single expression, so multi-line bodies get HTML-escaped or
  mis-parsed and fail _silently_ as "Alpine Expression Error". Components
  register through `Alpine.data()` inside `alpine:init`. The kit's skill
  states this as a rule and the validator checks it.
- **Two owners of behaviour is the accepted cost of the escape hatch.**
  Kit-rendered markup is machine-generated and routine-authored Alpine is not,
  so the two are distinguishable by construction: the renderer stamps what it
  emits, and the validator reports routine-authored behaviour as a _warning_,
  not an error — visible in review as a deliberate extension rather than
  silently indistinguishable from drift.

## Consequences

- **A design fix reaches the whole board without rerunning any routine.**
  Today the standard's own caveat is that "published artifacts only pick up
  the language when their routine reruns" — which costs a full agent run per
  widget. With `kit.css` injected the way the theme already is, a fix lands on
  the next page load. This is the direct answer to artifacts that do not look
  right.
- **`design.md` shrinks from 2,019 lines to roughly 300** — the domain
  vocabulary only. Layout, spacing, type scale and tiers move into the kit,
  where they are code.
- **The `.sample.html` files stop being maintained by hand.** Picker previews
  (ADR-0037) become renderer output over fixture JSON, generated in CI, and
  therefore always current with the kit.
- **The fit pass, the viewer read and the context block leave every artifact**
  and become one implementation in the kit. Three divergent copies collapse
  to one.
- **The width contradiction gets resolved once, in code**, rather than in two
  prose documents that disagree. Which reading wins is a design decision this
  ADR does not prejudge; the point is that it stops being expressible twice.
- **A new visual shape now costs an app-repo PR** where it used to cost
  template prose. That is the trade: slower to invent, impossible to drift.
  The Alpine escape hatch keeps a routine from being blocked in the meantime.
- **Artifacts stay single self-contained files.** Nothing here weakens
  ADR-0002 or the no-network contract; the kit is inlined at publish and
  re-injected at render, which is how the theme tokens have always worked.

## Rejected

- **`web-artifacts-builder` as shipped.** Its lesson — author in source,
  compile to one self-contained file — is adopted wholesale. Its mechanics are
  not: `init-artifact.sh` installs ~40 packages (26 Radix among them) and
  `bundle-artifact.sh` ships React to the client. For static data tiles that
  is a hydration runtime nobody needs, it collides with `TILE_GUARD_SCRIPT`
  over DOM ownership, and it puts an npm install and a Parcel build inside
  every scheduled run.
- **Tailwind for everything, dropping the named components.** Maximum model
  familiarity, but "ledger row" stops existing as a thing, and each routine
  re-composes alignment and density from utilities — the same drift by a new
  notation.
- **Routines never writing behaviour (kit-only).** Strongest consistency, but
  a routine with a novel interaction is blocked on an app-repo PR, which is
  too rigid for a content repo that is meant to move faster than the app.
- **Keeping the samples as the reference output.** They are the crutch that
  `run-routine` §4 already contradicts, and at 42–70 KB each they cannot be
  kept honest by hand.
