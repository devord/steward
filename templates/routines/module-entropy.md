---
name: module-entropy
description: >-
  Find the handful of places a codebase will cost you on your next change —
  code you touch often that is hard to touch — and name one move for each.
  Executed by the run-routine dispatcher (ADR-0021).
widget:
  artifact: "The few places you touch often and that fight back, and the move for each"
  sizes:
    default: { cols: 3, rows: 2 }
    min: { cols: 1, rows: 1 }
  # Weekly, Monday morning. Entropy accretes over weeks; a daily rerun
  # republishes a near-identical artifact and trains the reader to stop
  # looking.
  schedule: "0 9 * * 1"
  # Instances slug themselves <first-repo>-entropy (ADR-0040).
  subjectParam: repos
  # Default band (ADR-0044). This is a codebase's own health, read by the
  # people who change it.
  category: Engineering
  params:
    - key: repos
      label: Repository to read
      type: repos
      required: true
      hint: The codebase to measure — needs a real checkout, not just API access
    - key: roots
      label: Module roots
      placeholder: apps/*/app/components, packages/*/src
      hint: >-
        Optional. Globs whose children are modules. Empty means infer them
        (the rule below), which is right for most repos
    - key: exclude
      label: Roots to leave out
      placeholder: prototypes/*, knowledge-base/*, packages/*-config
      hint: >-
        Optional. Globs never censused — docs sites, prototypes, config-only
        packages, generated trees. Inference drops the obvious ones already
    - key: rules
      label: Stated design rules
      placeholder: apps/storefront must not define badge/pill/chip primitives
      hint: >-
        Optional. One greppable rule per line. Only rules the linter CANNOT
        enforce — anything oxlint/eslint already guards scores zero forever
    - key: window
      label: Window (days)
      placeholder: "90"
      hint: How far back commits are read for churn and co-change
    - key: history
      label: History points
      placeholder: "8"
      hint: >-
        How many weekly points are recomputed from git, so a hot module can
        say whether it is heating up
---

# Module entropy

The reader is someone who changes this code. They want to know **where their
next change is going to cost them**, and they want the answer to be a place and
a move — not a mood, and not a grade.

That framing is Fowler's, and it is load-bearing: internal quality is worth
arguing about **only as economics**. Cruft is not untidiness, it is time added
to every future change. So the artifact never claims a module is _bad_. It
claims a module is _expensive_, and it shows the bill.

Two consequences, and they are the whole design:

**Churn decides who is on the list.** This is Feathers' churn-versus-complexity
quadrant and Tornhill's hotspot analysis, and it is the one filter that makes
the rest useful: complicated code you never touch costs nothing. A module with
no commits in the window is **not on the list at any score**. It is not a
finding that a file nobody has opened since 2023 has no tests.

**The problem is named, never blended.** A module that is hot gets one row, and
that row says the single worst _specific_ thing about it — `no test seam`,
`changes with cart, imports nothing`, `one author`. Averaging six greppable
proxies into a number out of 100 produces a figure with no external referent,
no spread (real repos cluster every module in the 50s–70s), and no action: the
reader has to un-blend it before they can do anything, and the arithmetic
throws away exactly the part they needed.

**This is not a linter**, and it is not a coverage report. A linter reports
violations of rules someone already wrote down; the interesting rot is the part
no rule covers.

## Compose

1. **`/repo-modules`** over the `params.repos` checkout, passing `roots`,
   `exclude`, `rules`, `window` and `history` straight through. It returns the
   module census with each signal **separately** — churn, tested share, exports
   per file, hidden-coupling pairs, author counts, rule breaches — plus the
   co-change pairs, the weekly points recomputed from git, and which signals
   were available at all.

   Take the signals. **Ignore its composite `score` for ranking and never print
   it**; it exists as a tie-break and for the context block. Rank on churn.

2. **Cut to the hotspots.** A module is a hotspot when it is at or above the
   repo's **75th percentile of commits** in the window **and** carries at least
   one of these, which is the entire finding vocabulary:

   | problem               | fires on                                           |
   | --------------------- | -------------------------------------------------- |
   | `rule breach`         | a stated rule matched in its files                 |
   | `undeclared coupling` | ≥1 pair it co-changes with and does not import     |
   | `no test seam`        | under half its files are tests                     |
   | `one author`          | a single author owns the window's commits          |
   | `wide interface`      | exports per file ≥2× the repo median — a **proxy** |

   That order is also the severity order, and it is stated so the choice is
   deterministic: a row shows its **worst** problem, and the rest go in the
   detail line. A breach is a contract someone wrote down and broke;
   `wide interface` is a grep's guess at interface width and ranks last.

3. **`/codebase-design`** for the vocabulary, then **judge at most 5** — the
   hotspots, in churn order. Scoring is cheap; reading code is not. Per judged
   module, read enough to say one true thing and apply the **deletion test**:
   if it vanished, would complexity vanish with it (a pass-through) or reappear
   across N callers (it was earning its keep)? "Concentrates" is not a finding;
   "vanishes" is. Then **name the move in one clause** and stop:

   > `cart` — 9 files re-export a 10-line hook. Deleting them concentrates
   > nothing. → collapse into one module, test at its interface.

   Tag the move's dependency category — **in-process**, **local-substitutable**,
   **ports & adapters**, **mock** — because it tells the reader what the
   refactor costs to test.

**Never design the interface.** Naming the move is this artifact's job;
choosing the deepened shape needs back-and-forth a scheduled run cannot have.
Hand that off through the context block.

**A move points inward from a convention, never at it.** Check it against what
the repo already follows — the framework's docs, `CLAUDE.md`, its ADRs,
`instructions:`. Where the convention is the constraint, the module that wants
extracting is the one inside it: the route family is fine, its 200-line loader
is the finding. A move asking a repo to abandon its framework's layout reads as
authoritative and is wrong, and one of those costs more trust than five correct
rows earn.

Use the `/codebase-design` words exactly — module, interface, implementation,
depth, deep, shallow, seam, adapter, leverage, locality. Ousterhout governs
what _complex_ means: hard to understand and modify, never merely long.

## Present

Write `data.json` per `$STEWARD/.claude/skills/widget-artifact/kit/CONTRACT.md`
and render it with the kit.

**The cap is the feature.** Five hotspots and three pairs, and no more, because
a list where everything is urgent is a list where nothing is. The previous
version of this widget shipped twelve ledger rows, fifteen root rows and a
sixty-four-cell matrix, and a reader could not have told you what to do on
Monday. Everything held back is counted on a `count` and detailed in context.

- **`stat`** — **the concentration**, which is the economic claim in one
  figure: commits landing in hotspots as a share of all commits landing in
  censused modules (`62%`), `label` saying what it is a share of
  (`of commits land in hotspots`). This number has an external referent a
  reader can check, it cannot be moved by adding modules, and it goes down for
  exactly one reason: the hot code got easier to change.

  Zero hotspots is `0%` and `good`. That is a real result, not an empty state.

- **`bottomLine`** — the top hotspot, its problem, and its move, in that order
  and in one sentence. This is the artifact's reader: someone accountable for
  code they did not spend the week in, who needs the conclusion before the
  evidence. It belongs here rather than on `stat.note`, which is 12px `ink-dim`
  specified for held-back tallies and is shed early by the fit pass — a verdict
  that trims away is worse than one never written.

- **One `queue` block with two `groups`** — one table, so both share a set of
  column widths and the reader never re-anchors:

  - **"Hot and hard to change"** — the hotspots, churn order, at most 5.
    `state` is the **worst problem's name**, and it is the chip's whole job:
    the reader scans a column of specific nouns instead of twelve repetitions
    of `worsening`. `title` the module. `values` in this order: **`tested`**
    (`"30%"`, `numeric`, `from: "detail"`), **`authors`** (`"8"`, `numeric`,
    `from: "page"`), and **`commits`** as a **`meter`** with a `delta`.
  - **"Changes together, imports nothing"** — at most 3 undeclared pairs,
    `title` as `a ↔ b`, `detail` naming the **actual shared contract** where
    the judging found it (a CSS custom property, a hand-rolled mock, a magic
    string), `values` the shared commits on the same meter scale.

  **A measured fact is a column, never a sentence.** `tested` and `authors`
  are the two numbers a reader compares _down_ the page to decide which
  hotspot to open, and a reader cannot compare what is spelled out mid-clause
  in five different rows. A shipped run wrote `30% tested · 8 authors` into
  the prose of every row and left the table with one scannable column; the
  band stopped being a table and became a list of paragraphs with a bar on
  the end. The columns tier in (`from`) so a narrow tile still gets the chip,
  the module and the meter, and the arithmetic appears as the frame earns it.

  **`detail` is the finding and the move, in that order, and it is one
  sentence.** Not a paragraph, and never a restatement of a column: "one
  909-line file behind a single export — split by domain and test each
  slice." Everything longer — which file, which exports, why the split falls
  where it does — is what `context` is for. It is the same rule the `stat`
  follows: the tile carries the claim, the briefing carries the argument.

  Commits are the meter everywhere, so one scale is honest across both groups.
  **Never meter the score** — scores cluster in fifteen points and every bar
  comes out the same length, which is how the last version managed to draw
  twelve bars that ranked nothing.

- **No per-row direction chip.** Movement rides as a `delta` on the commits
  value where it is real. A `worsening` chip on eight of twelve rows is a
  chip that has stopped carrying information.

- **A `chart` block, "Churn against interface width"** — the hotspot plot the
  ranking is derived from, as a `Scatter Plot`: commits on x, exports-per-file
  on y. Tornhill's quadrant, and the reason the list is ordered the way it is
  — hot and wide is the upper right, and a reader who can see the cloud can
  see whether the top row is an outlier or the first of many. Page tier only,
  and it goes **after** the ledger: the named rows are the finding, the field
  is the evidence for their ordering.

  **Plot one stated population, and state it.** A census runs to hundreds of
  modules and the plot is legible to a few dozen, so the point set is the
  **most-changed modules, at most 40**, ranked by the same churn that orders
  the ledger. Deliberately _not_ the hot line: a quadrant is read by seeing
  where the hot ones sit against the quiet ones, and cutting at the threshold
  removes exactly the cloud that makes the top-right corner mean anything.
  The `note` states the cut and how many modules fall outside it ("the 12
  most-changed modules; 124 quieter ones are not plotted"), and the two
  numbers must agree with the points actually emitted. Never take the first N
  of a census and let the chart imply it drew the whole thing: the held-back
  count is the difference between a sample and a claim.

- **The `matrix` block, "Co-change"** — page tier only, which is the kit's
  default for it. Top 8 **by co-change strength**, not by score: the field
  exists to show a cluster, so it must be populated by the pairs that actually
  cluster. Held-back count on `count`. Every pair it rings is **also stated in
  words** in the group above or in `marks` — a cell is a prompt to look, never
  the only place a finding lives.

- **No rail.** A row per root, metering each root's worst module, is a
  directory listing with a bar on it; it told the reader that `routes` has 21
  modules and nothing they could act on. Root totals live in context.

- **One handoff line** — the top hotspot, its dependency category, where it
  goes:

  > → hand `app/lib · cart` to `/improve-codebase-architecture`

- **`provenance`** — one line, and only what changes how the number should be
  read: window, modules censused, and **any signal that was unavailable**. A
  concentration computed without the import overlay is a different claim from
  one computed with it. Weights, sweep counts, dropped roots and pair floors go
  to context; they are audit trail, not reading.

- **`empty`** — no repo configured → a state naming the setting. A repo with
  commits but no hotspots is **not** empty; that is the `0%` good state above.

**No faces, and no names in the render.** Rot accretes across everyone who ever
touched a module; a face beside a finding reads as blame. Bus factor rides as a
problem name and a number — `one author · 34 commits`. Names appear only in the
context block.

Viewer-neutral (ADR-0039): this is about the code, not the reader.

## The context block

Everything the tile capped, and everything a reader would need to argue with
it: every module that cleared the churn gate with its problems and its
composite score; the churn percentile the gate resolved to, in commits; the
full co-change table with each pair's percentage and whether an import exists;
every undeclared coupling as file pairs with commit counts, so the claim can be
checked; the rules checked and which breached; bus factor **by name**; the
resolved roots with their module and commit totals; and the signals that were
unavailable and what that removes from the concentration figure.

Close with `## Ask me about` — whether a judged module really fails the deletion
test, whether a hot pair is real coupling or shared release cadence, and whether
the churn gate is set where this repo wants it.

Then a `## Handoff` section naming the top hotspot as a ready-to-run brief for
`/improve-codebase-architecture`: its id, dependency category, evidence, and the
move this run named. The weekly diagnosis and the interactive design session are
two halves of one loop; this is the seam between them.
