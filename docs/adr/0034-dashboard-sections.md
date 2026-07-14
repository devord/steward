# Dashboard sections — grouping a repo's boards in the rail

ADR-0023 lists every board in a repo as one flat list under its rail group
heading; ADR-0025 closes that list with the routine pool. One repo can hold
many boards — a client per board, a project per board, a team surface per
board — and a flat list of a dozen mono slugs stops being glanceable
(principle 4). The rail needs a middle tier between the repo and its boards.

**Decision: a board may declare a section; the repo may order the sections.**
Two additive config fields, both git-visible (principle 3), matching where
board and repo identity already live (ADR-0026):

- `data/dashboards/<slug>.yaml` gains an optional `group:` — the section this
  board sits in, a free-text label the viewer authors ("Clients",
  "Projects"). Membership rides with the board, the same file its `name:`
  lives in.
- `data/repo.yaml` gains an optional ordered `groups:` list — the **section
  order** only, not membership. A section a board names but the list omits
  sorts after the listed ones, alphabetically; a name in the list no board
  uses contributes nothing (no empty heading).

Why split membership from order: a board's section is a fact about that
board and belongs on it, so moving a board is a one-file commit and needs no
repo-wide manifest. But the section _sequence_ can't be derived — the
motivating example (Team, Clients, Projects) is neither alphabetical nor
creation order — so the one thing that genuinely needs a home in the repo,
and only that, goes in `repo.yaml`. Duplicating membership there would give
two sources of truth for the same fact.

**Rail rendering.** Ungrouped boards lead in one unlabeled section (where the
default `main` normally sits), then labeled sections in the resolved order.
A repo with no `group:` on any board yields a single unlabeled section — the
flat list, byte-for-byte as before, so grouping is opt-in and free of
regression. The section sub-heading is one tier below the repo heading and
set off by weight, not color (both 13px `ink-dim`, the AA-legible role for
navigational text — not the ≥3:1 `ink-faint` metadata role): the repo heading
is medium at the group margin, the section is regular, indented onto the
board-name column inside the repo. One spine per repo still runs the whole
list to the pool — a section is a labeled cluster within the repo, not a new
"you are here" context.

**Authoring.** Folded into the per-board `⋯` menu, whose "Rename" becomes
"Edit dashboard": name plus section, the section a free-text input with the
repo's existing sections offered via a native `datalist` (pick one to file
the board there, type a new name to start a section). It posts to
`/dashboards` (`intent: rename`, now carrying `group`), a direct commit like
the rest of the board lifecycle (ADR-0010) — and the commit message names
what changed (`rename` / `move` / `edit`), because git is visible here and
"rename" must not appear when only the section moved. Section _order_ is not
yet editable in-app; `repo.yaml groups:` is authored by hand until a repo has
enough sections to warrant a reorder affordance.

Cost: none beyond ADR-0026's existing reads — `group` comes from the same
per-board layout read the rail already does for `name`, and `groups` from the
same `repo.yaml` read it already does for the display name. A malformed field
degrades to "ungrouped" / "no order", never a failed rail.

Rejected: a top-level regrouping that crosses repos (a repo is the unit of
access in ADR-0023/0001 — a section spanning repos would cross permission
boundaries); a single `repo.yaml` manifest listing sections _and_ their
members (two sources of truth for membership, and a board move becomes a
repo-file edit); deriving section order from board order or the alphabet (the
motivating order is neither).
