# "Not on the grid" means orphan, not "absent from this board"

A data repo holds one routine pool and any number of boards (ADR-0023/0025),
and any board may arrange any routine from that pool. The board's **off-grid
parking lot** listed `routines.yaml` minus _this board's_ widgets — so every
sibling board's routines appeared under every other board. A repo with a board
per client showed each client's routines on all the others, and the section's
own copy ("in this repo's shared `routines.yaml` — place one, or delete it from
the repo") asserted homelessness the test hadn't established. The delete
control beside each row acts on the **repo**, so the surface offered to delete
a routine out from under the board that renders it.

**Decision: the parking lot lists orphans — routines on no board in the repo.**
ADR-0025 already coined `orphan` and gave the pool view the placement map; this
extends the same test to the board, from two sources, because they answer for
different boards:

- **This board** comes from the _draft_ (its live widget list). `removeWidget`
  deliberately leaves the routine in the pool, and it must land in the parking
  lot at that moment — not one sync later.
- **Every other board** comes from the committed layouts, read repo-wide by
  `streamPlacements` and streamed (ADR-0030) so the board never waits on it.

**Unknown is not "nothing placed."** A degraded read poisons the whole map to
null and the section hides itself, rather than presenting a placed routine as
an orphan next to a delete button — the asymmetry is deliberate: a hole in the
map is indistinguishable from an orphan, and this caller _acts_ on the answer.
`loadRoutinesPool` keeps its per-board failure isolation unchanged, because its
table only annotates rows ("where is this placed") and a hole costs a chip.

**Routines stay repo-scoped** — the alternative reading of the same complaint,
that a routine should belong to one dashboard, is rejected on three counts. A
routine publishes to `w/<slug>/index.html` on the repo's artifacts branch
(ADR-0002): one routine is one artifact and one publish stream, so per-board
routines would mean near-duplicate runs against the same cloud daily cap, with
two "ran 2h ago" timestamps that drift. The repo is the unit of access
(ADR-0001/0023) and the only boundary GitHub enforces; a dashboard is a layout
file, and hanging ownership on it invents a second tier with nothing behind it.
And placing one routine on two boards is legitimate — the same "needs your
review" widget on a personal board and a project board. The genuine "keep this
work separate" boundary is a separate data repo, which already exists.

Cost: one directory listing plus one layout read per board on each board load,
all ETag-cached (the rail already fetches the same files) and off the paint
path. A repo with many boards pays the same order as the pool view — the
GitHub rate-limit watch item ADR-0025 opened, unchanged in kind.

Rejected: listing placed-elsewhere routines dimmed with their board name, as an
"add it here too" affordance — that is the pool view's **Add to board**
(ADR-0025's division of labour), and rebuilding it here would put a delete
control next to a routine another board renders, the exact hazard being fixed;
deriving placement from the sidebar's per-board reads, which already parse every
layout but strip the routine slugs before the client (it is chrome, SWR-cached
per viewer for a minute, and would tie the board's correctness to the rail's
freshness); an empty map on failure (silently restores the false claim).
