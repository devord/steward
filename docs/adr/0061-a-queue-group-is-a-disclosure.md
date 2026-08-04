# A queue group is a disclosure, and the rail is a door to it

A progress rail says how far along a horizon is. It cannot say **which
tickets** it is short by, and until now nothing in the artifact could: the
`corza-progress` widget drew two rails, a burn-up and three aggregate ledgers,
and a reader who wanted the 13 open tickets behind the gate bar had to leave
for Jira and rebuild the set by hand — where they would get a _different_ set,
because the widget's `landed` is dual-sourced (Jira `Done` **or** a scoped
conventional commit on `main`) and its `in review` comes from open non-draft
PRs. Neither is a Jira status. The bar and the filter disagree by design.

The fix is a list, and a list of 157 open tickets is not a thing anyone reads
top to bottom. So two decisions, which arrived together because neither is
worth much alone.

## Every labelled group is a disclosure

`groups` puts labelled runs of rows in one `<table>` so they share one set of
column widths. A group heading now folds the rows under it, and
`collapsed: true` ships one folded.

**Not an opt-in.** An opt-in would have spared `corza-pulse` — the only
published widget using `groups` — a caret it did not ask for. It would also
leave two kinds of group heading in one corpus, identical at rest, one of
which answers to a click. A reader cannot tell those apart by looking, and
"the same control looks different in two places" is the inconsistency the kit
exists to prevent. The flag was needed either way to say "`To do` starts
folded", so the opt-in bought nothing but a third state in the API.

ADR-0050 warns that a markup change reaches published artifacts on their next
run with nothing in the data repo to explain it. That warning is about changes
that **relayout** a widget. This one is additive — same rows, same order, same
columns, plus an affordance — and this ADR is the explanation.

**The static file never folds.** `collapsed` is applied by the injected
behaviour, not by the markup: the published document renders every row and the
heading is plain text with no caret. A raw-opened artifact, the copy on the
`artifacts` branch, and anything that does not run scripts all show the whole
ledger. This is ADR-0039's floor stated for a control that carries content —
a fold that a reader cannot undo is not a fold, it is a deletion.

### Why not `<details>`

It cannot be one. A group's rows are sibling `<tbody>` elements inside one
`<table>` — that shared column geometry is the entire reason `groups` exists —
and `<details>` is not table content: the parser fosters it out of the table
before any CSS runs. `display: contents` does not help, because the damage is
done at parse time.

There is no CSS-only path either. Folding "this group's rows and no others"
needs a selector that stops at the next heading, and CSS has no
until-combinator; `~` takes every following sibling, including the next
group's. A hidden checkbox reaches the same wall.

So it is behaviour, injected beside the copy action (`artifact-disclose.ts`),
with two departures from that precedent, both forced by the element carrying
the heading's own text:

- **It upgrades a node instead of revealing one.** The copy action ships a
  `hidden` `<button>`, which is free because a raw file loses nothing without
  it. Hiding a group heading would hide the label, and emitting a second copy
  would put the label in the document twice — so the kit emits a plain
  `<span data-kit-disclose>` and the script adds `role`, `tabindex` and
  `aria-expanded` to it. Before the upgrade it is honest text; after, a real
  disclosure with a real accessible name. A span with `role="button"` gets no
  activation from the browser, so Enter and Space are handled explicitly or
  the control is mouse-only.
- **It folds with `data-kit-collapsed`, never `hidden`.** The fit pass owns
  `hidden` on `[data-fit-item]` and clears it on every re-measure. Sharing the
  attribute would let a re-fit blow a folded group open, or let a fold survive
  as a trim. Two owners, two attributes, no shared state — which is also what
  makes folding safe on a tile rather than only on a `pageOnly` band.

Folding changes height without touching `childList`, `characterData`, or
body's border box, so neither of the tile guard's observers sees it. The
disclosure dispatches `kit:disclose` and the guard re-fits on it, rather than
widening the MutationObserver to `attributes` — which would re-enter on every
write the fit pass makes.

## A rail's figure is a door to its ledger

`href` on a rail turns its percentage into an anchor to a band's `id` in the
same document. Same-document, so no `target="_blank"`: §7's new-tab rule is
about objects that live elsewhere, and opening a tab to scroll would be
absurd. The renderer rejects a fragment naming no block, because a door onto
nothing is the one failure a reader cannot diagnose — they click, the page
does not move, and nothing says why.

**Off tiles**, and gated on the board's tile stamp rather than a width. On a
tile the ledger has been trimmed away or was never emitted, so there is
nothing to arrive at. That is not a limitation to work around: the tile is
triage and the title is already its door (ADR-0057). What the tile gains
instead is the open count in the rail's caption, so it says the list exists
without pretending to hold it.

The first cut used `tier-page` — 900px — and a browser check found a live link
on a wide tile pointing at a band that tile does not contain. A 3-column tile
on a `wide` board clears 900px comfortably, so the width said "page" while the
surface was a tile. This is the same mistake `QueueTable`'s column header made
and the same fix: **the ledger and its door have to be gated on the same
thing**, and the ledger is gated on the stamp.

## Consequences

- **`corza-pulse` gains foldable groups on its next run.** Additive, open by
  default, and named here so the change has a commit behind it.
- **A band may now carry an `id`.** Only when set — an id nothing links to is
  markup nobody reads, and deriving one from the label would mint a target
  that changes whenever the label is reworded.
- **The interaction floor ADR-0050 described has its first real component.**
  Alpine is still unshipped, and this did not need it: like the copy action
  and the toggle group, a committed kit component plus injected behaviour was
  enough. That is now three of the five ADR-0050 named, all without a
  framework.
- **A folded group is invisible to the fit pass's accounting.** It measures
  what is rendered, so a reader who folds `To do` on a tile frees height and
  the pass hands it to the bands below. Correct, and worth knowing: the
  `+N more` count describes the current fold, not the original list.
- **What this does not do is make the tile interactive.** The two ledgers
  `corza-progress` gains are `pageOnly`, so the board's tile is unchanged and
  the burn-up keeps the height budget it took in the first place.
