# Routine pool view + repo-scoped routines draft

The app is board-centric: the rail is `data repo → dashboards`, and every
routine the user can see is a **widget** — a _placement_ of a routine on a
grid. But a data repo's **routine pool** (`data/routines.yaml`) is a
first-class concept the board surface never shows as itself. Three gaps
follow: a routine placed on no board (added-but-not-placed, or unplaced
from a board — `removeWidget` deliberately leaves the routine behind) is
**invisible** — it can't be seen, edited, run, or deleted anywhere in the
app; "is anything stale?" across a repo means visiting every board; and the
`routines.yaml` half of the writable surface (ADR-0022) has no whole-pool
home, only the board's per-widget edit dialog.

The **routine pool view** (`/r/:owner/:repo/routines`, a per-repo peer of
the boards, reserved segment ahead of the `:dashboard` slug) is one table
of the whole pool: each routine's state (the same `run-routine.ts`
`live/stale/manual/disabled/…` vocabulary the widget footer uses, streamed
in after the table paints exactly as widget bodies stream, ADR-0002), its
schedule, host, **owner** (its `runner`, or the repo owner for home pools),
the **boards it's placed on** (read live from every layout — the one signal
the boards can't give: a routine on no board shows `orphan`), and a link to
the cloud routine on **claude.ai** (`/code/routines/{id}`, the id read from
its trigger file, ADR-0016). It is a terminal-calm ledger — a real table,
hairline rows, mono identifiers, one leading state node — not a Grafana
console; the boards still carry the color (DESIGN principle 1).

**Division of labour with the boards.** The pool view owns the
`routines.yaml` surface end to end — create (into the pool only, an orphan
until placed), edit, enable/disable, delete, run-now (the existing `/run`
fire, ADR-0016). Placement stays a _layout_ edit, owned by the board grid
editor: the row's **Add to board** navigates to the chosen board with
`?place=<slug>`, and the board drops the routine at a free slot in its own
draft and opens edit mode on it — no slot/collision logic is rebuilt here,
and it's the only way to re-home an orphan (there is no "add existing" on a
board). Placement is offered only for a _committed_ routine, since the
board loader reads committed `routines.yaml`; a still-draft routine says
"sync first".

**Repo-scoped routines draft.** Drafts (ADR-0003) are per-board
(`owner/repo:slug`) and bundle `routines.yaml` + that board's layout. The
pool view is repo-wide with no board in scope, so it reuses the same draft
machinery under a reserved key (`owner/repo:__routines__`, uncollidable
with a kebab slug) with a null/empty dashboard side that is never touched
or committed: `SyncPanel` and `/sync` take `dashboardSlug` as optional and
simply skip the dashboard file when it's absent, committing `routines.yaml`
alone through the same diff → commit/PR → conflict path. Two drafts in one
repo touching `routines.yaml` (a board draft and the pool draft, or two
boards) is the pre-existing multi-draft case the stale-base conflict
detection already covers — last writer sees the moved base, never a silent
overwrite.

Consequences: the pool page spends one `routines.yaml` read + one layout
read per board (failure-isolated, ETag-cached) plus the streamed
per-routine artifact/trigger reads — the same order as a board, on the
GitHub rate-limit watch item. `routines` becomes a reserved board slug per
repo. The reused add-routine dialog still asks for a size in the pool's
"new routine" flow though no board is in scope; the answer is dropped until
placement (a wart, not a bug — a later pass can make the size step
board-conditional). Rejected: committing `routines.yaml` edits directly
without the draft/diff layer (inconsistent with ADR-0003, no conflict
safety); a standalone **templates** table (templates are authored in Claude
Code, never the app per ADR-0022, and already browsable in the add-routine
picker — a read-only catalog with no actions earns no top-level surface);
rebuilding placement inside the pool view (duplicates the grid editor's
slot/collision truth).
