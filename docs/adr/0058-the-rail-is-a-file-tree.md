# The rail is a file tree, and only exceptions carry colour

Amends ADR-0035 (rendering only — the freshness _data_ is untouched),
ADR-0025 (where a repo's routine pool is reached), and ADR-0023's repo
caption. The rail's information architecture — repo group → optional
section → board, ADR-0023/0034 — is unchanged. What changes is how the
three tiers are told apart and what the rows are made of.

Four faults, found by measuring the rendered rail rather than reading its
source.

**The rhythm ladder inverts on touch.** ADR-0048 set the rail's boundaries
at 2 / 8 / 22 / 32px against a 28px row, and made the ladder a law: no
boundary tighter than one inside it, each step ≥1.5× the step it contains.
But `pointer-coarse:min-h-11` inflates only the rows. At 44px a row's own
internal whitespace is 46px text-to-text, which is _wider_ than the 22px
gap that is supposed to separate one section from the next. The widest
boundary became the narrowest, so on a phone the rail reads as an evenly
spaced ladder of unrelated rows with a lot of dead air — the exact failure
ADR-0048 wrote the law to prevent, reintroduced through a variant that
only touched one rung. It also breaks DESIGN.md § Layout's own rule that
only invisible boxes may grow to 44px: a rail row shows a selection fill,
so the 44px wash is a slab.

**Two landmarks share one voice.** A repo caption and a section caption are
both the 11px tracked-caps tier, both `ink-dim`, and — the part that is
actually fatal — **both start their label at the same x**. They differed by
semibold-vs-medium and by the repo's leading `FolderGit2`. A folder glyph
every repo carries is decoration that does not inform (DESIGN.md's own
test), so the discriminator that remained was a weight step at 11px. Two
landmarks in one voice means neither reads as the parent of the other.

**The freshness dot is the idle state wearing a colour.** ADR-0035 put an
always-on dot on every board: green fresh, red stale, faint unknown, accent
active. In practice almost every row is green, so the rail's only colour is
a column of dots saying "nothing is wrong" — while the board itself already
rules the opposite way for the same fact (a fresh tile carries no pill;
semantic colour only when it means something). The dots also thread onto
the group spine, which reads as a beaded string rather than a tree.

**Nine `⋯` glyphs in a 200px column.** Every board row, every section
caption and every repo caption rests with a visible menu trigger. Each is
faint; together they are the busiest column in the rail.

## Decision

**Rows are full-bleed and square; only rows take a fill.** The hover and
selection washes span the rail edge to edge with no radius and no
inter-row gap, and the horizontal inset moves from the nav container onto
the rows. Radius signals elevation (DESIGN.md § Shape) and a nav row does
not float, so the rounded pill floating in an 8px margin was always the
wrong material; square full-bleed rows are the file-tree read the brand
already claims (tmux/lazygit, and Flow's own left nav). It also makes
"what is a row" answerable by pointer: captions never light up, so
sweeping the rail highlights exactly what can be navigated to.

**Three tiers, each differing from its neighbour on at least three axes.**

|               | data repo                 | section           | board                       |
| ------------- | ------------------------- | ----------------- | --------------------------- |
| leading glyph | exposure, roots the spine | —                 | —                           |
| label x       | 32                        | 32                | 32, or 48 inside a section  |
| size / case   | 11px CAPS tracked         | 11px CAPS tracked | 14px, the slug verbatim     |
| weight        | semibold                  | medium            | normal (medium when active) |
| ink           | `foreground`              | `ink-dim`         | `ink`                       |
| air above     | 40px                      | 24px              | 0 — contiguous              |
| takes a fill  | never                     | never             | hover + active, full-bleed  |

The glyph column sits at 21px and every glyph in the rail centres on it — the
brand mark's tie, each repo's exposure mark, the group spine, the create
verbs, the account avatar. Each `⋯` puts its **glyph's optical centre** 24px
in from the rail's right edge (28px on coarse, where every `icon-xs` trigger
floors to `size-8`), which is why the caption's `size-5` button and the rows'
`size-6` carry different trailing insets: the boxes differ, the column is what
must not.

The repo caption goes to **full `foreground` ink**, which is the move
ADR-0049 already made one tier up: what a caption heads is what decides its
prominence, and a repo heads sections which head boards. It stays 11px, so
its cap height still sits under the 14px board names and the boards remain
the bright content.

**The exposure glyph leads the caption.** `Lock` / `Users` / `Globe` takes
the marker column that `FolderGit2` held, so the glyph that roots the group
spine is the one carrying information — is this repo mine, shared, or
public — instead of the one every repo shares. `FolderGit2` remains as the
fallback when visibility is unknown (a 403 on collaborators, a GitHub
flap), because tier 1 must never lose its glyph and collapse into the
section voice. The status/actions split of ADR-0023 is preserved: the glyph
still only reports, and the `⋯` beside it still opens the access popover.

**Freshness is the age, and staleness is a pill.** The leading dot is
retired. A board row carries its age (`14h`) in `ink-dim` when fresh,
nothing when it has never run, and — when overdue — that age inside the
**widget card's own stale pill** (`border-yellow/45 bg-yellow/10`, label in
full ink, `StatusPill` tone `stale`). One vocabulary for one fact across
rail and board, and colour that appears only when something is wrong. The
data half of ADR-0035 is unchanged: same rollup, same schedule-aware
`isStale`, same reads. Never colour alone — the pill is a form difference
against every fresh row's bare age, and the `sr-only` state phrase stays.
"You are here" is carried by the selection fill, full ink and weight, which
is what the fill was always for; it no longer has to outrank freshness for
the marker column, because there is no marker column.

**Routines is a caption control, not a row.** ADR-0025's pool keeps its
place as a repo-level fixed view, but it moves into the repo caption's
trailing cluster as a `ListTodo` glyph beside the `⋯` — `[unsynced?]
[Routines] [⋯]`. It is repo-scoped furniture and the caption is the repo's
own row, so it belongs where the repo's other affordance already is; and it
returns a full row per repo, which on a phone is 40px each. Active, it
takes `bg-primary/10` with an accent glyph — the app's selection vocabulary
at button scale, the same treatment the header's edit toggle uses. The
in-flight run pulse rides the glyph unchanged. The pool's own unsynced
draft, which had ridden the row, becomes a dot leading that cluster.

**The `⋯` rests hidden.** Board rows and section captions hold their menu
trigger at `opacity-0`, revealed on row hover, `focus-visible`, or while
open — the pattern the repo caption's fallback GitHub link already used.
`opacity`, never `display`, so the trigger keeps its tab stop. On coarse
pointers, where there is no hover, it stays visible. **Its slot stays
reserved** rather than swapping in over the age: a trailing column that
trades content for controls flickers down the whole list as the pointer
sweeps it.

**The ladder lives in one place.** The rail's three boundaries plus its row
padding become custom properties on the rail root (`app.css`), with a
single `@media (pointer: coarse)` block scaling all of them 1.25×. A row
lands at 32px fine and 40px coarse — under the 44px platform figure by
design, because the row shows a fill and DESIGN.md caps a filled box at
36px; a full-bleed 40px row spanning a 288px drawer is a target no thumb
misses, and WCAG 2.5.8's floor is 24px. The point of the vars is that a
future variant cannot move one rung and invert the ladder, which is how
this bug arrived.

**And the gaps are stated optically.** A row's padding is hit area, not
visual weight, so a caption declaring an 8px gap above a padded row measures
14px on screen. The rail shipped exactly that: a section caption looked
further from its own boards than from the repo containing them — the same
inversion as the touch bug, two orders of magnitude smaller and on every
viewport. So each declared gap is spent net of the padding it lands on
(`--rail-*-step`), and a row that leads a group or follows a caption gives
its own padding back. A caption following a caption needs no correction and
gets none, which is why this keys on what _follows_ a caption rather than
baking it into the caption's own margin.

## Rejected

**Keeping a quieter freshness dot** (hollow for fresh, filled for stale) —
still a mark on every row for the state that means "nothing to do", and it
still beads the spine. The age is already on the row and says strictly
more than the dot did.

**Colouring the age text instead of pilling it.** 12px semantic colour is
exactly what DESIGN.md forbids: several light palettes have no yellow that
clears AA at that size. The wash carries the tone, the label keeps ink.

**Leaving Routines a row and cutting elsewhere.** It was the spine's
terminal node, which read well on desktop and cost 44px per repo on a
phone for a view opened far less often than a board.

**Swapping the age out for the `⋯` on hover** (Linear's move) — correct in
a wide list, churn in a 200px rail where the pointer crosses six rows on
the way to one.

**A second spine for sectioned boards.** A proper two-level tree guide in
a 200px column is noise; the 16px indent step carries the second level, and
the one spine keeps meaning "these belong to this repo".
