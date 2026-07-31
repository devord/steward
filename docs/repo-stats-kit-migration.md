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

**1 — Payload size. Largely fixed since this note was written**, in
`286ae83` on the data repo, independently of the migration.

The 3.29 MB was the encoding, not the data. The series shipped as a dense day
× person matrix repeating the login and all three field names in every cell —
`"VictorMedeiros":{"open":0,"merged":0,"created":0}`, 56 bytes to say nothing
happened, once per person per day. Three lossless passes (positional rows
against the existing `authors` list, deltas over the cumulative counts,
dropping days that move nothing) take the series from 3,593,742 to 358,979
bytes with **every day of history retained**:

| artifact                      | was       | now     |
| ----------------------------- | --------- | ------- |
| `turtle-beach-hydrogen-stats` | 3,285,209 | 501,865 |
| `corza-repo-stats`            | 278,795   | 124,687 |
| `corza-progress`              | 209,865   | —       |
| `corza-pulse`                 | 176,810   | —       |
| `shopify-intel`               | 105,266   | —       |
| `corza-gated`                 | 97,837    | —       |
| `daniel-queue`                | 46,137    | —       |

That puts it in the same order as the rest of the board rather than 12–71×
it. What remains is not the series: `people` is 107 KB of the 502 KB, and the
template itself is 34 KB.

An earlier draft of this note said `corza-repo-stats` was small because it
watches one repo. That was wrong, and worth recording: the day axis starts at
the first PR in the set and **is never clamped**, so corza was small only
because the repo is young — 95 days against turtle-beach's 1038. `build.mjs`
has a `--start` flag for exactly this and no routine passes it. A window is
still available as a second lever (180 days → 66 KB, 90 days → 34 KB), but it
is now an optimisation rather than a precondition.

**2 — Behaviour size.** 430 lines against the bucketer's ~60. Owning that in
the board is real work and real surface. It is still the stated direction, and
the alternative is leaving it re-derivable and ungated. This is now the
**larger** of the two blockers.

## Options on the payload

Superseded in part — (0) has shipped. Kept because the ranking was wrong in a
way worth not repeating.

0. **Fix the encoding.** ✅ `286ae83`. 10× on the series, no fidelity lost, and
   entirely inside `build.mjs` + the template's reader — no kit dependency.
   Should have been first; it was not in the original list at all.
1. **Window the series server-side** — carry a trailing N months and let the
   full history stay in `data.json` on the branch, which is already published
   beside `index.html` and already the incremental-merge store. Keeps daily
   granularity for the range anyone scrubs in practice.
2. **Use the reserved Alpine escape.** The kit README holds the seam open —
   Alpine "has that seam reserved but is not injected today: nothing emits
   `x-data` yet, and a framework with no consumer is cost without benefit."
   `repo-stats` would be that first consumer, which is the stated trigger. The
   validator already anticipates it, warning about hexes arriving "through the
   Alpine escape hatch". Does nothing for payload and means owning a framework
   in the board for one widget — hence last.
3. ~~**Coarsen the axis to weekly steps.**~~ Dropped. Only ~7×, strictly worse
   than fixing the encoding at 10×, and the sole option that _loses_ daily
   granularity. It ranked first in the original draft on the assumption the
   widget pre-rendered variants per scrub position. It does not — it embeds
   data and computes — so axis granularity was only ever a payload lever, and
   a worse one than the encoding sitting next to it.

## Open

- The kit's `state` field is documented as inert JSON an artifact carries **for
  its next run**. Here the payload is a _render input_. Same channel or a new
  one is a contract decision.
- `corza-repo-stats` (natan's) migrates on the same change — it shares the
  frozen template, drifted identically, and got the encoding fix identically.
- `people` at 107 KB is now the second-largest block in the file. Probably
  inlined avatars; not looked at.
