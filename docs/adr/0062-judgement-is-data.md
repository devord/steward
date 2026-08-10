# Judgement is data: prose is authored by a run, never by a view

ADR-0060 makes a view a pure composition over data, rendered by the board with
no agent involved. That is straightforwardly true for a table and a stat tier.
It is not obviously true for the widgets that carry the product's actual
value.

`corza-brief` publishes a sentence: _"The Aug 6 gate holds exactly where this
morning's rescope left it — 32 of 55 open — but the review debt behind it is
clearing unevenly: every nav-restyle PR now carries a human approval and none
has merged, while the migration pipeline crosses 83 hours with no human review
at all."_ No rule produces that. It also carries memory across runs —
_"growing from 76h+ last run and 59h+ before that."_

So prose is a third thing. It is not an observation, because nothing was
observed; it is not presentation, because the board cannot produce it. If the
model has no name for it, the only two answers are both bad: views run Claude
on every page load, or narrated widgets keep the old welded pipeline forever.

**Decision: a dataset field is one of three kinds — observed, derived, or
judged. Judgement is authored by a run and stored like any other data. A view
never runs Claude.**

## The three kinds

- **Observed** — gathered from a source. Cheap to refresh; a view over it
  updates the moment new data lands.
- **Derived** — a deterministic function of observations. Recomputable, never
  stale, no agent. `corza-risk`'s drivers are this: named rules against fixed
  thresholds (`7 past drop-dead ≥ 3`, `24d behind > 0`) with explanations that
  do not vary. A widget that looks narrated is often only derived, and
  recognising that is worth real money — derivation costs nothing to refresh.
- **Judged** — authored by a model. Expensive, must be stored, and is _about a
  specific reading_.

## Synthesis routines, and triggers

A **synthesis routine** gathers nothing. It reads datasets and emits a
judgement dataset. It is not a new entity — ADR-0060's routine, with
`consumes:` where a gatherer has `params:`.

That is where ADR-0060's cost saving actually lands. Today `corza-brief` is
one run that sweeps GitHub, sweeps Jira, judges and renders. Under this it is
a synthesis over datasets another routine already gathered, so _N_ narrating
widgets over one subject cost one gather and _N_ syntheses instead of _N_
gathers. For a single narrated widget over its own data it is roughly
break-even — two runs instead of one — and that should be said plainly.

**A routine may be triggered by a dataset updating, not only by cron**
(`on: corza-prs`). That is what makes prose follow data without a view ever
invoking a model. It is opt-in and cron is the default: dataset-triggered
synthesis behind a five-minute gatherer would burn the runner's daily cap
without anyone choosing it.

## A judgement carries the figures it cites

A judgement describes one reading. If the numbers refresh and the prose does
not, a widget lies invisibly — "32 of 55 open" beside a live table showing 35.
There are two ways to stop that, and only one of them is a mechanism.

**A judgement stores the figures it cites, denormalised.** Narrated components
read the judgement and nothing else, so prose and its numbers agree by
construction. The alternative — store a pin and require every component to
render at the pinned version — holds only as long as every component
remembers, and the day one forgets, the failure is silent, inside a sandbox,
with nothing watching.

This is the rule `run-routine` already states: _"Follow the reading, not your
memory of the source… re-deriving a figure it already reported is how two
widgets end up publishing different answers to one question."_

**It also carries a manifest** — for each input, the partition it read:

```json
{
  "judged": {
    "verdict": "Holding",
    "prose": "The Aug 6 gate holds exactly where this morning's rescope…",
    "cites": { "open": 32, "total": 55, "oldestHours": 83 }
  },
  "manifest": {
    "corza-prs": "2026-08-04T09-00-12Z",
    "corza-tickets": "2026-08-04T08-45-00Z"
  }
}
```

The manifest is not what renders. It is what lets a headline be audited down
to the readings behind it, a judgement be recomputed after a retraction, and a
judgement that read a partition which no longer exists be detected.

A historical claim pins a range rather than a point, which is how _"growing
from 76h+ last run and 59h+ before that"_ survives — the synthesis reads the
last three partitions (ADR-0061) instead of parsing a `state` block out of the
previous artifact, which `prior-run` already tells routines not to do.

## Judgements nest; they never juxtapose

A judgement dataset is a dataset, so a synthesis routine can read one. That is
the composition mechanism, and it is recursive: a widget-level verdict over
three subjects is a routine reading three judgement datasets and emitting a
fourth. The provenance chain runs from the headline through its constituent
judgements to their observation partitions.

**One headline, one authoring run.** A verdict assembled by placing two
independent judgements side by side claims a coherence no run ever performed —
the reader infers a synthesis nobody did. Independent judgements may share a
widget when they do not claim to be one story, and then each carries its own
age and nothing above them summarises them.

## A narrated block and a live table may legitimately disagree

One is a dated statement, the other is current. That is honest only if it is
visible, so **narrated kit components carry their own "as of"** — a kit rule,
enforced in code, not an instruction in a template that holds until it doesn't.

The practical shape: observation and trend components update the instant data
lands; narrated components update at synthesis cadence. ADR-0060's freshness
rule already reports this correctly without special-casing, because a widget's
age is its stalest binding, and for a narrated widget that is the judgement.

## Considered options

- **Judgement in its own dataset, self-contained, with a manifest (chosen).**
- **Judgement inside the observation dataset.** Always consistent, no pin
  needed — but one run must both gather and synthesise, which re-welds exactly
  what ADR-0060 unwelds and forfeits gather-once-narrate-many.
- **Reference-and-pin without denormalising.** No duplication; depends on a
  rule holding in every component forever, failing silently when it doesn't.
- **Views calling a model at render time.** No network in the sandbox, no
  determinism, no receipt, unbounded cost. Not considered seriously.

## Consequences

- **Views stay pure.** Nothing on the render path invokes a model.
- **Prose follows data without a human**, at the cost of one synthesis run per
  update — visible, scheduled, capped, and attributable.
- **Widgets that look narrated are often only derived.** Sorting a template's
  rules from its judgements before migrating is where the real saving is.
- **A judgement duplicates figures that also live in an observation.** That is
  deliberate: a dated quotation, not a cache.
- **`corza-risk`-shaped widgets may need no model at all** once their drivers
  are expressed as derivation, which also makes them refresh instantly.
