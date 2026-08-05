# Spend is a page in the app, read from one branch-wide scan

ADR-0060 put a run's price on its own publish commit, and ADR-0033's detail
view reads it one routine at a time. That answers "what did this routine
cost" and nothing else: not which routine is the expensive one, not who is
spending, not whether the bill is going up.

The obvious counter-proposal was to make it a **widget** — a routine that
reads the artifacts branch and publishes a spend report, which is what this
product is for. Under `run-routine` the data repo is a real checkout, so
`git log origin/artifacts` hands a routine the entire history in one
command: no API, no pagination, no rate limit, lifetime rather than a
window. It would also compose `slack-post` for a threshold alert. That is a
genuinely better data path, and PRODUCT.md names analytics chrome as an
anti-reference, so the argument had teeth.

It was rejected on reach. A widget exists only where someone has added the
routine, in one data repo, and a viewer who has not set it up sees nothing —
where the question "what is this costing me" is one every viewer has, from
the first repo, with no setup. Cost is also already app-domain: `runs.ts`
parses the trailers, the pool ledger renders the average, and the app owns
the honesty rules about what the figure is. A widget would have to restate
all of it.

**Decision: `/r/:owner/:repo/spend`,** a reserved segment beside `routines`,
scoped to one data repo like every surface below `/settings`.

**One scan, shared.** The page reads `listPublishLedger` — the same
branch-wide commits scan the pool's average already uses, `swr`-cached per
repo. A publish commit names its routine in its subject, so one page prices
~100 runs across every routine at once, where asking per routine costs a
request each. Two surfaces reading two windows would disagree about the word
"average", which is why there is one window and one definition.

**Bounded twice, and it says which bound it hit.** 30 days or 10 pages,
whichever arrives first. Pages past the first rarely change and return 304
from the ETag store, costing no rate limit, so the usual scan is one live
request. A scan that stops on the page ceiling renders "over the last N
runs" instead of "over the last 30 days".

**Three axes, all free.** By routine, by owner (`runner ?? repo owner`, the
pool's own rule), by band. The commit author is _not_ an axis: every publish
commit on the branch is authored by `Claude`, so attribution has to come
from `routines.yaml`. The Claude account — whose subscription actually
burned, ADR-0012 — is the truer axis and was left out: it costs a trigger
read per routine, and it is an email address, the ledger's only PII, which
the pool already keeps behind a tooltip.

**Charts are hand-rolled, matching the artifact kit's own split.**
`@steward/artifact-kit` draws harder charts than this page with no charting
dependency: `Meter` and `Throughput` are CSS widths and heights, `Series`
and `Sparkline` are inline SVG with stroke bound to theme tokens. The spend
page follows — CSS bars, SVG available later if an axis is ever wanted. A
library was considered and rejected on four counts, none of them weight: a
canvas is opaque to `theme.test.ts`, which holds every palette to AA; it
renders client-only, so a page whose job is a glance paints blank first; its
text is configuration rather than inheritance, and DESIGN.md pins this
surface to one 12px mono line box; and there is one series here — dollars —
so there is no categorical palette to be worth a dependency.

**Magnitude is neutral ink, never semantic colour.** Green, yellow and red
are spent on fresh, stale and unreachable one column away in the pool.
Bars scale against the heaviest row in their own list — relative, because
"expensive" can only mean "expensive next to what else you run"; an absolute
threshold is not a claim an imputed figure can carry. Linear, because a log
scale would make short bars legible by lying about the ratios that are the
only reason to draw bars.

**Absence never renders as zero.** A day that ran without pricing anything
draws no column, rather than a zero-height one: pricing began part-way
through any window reaching back past ADR-0060, so a flat run of empties
would claim the routines ran free on days they merely ran unpriced. The day
axis stays continuous, so a quiet stretch keeps its width. A routine that has
left `routines.yaml` is still named by its slug and counted — deleting the
config entry does not un-spend the money. (Narrowed by ADR-0063: one that
left `routines.yaml` _and_ never priced a run spent nothing to preserve, so
it is dropped from the by-routine list, which then states how many it
dropped.)

**It will look thin for a while, and that is the honest state.** Of the last
300 publishes on `steward-data-formfactory`, 9 carry a price; the rest can
never be backfilled, because the session that knew is on claude.ai and the
app cannot read it (ADR-0016). Every total therefore states how many of its
runs were priced. The page is correct on day one and truer every day.

Rejected: **a cross-repo roll-up** — truest to "what am I spending", but it
multiplies the request budget by repo count and has no home in a rail that
groups by repo; the per-repo page can grow one later. **Reading the full
history** — lifetime totals with no window caveat, but unbounded on an old
repo and the one shape that can exhaust a rate limit. **A stacked
day-by-routine chart** — one chart answering everything, but 18 series needs
a categorical palette this theme does not have and should not grow, since
colour here is spoken for by state.
