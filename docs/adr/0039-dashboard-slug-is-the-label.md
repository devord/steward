# The slug is the dashboard's label; "section" is the one word

Two names identified a board: its slug (the layout filename and URL,
immutable) and an optional `name:` display title the rail showed in the slug's
place, falling back to the slug when absent (ADR-0026). Two names for one
board is one too many — the display name drifts from the slug, the rail sorted
by it so renaming silently reordered the rail (ADR-0026), and the create form
made it a required field before the board could exist. The slug already names
the board everywhere that can't lie; let it name the board in the rail too.

Separately, ADR-0034 deliberately kept the wire field `group:` (and the repo's
`groups:` order list) while every piece of UI copy called it a **section**.
That split was a small, standing tax: the data, the schema, the server types,
and the code said one word; the product said another. Reconcile on the word
the product uses.

**Decisions.**

- **Drop the display name.** `data/dashboards/<slug>.yaml` no longer carries
  `name:`; the schema omits it. The rail labels every board by its slug and
  sorts by slug. The per-board "Edit dashboard" dialog loses its name field —
  it now edits only the section. (`dashboardName` was already dead on the read
  path: nothing rendered it as a heading.)
- **One word: section.** The board field is `section:`, the repo's order list
  is `sections:`, and the code (`sectionBoards`, `SECTION_NAME_MAX`,
  `SidebarBoard.section`, `SidebarRepo.sections`) matches. This supersedes
  ADR-0034's name split; everything else ADR-0034 decided (membership on the
  board, order in the repo, unlabeled lead section, degrade-to-ungrouped)
  stands.
- **Section on create.** The new-dashboard dialog gains an optional (but
  recommended) section input — a free-text field with the repo's existing
  sections offered via a native `datalist`, mirroring the edit dialog. A board
  can be filed on creation instead of created then moved.

**Back-compat.** Existing data repos still hold `group:` / `groups:`. The YAML
parse boundary (`parseDashboardFile`, `parseRepoFile`) renames the legacy key
to its successor when the new key is absent, so old files render unchanged.
Serialization only ever emits the new key, so the first in-app edit rewrites a
file forward. No migration is required; a data repo is migrated the moment its
config is next written, and may also be hand-updated (this is what the built-in
template and Form Factory's own data repos did).

The rename intent on `/dashboards` becomes `edit` (it only sets the section
now, so "rename" was a misnomer), and its commit verb is `move` when the
section changed, `edit` otherwise — git stays legible (principle 3).

Cost: none beyond ADR-0034's existing reads. Rejected: keeping the wire field
`group` and renaming only the code (leaves the same word-split one layer down,
the exact tax this removes); a one-time migration commit across every data repo
(the parse-boundary rename makes it unnecessary and can't reach private repos
we don't control).
