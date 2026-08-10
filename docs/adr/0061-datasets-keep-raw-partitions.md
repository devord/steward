# A dataset is a current file plus one write-once partition per run

ADR-0060 makes a routine publish data. This decides what that data looks like
on the branch, what it is called, and how much of the past it keeps.

The forcing question is history. Some sources carry their own: `repo-modules`
recomputes its weekly trend from git every run and says why — _"never read
from a stored file… each point carries its own window… changing the weights
re-bases the whole history."_ That is the right answer wherever it applies.
It does not apply to a Jira queue, a review backlog, or a CI pass rate. Those
systems answer "now" and nothing else, so an observation not stored when it
was taken is gone permanently. Every week without a store is a hole no later
work can fill.

**Decision: `d/<name>.json` holds current state and is overwritten every run.
`d/<name>/<timestamp>.json` is that run's partition, written once and never
rewritten. Partitions hold the same raw shape as the current file, not a
summary of it.**

## Raw, because a dataset records the subject, not the chart

The tempting shape is a compact rollup — one line of metrics per run — and it
is wrong for a reason that only shows up later. Under ADR-0060 the producer
and the view have separate lifecycles; if the producer picks which metrics
survive, it has to guess at gather time what views will want, and a view
written next year asking a new question finds no history and never will. A
rollup chosen by the producer is not a dataset. It is one view's cache with
extra steps, and it re-couples exactly what ADR-0060 decoupled.

So partitions are schema-on-read. Any future view derives anything from them
retroactively, and nobody guesses.

**Derived rollups arrive later, as a cache.** While raw partitions are
retained, a derived series is recomputable — so changing what "open" means
recomputes it rather than silently re-meaning every old point. The
`repo-modules` re-basing hazard survives only past the raw horizon, which is a
much better failure mode than one that fires on every definition change.

## Why partitions rather than the commit log

The cheaper-looking option is to keep one file and let git be the history:
prior versions are prior commits. Three things kill it.

- **The index is a commit walk.** Reading ninety points means listing commits
  and fetching a blob per point. As a directory listing it is one call, and
  each partition is an immutable path — cacheable forever, with no
  invalidation to get wrong.
- **A squash destroys it.** ADR-0002's watch item contemplates squashing the
  branch to depth 1 to bound growth, and ADR-0038 already records that version
  browsing is what that trades away. Under the commit log, a squash also
  destroys every trend on every board. In the tree, history survives it.
- **Cost scales with runs, not with time.** An hourly routine buries a daily
  question in twenty-four times the reads.

Appending into a single growing file fails differently: git stores each
version whole, so a 1 MB dataset rewritten daily is roughly 365 MB of blobs in
a year, and every run re-uploads the entire history to add one row.

## Names

A dataset is `<subject>-<shape>`: `corza-prs`, `corza-releases`, `ff-people`.
This is ADR-0040's argument transplanted — _"the uniqueness key is the pair
(subject, kind), not either alone"_ — with `shape` where `kind` was, because
the report kind belonged to the report and reports are views now.

Namespacing under the producer (`corza-github.prs`) is rejected for the reason
ADR-0060 exists: it welds every consumer's address to the producer's identity,
so splitting or renaming a gatherer breaks every view that reads it. A dataset
name is a contract; a routine slug is an implementation.

Routine slugs need no new rule. ADR-0040's `<subject>-<kind>` stands, with
`kind` still coming from the template — templates now describe gathers instead
of reports.

**The template declares what it produces**, because only the template knows;
the wizard cannot derive a shape from a param the way it derives a subject:

```yaml
produces:
  - { shape: prs, kind: queue }
  - { shape: releases, kind: timeline }
```

One declaration supplies the name (`<subject>-<shape>`), the `kind` stamp, and
slot matching for ADR-0060's bindings.

## One writer

Exactly one routine produces a given dataset, enforced at sync as a hard
failure — the same class as a bad `template:` reference (ADR-0021). Many
writers would destroy the property `publish-widget` relies on today, that
"paths are isolated per slug, so content never conflicts": it would mean real
merge semantics on the branch, concurrent-run races, and no owner of the
schema. The legitimate case behind wanting it — many repos, one table — is
served by one producer sweeping N subjects, which `params.repos` already does.

## The stamp

Every dataset file carries `name`, `kind`, a schema `version`, and
`generatedAt`. `kind` is what a view's slot matches against, so the board can
refuse `queue-table` bound to something that is not a queue rather than
rendering an empty table that reads as good news.

## Retention, and what git will not give back

Partitions are written once and never rewritten, so growth is linear rather
than quadratic — but git never reclaims a deleted blob. **Pruning bounds
listing cost and the working tree, not clone size.** A daily routine at ~20 KB
is roughly 7 MB a year; an hourly one is ~175 MB and needs a window.

A routine declares retention per produced dataset, and the run that writes is
the run that compacts — never a separate job. `retain: none` keeps the current
file and writes no partitions at all, which is the setting for a gather whose
payload should not accumulate.

**The raw horizon is deliberately not fixed here.** It should be chosen
against real run frequencies, and choosing it early would be guessing.

## Deferred

- **Partition retraction.** A run that gathered garbage — an outage, a
  half-empty sweep — poisons every trend that reads it, and a partition
  records _a run_, so retracting one is honest in a way that editing a row
  never is. It belongs in app chrome, not in a view, and it is not first cut.
- **Row-level correction.** If it is ever wanted, it arrives as a separate
  human-authored annotations dataset joined at read time, never as a mutation
  of an observation. The observed record stays a faithful record; judgement
  lives beside it, versioned separately.

## The branch is renamed

After migration the branch holds `d/…` and nothing else, so `artifacts` would
be a name that lies — the standard ADR-0040 sets for slugs, applied one tier
up. It becomes **`datasets`**: precise, matching the entity, and unambiguous
against `main`'s existing `data/` directory, which `data` would not have been.

The migration is cheap because the branch is orphan and the restructure is
happening anyway. A new orphan `datasets` branch takes every write from
migration onward; **`artifacts` is left in place, frozen.** Pre-migration
receipts stay browsable exactly as they are — which ADR-0038 wants regardless,
since those renders are the only record of what those widgets looked like. No
history rewrite, no write-path shim; the only fallback is on the read side,
for browsing pre-migration runs.

## Consequences

- **Trends become a kit component over `data.history(name, range)`**, derived
  at read time, with no agent involved and nothing stale.
- **Version browsing gets finer.** ADR-0038's unit becomes `(view, partition)`
  rather than a publish receipt, so history exists for runs that changed no
  markup.
- **`prior-run`'s state blocks retire.** A run reading "what did I say last
  time" reads the last partitions instead of parsing state out of the previous
  artifact — which `prior-run` itself warns against doing.
- **A board of trend widgets is a real API budget.** Ninety partitions per
  widget is ninety blob reads; survivable only because the board fetches
  server-side, in parallel, against immutable cacheable paths. It joins the
  rate-limit watch item.
- **Committed raw data is permanent.** Today only a rendered digest reaches
  the branch. A routine sweeping something that should not persist emits
  derived and judged fields only, and its raw payload dies with `$RUN_DIR`.
