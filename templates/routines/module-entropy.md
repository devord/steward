---
name: module-entropy
description: >-
  Read where a codebase is decaying — module by module — from git history
  and the source tree alone, and author a ledger of rot with a co-change
  matrix. Executed by the run-routine dispatcher (ADR-0021).
widget:
  artifact: "Which modules are rotting, how fast, and the coupling nobody declared"
  sizes:
    default: { cols: 4, rows: 3 }
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
    - key: weights
      label: Penalty weights
      placeholder: test=20, coupling=25, interface=15, churn=15, rules=15, author=10
      hint: Optional. Overrides the defaults; must sum to 100
    - key: history
      label: History points
      placeholder: "8"
      hint: How many weekly points the trend recomputes from git
    - key: window
      label: Co-change window (days)
      placeholder: "90"
      hint: How far back commits are read for churn and co-change
---

# Module entropy

The reader is someone who changes this code. They want to know **where it is
getting harder to work**, and they want the answer to be a place, not a mood.
_Software entropy_ (Hunt & Thomas) is the premise: a codebase degrades unless
something pushes back. This widget is the push-back's instrument panel.

This is **not a linter**. A linter reports violations of rules someone already
wrote down; the interesting rot is the part no rule covers.

## Compose

1. **`/repo-modules`** over the `params.repos` checkout, passing `roots`,
   `exclude`, `rules`, `weights`, `history` and `window` straight through. It
   returns the scored census, the co-change pairs, the availability of each
   signal, and the weekly trend.
2. **`/codebase-design`** for the vocabulary, then **judge the top 5 by score ×
   churn** — scoring is cheap, reading code is not. Per judged module, read
   enough to say one true thing and apply the **deletion test**: if it
   vanished, would complexity vanish with it (a pass-through) or reappear
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

**Bottom line first, and it names a place**: "Cart is where the entropy is — 34
commits across 9 files with no test seam, and it co-changes with checkout
without importing it." Not "several modules show signs of decay." **Bad news
leads**: a module that crossed into the top band this week is the bottom line
even if everything else improved.

- **`stat`** — the worst module's score with its direction (`84 ↗`), `label`
  naming the module and what it is doing (`cart · worsening`).
- **`bottomLine`** — the sentence above, in full. A bare index says the house is
  on fire without naming the room.
- **A `queue` block, "Rot ledger"** — a stated top N by score (12 is a good N),
  `count` saying so (`top 12 of 136 by score`). `title` the module, `detail` its
  signal breakdown, `values` the score as a **`meter`** and the direction as a
  **`spark`**. Judged rows add their move to the detail. **Tone the score only
  above the hot line** — scores cluster in the 50s–80s, so bar length barely
  separates two rows and the accent is what makes "where does the hot list end"
  readable.
- **A `matrix` block, "Co-change"** — capped at exactly the top 8 modules by
  score, ties on churn then id, with the held-back count on `count`. Name the
  pairs worth naming in `marks`: an undeclared coupling is the one genuinely bad
  state here and belongs in words as well as a cell.
- **A `rail: true` `queue` block, "Where else"** — every root as one index row:
  its module and commit counts as `detail`, its worst module's score as a
  `meter`. Keep them to one line; at two, a root costs as much as the ledger row
  it points at.
- **One handoff line**, not one per row — the top module by score × churn, its
  dependency category, and where it goes:

  > → hand `app/lib · cart` to `/improve-codebase-architecture`

  With no churn, rank on score alone and say which ranking ran. With no module
  to name, the line is the empty state's own next action.

- **`provenance`** — everything the reading reported: resolved roots, roots
  dropped and why, module and file counts, signals unavailable, weights,
  history points, sweeps ignored, pairs below the floor — and the proxy caveat.
  A score of 62 built from three signals and one built from six are different
  claims.
- **`empty`** — no repo configured → a state naming the setting. A repo with no
  history in the window is **not** empty; the bottom line says exactly that.

**No faces, and no names in the render.** Rot accretes across everyone who ever
touched a module; a face beside a score reads as blame. Bus factor rides as a
number — `1 author · 34 commits`. Names appear only in the context block.

Viewer-neutral (ADR-0039): this is about the code, not the reader. The score
arithmetic is page-only.

## The context block

Every module with its penalty arithmetic; the full co-change table with each
pair's percentage and whether an import exists; every hidden coupling as file
pairs with commit counts, so the claim can be checked; the rules checked and
which breached; bus factor **by name**; the resolved roots, weights, history
points and window; and everything the tile capped.

Close with `## Ask me about` — whether a judged module really fails the deletion
test, whether a hot pair is real coupling or shared release cadence, and what
weight a signal deserves.

Then a `## Handoff` section naming the top module as a ready-to-run brief for
`/improve-codebase-architecture`: its id, dependency category, evidence, and the
move this run named. The weekly diagnosis and the interactive design session are
two halves of one loop; this is the seam between them.
