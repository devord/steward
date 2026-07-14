# Routine runs view — publish receipts are the run history

The pool view (ADR-0025) answers "is anything stale?" across a repo, but a
routine's _history_ has no surface at all: how regularly it has actually
been running, when the schedule skipped, what each run published. The
obvious source — the cloud host's own run log on claude.ai — is not
readable by the app: the routines API's only endpoint is the fire POST
(ADR-0016), its bearer token is documented as **trigger-only** ("grants no
read access"), and no list-runs API exists in the research preview. And
ADR-0026 already rejected building a parallel run log for the app to read.

**Decision: a routine detail view at `/r/:owner/:repo/routines/:slug`**
(a child of the pool's reserved segment), reached by clicking a routine's
name in the pool table. It shows the routine's facts — the pool row's
columns, unfolded — and its **run history derived from the publish
receipts themselves**: the commits touching `w/<slug>/index.html` on the
artifacts branch. Every run's mandatory last step is exactly one such
commit (ADR-0002/0026), so the path's history _is_ the run record — the
same source "ran 2h ago" already reads, extended from the last commit to
the last N. No parallel channel is created; the receipt doctrine is read
at full depth instead of only its top entry.

Each receipt row carries: when it published (relative, full timestamp on
hover), the **gap** to the previous run — judged against the cron as
`on-schedule` or `late` past 2× the interval, the same threshold the stale
badge uses — the commit author, and the receipt itself (short SHA linking
to the commit on GitHub, where the published diff is inspectable). The
oldest receipt is tagged `first run` — except on a capped listing, which
says "last N runs" and leaves its truncated oldest row unjudged (it is
merely the oldest fetched, not the first).

**What this view honestly cannot show: failures.** A run that dies before
publishing leaves no receipt — its evidence is the _absence_ of a commit
(surfacing as a `late` gap or a stale badge). Session logs, transcripts,
and failed runs live on the routine's claude.ai page, so the view links
out prominently (header action + a note under the runs heading) whenever
the trigger file supplies the routine id — the same id the pool's
"Open in claude.ai" menu item uses.

## Considered options

- **Read receipts from the artifacts branch (chosen).** One commits-API
  page per view; data the viewer's GitHub token already reaches; zero new
  credentials or storage.
- **Fetch runs from claude.ai** — no read API exists; the trigger token
  can't read by design, and scraping the web UI's private API would couple
  the app to an unversioned surface and someone's browser session.
- **Record run metadata ourselves** (e.g. the fire route logging session
  ids returned by the fire API) — only sees app-fired runs, misses every
  scheduled one; and it is exactly the parallel reporting channel
  ADR-0026 rejected.
- **Embed the claude.ai routine page** — cross-origin, auth-walled, and
  frame-blocked; not a real option.

## Consequences

- "Run" becomes first-class vocabulary (CONTEXT.md): one execution of a
  routine on its host, evidenced by its publish receipt.
- The detail view spends one commits-API call (ETag-cached, streamed after
  paint) plus the pool-style artifact/trigger reads — same order as a
  pool row.
- Only committed routines have detail pages; a draft-only routine's name
  stays inert in the pool table until synced.
- If a read API for routine runs ships later, it slots in as an
  _enrichment_ of this view (per-run session links, failure rows), not a
  replacement — the receipts remain the freshness truth.
