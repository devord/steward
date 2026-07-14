# Per-board freshness in the rail

"Freshness is the product" (principle 2): time-since-run and staleness are
meant to be first-class, always-honest UI. Yet the rail — the surface a user
opens a few times a day to answer "is anything stale?" — showed none of it.
A board carried a name and, when active, a dot; nothing said when its widgets
last regenerated or whether any had fallen behind its schedule. The board
page has this per widget (`loadArtifacts` reads each artifact's last-commit
date, ADR-0026); the glance-first surface didn't.

**Decision: every board row carries an always-on freshness dot and a
right-aligned age, rolled up from its widgets.** A board is a layout of
widgets (each a routine's artifact), so its freshness is an aggregate:

- **Age** = the board's _stalest_ widget's last run — the most-behind part.
  A board is only as fresh as its oldest content; showing the freshest widget
  would hide exactly what the glance is looking for.
- **Stale** = _any_ widget overdue against its own routine's cron schedule
  (`isStale`, ADR-0016) — schedule-aware, not a flat age threshold: a daily
  widget two hours old is fresh, a five-minute widget two hours old is stale.
  Manual and never-run widgets are never stale (ADR-0016), so they don't
  redden a board on their own.

**Rendering.** The board's leading marker — until now the active/hover dot —
becomes the freshness dot, shown at rest for every board: **red** when stale,
a quiet **green** when fresh, **faint** when unknown (no run yet, or the
publish history is beyond the read window). The **active** board overrides to
the accent (orange) — "you are here" outranks freshness on the one row you're
already on. Colour is never the only signal: an `sr-only`/`title` phrase names
the state, and the age reads plainly beside it. The age sits right-aligned in
`tabular-nums`, the terminal "icon · name · age" line the captions (the
Flow-inspired header pass) set up. The routines pool keeps its own row; this
is boards only.

**Data — one extra read pattern per repo, on the SWR window, never the paint
path (ADR-0030).** Freshness is cosmetic staleness, exactly what that ADR
permits the sidebar cache to serve stale, so it is computed inside
`loadSidebar` and revalidated in the background — never on the two config
reads that gate paint. Two facts feed it, both cheap:

- **Which widgets a board holds** is already parsed for free: the rail reads
  each board's layout file for `name`/`group` (ADR-0026/0034) and today
  discards the `widgets` beside them. We keep the routine slugs.
- **When each widget last ran** comes from _one_ commits-list call per repo
  against the `artifacts` branch, mapped by the publish convention: every run
  commits `publish: <slug>` touching `w/<slug>/index.html` (ADR-0002), one
  slug per commit, so the newest such message per slug dates it. This replaces
  a per-widget fan-out (one `getLastCommitDate` each — the cost ADR-0030 moved
  off the rail) with a single page. A slug absent from that page is
  definitively stale-or-idle, which reads as "unknown" — acceptable for a dot.
- **Schedules** come from one `data/routines.yaml` read per repo (the same
  file the routine pool reads, ADR-0025), so `isStale` can judge overdue.

Net cost: **+2 reads per repo** on a cold rail (publish history + schedules),
both ETag-cached and SWR-held; warm navigations and background polls pay zero
(ADR-0030). Freshness can lag an out-of-band run by up to ~2×TTL — accepted,
the rail is chrome and the dot self-corrects on the next revalidate.

Cost is bounded by the read window: a repo with a very long publish history
shows freshness only for slugs in the most recent page; the rest read
"unknown", never wrong. A hand-authored or squashed artifact commit that
breaks the `publish: <slug>` convention degrades that widget to unknown, never
a failed rail.

Rejected: **a flat age threshold** (green <1d, red older) — cadence-blind, it
brands a weekly report "stale" the day after it correctly runs; the schedule
is the honest yardstick, and it's one cheap read away. **Per-widget
`getLastCommitDate` in the rail** — correct but N live round trips, the exact
thing ADR-0030 forbids on discovery. **A parallel run-log** — the publish
commit already _is_ the receipt (ADR-0026); a second source would need keeping
honest. **Freshest-widget rollup** — hides the stale part, defeating the
glance.
