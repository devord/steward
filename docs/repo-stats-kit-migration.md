# Migrating `repo-stats` to the kit

`repo-stats` is the last routine still rendering from its own frozen
`template.html` instead of the kit. Since `8991efc` the validator rejects
it outright:

```
error: no <meta name=steward-kit-version> — this artifact was not rendered by
the kit. Emit a data.json and run render.mjs (ADR-0050)
```

Nothing is broken today, and that is the problem. The routine publishes
through its own `build.mjs` rather than `publish-widget`, so it never reaches
the gate that would fail it. Its palette drifted to classic gruvbox for a week
in exactly that blind spot — 11 of 17 tokens disagreeing with
`widget-artifact/tokens.json`, both live instances painting the wrong colours
on the board, and no run ever reporting it. Frozen plus ungated is how a
routine rots quietly.

This note scopes the migration. It does not decide it: the payload question
below is a product call, not an engineering one.

## What the widget actually is, measured

Not estimated — read off the committed template and the published artifact.

|                                                        |                                               |
| ------------------------------------------------------ | --------------------------------------------- |
| `template.html`                                        | 1061 lines / 34,011 bytes                     |
| — of which CSS                                         | 484 lines                                     |
| — of which interactive JS                              | **430 lines / 16,205 bytes**, one block       |
| published `index.html` (`turtle-beach-hydrogen-stats`) | **3,285,209 bytes**                           |
| — of which one embedded JSON block                     | **3,251,586 bytes (99%)**                     |
| `fetch` / `XHR` calls                                  | **0**                                         |
| compiled span                                          | 1038 days, 32 owners / 29 reviewers, 2696 PRs |

The embedded block is `<script type="application/json"
id="steward-history-data">`, carrying `views` (owner and reviewer), `people`
and `repos`. The 430 lines read it and compute bar geometry in the browser.

## The finding: it already has the kit's shape

The interactivity was the thing that looked like a blocker, and it is not.

`repo-stats` is **static markup + a carried JSON payload + vanilla behaviour,
fetching nothing**. That is the kit's architecture, arrived at independently.
There is no framework in the file, no runtime React, no network. The three
toggles are not an exception to ADR-0050 — they are an instance of the pattern
the board already runs three times over.

The seam is proven. `frameArtifactHtml` already injects the copy action, the
fit pass, and `ARTIFACT_BUCKET_SCRIPT`. That last one's own docstring makes
the argument for moving this behaviour too:

> `repo-pulse` used to carry this as ~40 lines the model transcribed into every
> run. Behaviour is the worst thing to re-derive per run: a drifted stylesheet
> looks wrong, a drifted bucketing shows the wrong person's queue and looks
> fine.

Interaction is anticipated, not merely tolerated — the tile guard's
`MutationObserver` is documented as catching "a sort or filter click", which
is why an interactive tile cannot silently overflow.

So the migration is structural, not a rewrite:

- the kit emits the markup and carries the compiled series;
- the 430 lines move into the board beside `artifact-bucket.ts`;
- `build.mjs` stops rendering and starts emitting a document, and publishes
  through `publish-widget` like every other routine — which puts it back
  behind the gate.

## The two real blockers

Neither is "the kit cannot express interaction".

**1 — Payload size.** A 3.29 MB artifact, against every other widget on the
board:

| artifact                      | bytes     |
| ----------------------------- | --------- |
| `turtle-beach-hydrogen-stats` | 3,285,209 |
| `corza-repo-stats`            | 278,795   |
| `corza-progress`              | 209,865   |
| `corza-pulse`                 | 176,810   |
| `shopify-intel`               | 105,266   |
| `corza-gated`                 | 97,837    |
| `daniel-queue`                | 46,137    |

**12–71× the rest of the board**, and the kit inlines `kit.css` into every
artifact, so migrating grows it further. Note `corza-repo-stats` — same
template, one repo — is 279 KB, so the size is the 5-repo × 1038-day span, not
the template. Whether the board should host a 3 MB tile is the open question.

**2 — Behaviour size.** 430 lines against the bucketer's ~60. Owning that in
the board is real work and real surface. It is still the stated direction, and
the alternative is leaving it re-derivable and ungated.

## Options on the payload

Ranked. Note the first one's rationale is **not** variant pre-rendering — the
widget pre-renders nothing, it embeds data and computes, so the axis
granularity is a payload-size lever, not a combinatorial one.

1. **Coarsen the axis to weekly steps.** Cuts the embedded series roughly 7×,
   to ~470 KB — in range of the rest of the board. Probably loses little:
   per-person PR throughput is barely legible day-to-day. Cheapest, and it
   attacks the actual problem.
2. **Window the series server-side** — carry a trailing N months and let the
   full history live in `data.json` on the branch, which is already published
   beside `index.html` and already the incremental-merge store. Keeps daily
   granularity for the range anyone scrubs in practice.
3. **Use the reserved Alpine escape.** The kit README holds the seam open —
   Alpine "has that seam reserved but is not injected today: nothing emits
   `x-data` yet, and a framework with no consumer is cost without benefit."
   `repo-stats` would be that first consumer, which is the stated trigger. The
   validator already anticipates it, warning about hexes arriving "through the
   Alpine escape hatch". This does nothing for payload size and means owning a
   framework in the board for one widget — hence last.

## Open

- Does the board tolerate a multi-megabyte tile, or is (1)/(2) a precondition?
- The kit's `state` field is documented as inert JSON an artifact carries **for
  its next run**. Here the payload is a _render input_. Same channel or a new
  one is a contract decision.
- `corza-repo-stats` (natan's) migrates on the same change — it shares the
  frozen template and drifted identically.
