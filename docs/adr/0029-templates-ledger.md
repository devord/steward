# Templates ledger on the routines pool page

Amends ADR-0025, which rejected "a standalone **templates** table" on two
premises: templates are read-only in the app (authored in Claude Code,
ADR-0022), and the add-routine picker already lets you browse them. Both
premises hold, but they argued past what a catalog is actually for. The
picker shows a template's name, description, and source badge — mid-add,
inside a modal — and can't show anything relational:

- **Used-by**: which routines instantiate a template, including none. An
  unused template is the exact twin of the pool view's `orphan` — a
  cross-reference only a repo-wide surface can compute, and the signal
  that justified the pool view itself.
- **Shadowing**: a data-repo template hiding a same-named built-in
  (ADR-0021) is invisible everywhere — discovery folds the pair into one
  picker card and the override is silent.
- **The file itself**: templates are files in the data repo ("git is
  visible"), yet nothing in the app points at
  `templates/routines/<id>.md`.

## Decision

A read-only **Templates ledger** as a section of the existing routines
pool page (`/r/:owner/:repo/routines`), below the pool table, in the same
table language. Columns: template (mono name over the id that
`routines.yaml` references), description, source (`built-in` tag or the
repo name, plus an `overrides built-in` tag when a repo template shadows
one — `DiscoveredTemplate` gains a `shadows` flag set by discovery),
suggested schedule, and used-by (routine slugs from the draft-aware pool;
`unused` mirrors `orphan`). Repo templates link out to their file on
GitHub.

**Not a new route.** Every static segment under `/r/:owner/:repo/`
permanently reserves a board slug (`routines` already paid that price,
ADR-0025); a second reservation for a handful of read-only rows isn't
worth it, and the pool page is already the repo's "what runs" surface —
the ledger completes it with "what runs is made from".

**One action, and it instantiates rather than edits:** _new routine from
template_ seeds the add-routine dialog with that template pre-picked
(`initialTemplate`), exactly as clicking its picker card would. This
answers ADR-0025's "a catalog with no actions earns no surface" without
touching ADR-0022 — authoring and editing templates stay in Claude Code.

## Considered options

- **Section on the pool page (chosen).** No reserved segment, no nav
  item; the cross-reference and the pool share one draft-aware dataset.
- **Standalone `/r/:owner/:repo/templates` page.** Full reversal of
  ADR-0025: a second reserved segment and a sidebar entry for the
  smallest dataset in the app (a few built-ins plus a few repo files).
- **A template column on the routines table.** Cheapest, but it can't
  show unused templates or shadowing — the two signals that motivate
  this.
- **Leave it to the picker (status quo).** Keeps unused templates and
  silent overrides invisible.

## Consequences

- Zero new loader cost: the pool route already runs `discoverTemplates`
  for the dialog; the ledger renders the same data.
- The `shadows` flag rides `DiscoveredTemplate` everywhere the picker
  reads it; the picker ignores it today and may badge it later.
- Discovery still drops unparseable template files silently
  (`parseRoutineTemplate` → null). Surfacing "found but invalid" rows —
  the "why isn't my template in the picker" debugging affordance — needs
  discovery to return diagnostics and is deliberately left for a
  follow-up.
