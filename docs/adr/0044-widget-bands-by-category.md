# Widgets band by category; the category rides on the routine

A board holds one subject and every widget on it is a kind of report about
that subject. ADR-0040 already named those two axes and gave each a home: a
routine slugs itself `<subject>-<kind>`, subject from the data, kind from the
template. The rail adds a third tier above them — sections grouping boards
inside a repo (ADR-0034/0039) — and in practice that axis gets spent on
subject too: Clients (`corza`, `turtle-beach`), Personal (`daniel`), Topics
(`intelligence`).

Which leaves nowhere to say that "Project Brief" and "Progress Report" are
project-management reading while "Under Review", "Ticket Gaps" and "Repo
Statistics" are engineering reading. That distinction is a grouping over
**kind**, orthogonal to subject, and a board of a dozen mixed widgets stops
being glanceable without it (principle 4).

Splitting the board is the move the existing model offers, and it is the
wrong one here: `corza` would become `corza-pm` + `corza-eng`, and because
the distinction applies to every subject, so would every other board. Four
subjects times two categories is eight boards, a third category makes twelve,
each subject's name repeated down the rail, and the "all of corza at once"
board — the one actually in use — gone. A cross-product is not a split.

**Decision: a widget's band is a category, declared by its template,
materialized on its routine, and rendered as its own grid.**

## Where the category lives

- **`templates/routines/<id>.md`** gains `widget.category` — the default band
  for every routine built from it. Classified once, inherited everywhere, so
  grouping costs no per-board curation. This is the payoff: `repo-pulse` is
  engineering-facing on every board in every repo, and nobody files it twice.
- **`data/routines.yaml`** gains `category:` on the routine — the override,
  and the only tier the app writes. ADR-0022 froze the app's writable surface
  at two file kinds forever, and templates are not one of them; built-in
  templates are worse than un-editable from a data repo, they live in the
  shared `steward` repo and a normal user cannot touch them at all. Without a
  routine-level field there would be no in-app recategorization, ever. It is
  also how a `custom` routine — which ships no `widget:` block by design, and
  is the on-ramp — gets a band at all.
- **`data/repo.yaml`** gains `categories:` — band order only, exactly as
  `sections:` carries section order and for the same reason: "Project
  Management before Engineering" is neither alphabetical nor creation order,
  so it can only be stated.

**Not on the widget.** A layout entry could carry its own band, and that is
rejected: ADR-0042 blesses one routine sitting on several boards, so a
per-placement category means the same widget answers "what am I" two
different ways on two boards, and drifts ("Eng" vs "Engineering") for free.
That is the duplication ADR-0039 deleted the board `name:` field to remove. A
category describes what a widget _is_; it belongs with the routine.

## Resolution is tri-state

```
routine.category = "Engineering"  → that band
routine.category = null           → deliberately no band
routine.category absent           → inherit template.widget.category
                                    absent there too → unlabeled band
```

Absence had to mean _inherit_ rather than _uncategorized_, otherwise
ADR-0040's "existing routines are untouched, no migration" would leave every
routine already in a data repo — the whole motivating board — banding into
nothing until hand-edited. Inheriting costs a third state: once absence asks
the template, `null` is the only way left to say "asked, and the answer is
none".

The reason ADR-0040 _materialized_ the slug does not transfer. A slug is an
identifier — the artifact path `w/<slug>/index.html` (ADR-0002), the publish
receipt (ADR-0026), the compare URL (ADR-0038) — and freezing it is what
keeps those addresses honest. A category is a label. Nothing addresses it and
nothing breaks when it resolves late.

**But it still materializes on write.** `routines.yaml` is awaited by the
board loader; templates are streamed (ADR-0030). Pure inheritance would mean
a board paints flat and then reflows into bands when the template stream
lands — a re-layout of live iframes, well past 200ms, undoing the
glanceability the bands were for. So the wizard and the edit dialog persist
the resolved value, and inheritance is the bootstrap that makes existing
routines band today. The transitional reflow is confined to repo-template
routines that have not been edited since, and disappears repo by repo. This
is ADR-0039's parse-boundary move: the first in-app edit rewrites the file
forward, and no migration is required.

Built-in categories are free at paint regardless: the built-ins are inlined
at build time (`import.meta.glob`, no API call), so `loadDashboardStructure`
resolves them synchronously and ships them with the awaited payload.

## One grid per band

Bands are **not** headings inserted into a single grid. ADR-0041's
`verticalCompactor` floats every item up until it collides and has no notion
of a boundary, so a shared grid would let an Engineering widget drift into
the band above it the first time a neighbour was removed. Turning compaction
off is not available either — ADR-0041 tried exactly that and reverted it,
because displaced widgets got stranded and "read as a bug".

So each band renders its own `ResponsiveGridLayout`, with its own row space.
Compaction stays correct inside a band and cannot cross one. Stored rows are
untouched on disk: a band whose widgets start at row 4 compacts them to its
own top on first render — the first-render compaction ADR-0041 already
accepts — and the settled band-relative rows persist on the next drag, so no
migration is needed here either.

The consequence is that **drag is no longer the recategorize gesture**.
Dragging between bands would have to rewrite the routine's category, which
changes it on every board hosting that routine — a layout gesture silently
editing shared identity, the hazard ADR-0042 exists to prevent. Recategorizing
is an explicit edit that says how many boards it touches.

## The floor, and collapsing

A board bands only at **two or more** distinct resolved categories; below
that it renders flat and headingless, byte-identical to today. Without the
floor, a built-in gaining a category would leave unrelated boards showing one
lone "Engineering" heading above five headingless widgets — strictly worse
than the grid it replaced, and arriving unrequested.

A labeled band **collapses**, and the collapsed set is keyed by category
name, not by board: folding "Engineering" folds it everywhere. That is what
turns collapse from a layout convenience into a viewing mode — one click and
every subject board reads as a PM board — and it answers the "organize by
viewer" ask without inventing any access control, which ADR-0001/0023 reserve
entirely to GitHub repo permissions. A collapsed band unmounts its cells, so
it costs no iframe and no artifact fetch.

The set is a **cookie**, not localStorage where the theme lives (ADR-0009):
the server has to know before it renders, or the board paints expanded and
then jumps — the exact shift collapsing was meant to remove. Same mechanism
as the locale preference, for the same reason. It is a device preference, not
data, and stays out of the data repo.

## Cost and consequences

- One added awaited read on the board loader: `data/repo.yaml`, for band
  order. The rail already reads this file for the repo's display name and
  section order, so it is an ETag hit in practice. It is awaited rather than
  streamed because an order arriving late would reorder the grid after paint.
- Everything else is free: the board already builds `routinesBySlug` and
  already imports `streamTemplates`, and built-in categories are bundled.
- Built-ins ship two categories (`repo-pulse` → Engineering,
  `repo-narrative` → Project Management), which does push one vocabulary into
  every data repo. `daily-plan` deliberately ships none — a person-owned plan
  has no honest place on a project axis. The escape hatches are the routine
  override, the floor (a single category never bands), and `categories:` for
  order.
- Malformed input degrades, never fails: an unreadable `repo.yaml` means "no
  order authored", a corrupt collapse cookie means "nothing collapsed". Every
  band open and every widget visible is the honest floor.

**Rejected:** per-widget categories (above); the board cross-product (above);
per-viewer _widget selection_ — a genuinely different feature that would put
access rules somewhere other than GitHub, contradicting ADR-0001/0023;
deriving band order from row order (it makes `categories:` meaningless and
re-couples order to placement); auto-flowing widgets when banded, ignoring
stored positions (it discards the hand-placement ADR-0041 was written to get
right).
