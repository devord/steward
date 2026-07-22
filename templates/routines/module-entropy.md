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

Author a rot ledger as a widget artifact. You are invoked by the
`run-routine` dispatcher with the routine's `params:` and `instructions:`
from `data/routines.yaml`. The repository is `params.repos` (the first
entry if several); treat `instructions:` as standing guidance — which
areas matter, what to ignore, which decay is known and accepted.

The reader is someone who changes this code. They want to know **where it
is getting harder to work**, and they want the answer to be a place, not a
mood. _Software entropy_ (Hunt & Thomas) is the premise: a codebase
degrades unless something pushes back. This widget is the push-back's
instrument panel.

This is **not a linter**. A linter reports violations of rules someone
already wrote down; the interesting rot is the part no rule covers —
modules that grew shallow, coupling nobody declared, knowledge that
narrowed to one head. Anything the repo's own lint config already enforces
is green by construction and belongs nowhere in this artifact.

Use the `/codebase-design` vocabulary exactly — **module, interface,
implementation, depth, deep, shallow, seam, adapter, leverage,
locality**. Never substitute "component", "service", "layer", "API", or
"boundary". Ousterhout's definition governs what "complex" means here:
code that is **hard to understand and modify**, never merely long.

## Everything is git and grep

Every number comes from the checkout and its history. **Install nothing** —
no `npm ci`, no `pnpm install`, no running the repo's own tooling. A
scheduled run that spends ten minutes on a lockfile is a run that never
publishes, and a signal that depends on a working install disappears the
first time the lockfile drifts.

This also fixes the reproducibility problem. Run N and run N+1 must
compute the same number the same way or the trend is noise, not entropy —
so every signal below is a stated command, not a judgement.

Two layers:

- **Universal core** — churn, co-change, file counts and sizes, test-seam
  presence, bus factor. Needs only `git`. Always runs, on any language.
- **TS/JS layer** — fan-in, fan-out, export counts, the matrix's import
  overlay. Needs `package.json` at the repo root or in a workspace. When
  absent, these signals are **unavailable**, not zero: they drop out of
  the score (see normalization) and the provenance line says so.

**`hidden coupling` belongs to the TS/JS layer, not the core.** It is
defined by the _absence_ of an import edge, and with no import overlay
"no import" and "imports were never measured" are the same observation.
Scoring it anyway would fire the penalty on every co-changing pair in
every non-JS repo — the loudest possible signal produced by having
measured nothing. Without the overlay it is **unavailable** and
normalizes out, exactly like `wide interface`. The matrix still renders:
co-change shading is core, and it simply carries no markers.

Resolve `params.window` (default **90**) days and `params.history`
(default **8**) weekly points once, up front.

## 1 · Resolve the roots

If `params.roots` is set, use it verbatim and skip the rule.

Otherwise infer, in this order:

1. **Workspaces** — `packages:` in `pnpm-workspace.yaml`, else
   `workspaces` in the root `package.json`. No workspaces → the repo root
   is the only workspace.
2. **Source dir** — within each workspace, `app/` if present, else `src/`,
   else the workspace root.
3. **Roots** — each source dir's depth-1 children holding **≥3** source
   files, plus the source dir itself when it holds ≥3 loose source files.

Print the resolved roots in the provenance line, always. A reader who
disagrees with the rot ranking usually disagrees with the roots first, and
they can only fix what they can see (`params.roots` is the fix).

## 2 · Enumerate modules

A **module** here is scale-agnostic, per `/codebase-design`: whatever has
an interface and an implementation. Two shapes, chosen per root by what
the root actually contains:

**Nested root** (its children are directories) → each child directory is a
module. Its name is the directory's own, which in a well-named repo is
already the domain word (`cart`, `product`, `checkout`).

**Flat root** (source files sit directly in it) → cluster by filename:

1. Normalize each filename: strip `.test.`, `.spec.`, `.stories.`,
   `.ui.test.`, `.browser.test.`, `.figma.`, `.generated.` and the
   extension.
2. Key = the name minus its last hyphen-segment; a single-segment name is
   its own key (`add-to-cart-button` → `add-to-cart`, `accordion` →
   `accordion`).
3. Collapse prefixes: merge each key into the **shortest** existing key
   that is a proper hyphen-prefix of it (`filter-chip` → `filter`).
4. A key with **<2 files** is not a module — fold it into one `other` row
   per root, which carries its own aggregate score.

The `other` row exists so the census stays complete without a hundred
one-file rows. Never silently drop a file: every source file in every root
lands in exactly one module or in `other`.

A module's **stable id is `<root>#<key>`**, and it is what the trend is
keyed on. Never key on a display name.

## 3 · Measure

**Resolve the window to two absolute timestamps first**, and pass those to
every command:

```bash
until=$(git log -1 --format=%cI "$ref")           # the point being scored
since=$(date -u -d "$until - $window days" +%FT%TZ)   # BSD: date -u -v-"$window"d
```

Never write `--since="$window days ago"`. A relative date is resolved
against the wall clock at run time, so a historical point (step 5) would
silently reuse _today's_ trailing window and every point in the trend
would measure the same weeks. `$ref` is `HEAD` for the current score and
the boundary sha for a historical one; everything below is then identical
at every point.

Per module, over the window:

```bash
# churn — commits touching the module
git log --since="$since" --until="$until" --oneline -- $paths | wc -l

# authors, and the top author's share (bus factor)
git log --since="$since" --until="$until" --format='%an' -- $paths \
  | sort | uniq -c | sort -rn

# size — source files, and the largest
git ls-tree -r --name-only "$ref" -- $paths | grep -vE '\.(test|spec|stories)\.' | wc -l

# test seam — how many of the module's files are tests/stories
git ls-tree -r --name-only "$ref" -- $paths | grep -cE '\.(test|spec|stories)\.'
```

TS/JS layer only. Both fan measurements need the **module** on each side,
so keep filenames (never `grep -h`) and map every path back to its module
id before counting:

```bash
# interface width — exported symbols per source file
git grep -cE '^export ' "$ref" -- $paths

# fan-out — distinct OTHER modules this module imports.
# Keep the filename, resolve each import target to a path, map that path
# to its module id, drop self-references, count distinct.
git grep -hoE "from ['\"][^'\"]+['\"]" "$ref" -- $paths \
  | sed -E "s/.*from ['\"]//; s/['\"]$//"

# fan-in — files outside the module that import it. Substitute the
# module's own path AND its alias form; a repo with an alias (~/, @/,
# a workspace package name) writes most imports that way, so matching
# only the relative path undercounts to near zero.
git grep -lE "from ['\"][^'\"]*(${module_path}|${module_alias})" "$ref" -- $src_globs \
  | grep -v "^${module_path}/"
```

Resolve each import target the way the repo does: strip the extension,
follow the alias prefix to its real directory (`~/` → `app/`, a workspace
name → that package's source dir), then find which module's paths contain
it. A target that resolves outside every root (`node_modules`, a bare
package name) is **external** and counts toward neither fan-in nor
fan-out — those measure coupling inside the codebase, and every module
importing `react` is not a finding.

**Co-change** drives the matrix. For every commit in the window, list the
modules its files touch (`git log --format='%H' --since=...` then
`git show --name-only --format= <sha>`), and count how often each **pair**
appears in the same commit. The pair's strength is
`shared / min(commits_a, commits_b)` as a percent — normalizing by the
quieter module, so a busy module doesn't read as coupled to everything.

Ignore any commit touching **more than 15 files** — exactly 15, not a
judgement about size. A repo-wide rename or a formatting sweep couples
everything to everything and is not evidence of anything, and a threshold
stated as "about fifteen" is one the next run can resolve differently,
which is the reproducibility rule broken in the one place it matters
most. State the ignored count in provenance.

## 4 · Score

Additive **named** penalties, so the number always has a stated cause and
a row can show its own arithmetic. Defaults (override via
`params.weights`; they must sum to 100):

| penalty              | max | fires on                                                     |
| -------------------- | --- | ------------------------------------------------------------ |
| `hidden coupling`    | 25  | 8 per pair that co-changes ≥40% with **no** import between   |
| `no test seam`       | 20  | scaled by `1 − tested share` of the module's source files    |
| `wide interface`     | 15  | exports-per-file above the repo median, scaled to 2× median  |
| `churn`              | 15  | the module's churn percentile within the repo                |
| `stated-rule breach` | 15  | 8 per distinct rule in `params.rules` breached               |
| `single author`      | 10  | 10 at one author in the window, 5 at two, 0 at three or more |

**Every penalty is clamped to its own max**: `min(raw, max)`, always. The
two per-item penalties overrun trivially — four hidden couplings raise 32
against a max of 25, three breached rules raise 24 against 15 — and an
unclamped penalty pushes the normalized score past 100, which makes the
bar meaningless and the trend discontinuous at exactly the modules the
widget most wants to be believed about. Clamp, then show the clamp in the
arithmetic (`hidden coupling ×4 +25 (capped)`), because a reader who sees
`+25` for four pairs and `+25` for eight deserves to know why they match.

**Normalize to percent-of-available-max.** A signal that could not be
computed is excluded from _both_ the numerator and the denominator:
`score = 100 × Σ clamped penalties / Σ max of available penalties`. The
exclusions:

- no `package.json` → `wide interface` **and** `hidden coupling` are
  unavailable (both need the import overlay; see above)
- no `params.rules` → `stated-rule breach` is unavailable
- a shallow clone → `churn`, `hidden coupling` and `single author` are
  unavailable, since none of them survive without history

A repo must never score higher merely for being unmeasurable, nor lower.
State which signals were available in provenance, always — a score of 62
built from three signals and one built from six are different claims.

`wide interface` is a **proxy and says so**. `/codebase-design` explicitly
rejects depth-as-ratio-of-lines, because it rewards padding the
implementation. Exports-per-file is not depth either — it is interface
_width_, which is the part of depth a grep can see. Never call a
high-scoring module "shallow" on this signal alone; that word is earned in
step 6, by reading the code.

## 5 · The trend

Recompute from git — **never** from a stored file and never from the
previous artifact. Take the last commit on or before each of
`params.history` weekly boundaries, and recompute the score at that sha
(`git grep`, `git ls-tree` and a date-bounded `git log` all accept a sha,
so no checkout is needed).

**Each point carries its own window.** Set `$ref` to that point's sha and
re-derive `$until`/`$since` from _its_ commit date, exactly as step 3
specifies. A point scored with the current window is not a past score —
it is today's churn attached to an old tree, which is the one failure
that would make the sparkline look plausible while being wrong.

This has three properties worth the extra cost: run 1 ships with a full
trend, a skipped week leaves no hole, and changing the weights re-bases
the entire history instead of comparing two different formulas.

Cost control: recompute all `history` points only for the **judged**
modules (step 6). Every other row gets two points — now and the oldest
boundary — which is enough for a direction arrow. Say which in provenance.

## 6 · Judge the hot ones

Scoring is cheap; reading code is not. Per `/improve-codebase-architecture`'s
YAGNI rule, spend the judgement budget where change is actually landing:
the **top 5 by score × churn**. Everything else keeps its row, its bar and
its arrow, and gets no prose — a module that goes quiet must stay visible
as `steady` rather than vanish, or you can never tell "we fixed it" from
"we stopped looking".

For each judged module, read enough of it to say one true thing, and apply
the **deletion test**: if this module vanished, would complexity vanish
with it (a pass-through) or reappear across N callers (it was earning its
keep)? A "concentrates" answer is not a finding; a "vanishes" answer is.

Then **name the move in one clause** and stop:

> `cart` — 9 files re-export a 10-line hook. Deleting them concentrates
> nothing. → collapse into one module, test at its interface.

Tag the move's **dependency category** (DEEPENING.md), because it tells
the reader what the refactor costs to test:

- **in-process** — pure computation, no I/O. Merge and test directly.
- **local-substitutable** — a local stand-in exists (PGLite, in-memory fs).
- **ports & adapters** — your own service across a network seam.
- **mock** — a true external you don't control.

**Never design the interface.** Naming the move is the artifact's job;
choosing what the deepened interface looks like needs the back-and-forth
a scheduled run cannot have, and a headless run proposing a concrete
refactor unprompted is exactly the "outrunning your headlights" failure
(Hunt & Thomas). Hand that off through the context block.

## 7 · Stated rules (the design concept)

`params.rules` carries the project's **design concept** in Brooks's sense —
the shared intent collaborators hold, of which the code is one imperfect
expression. Drift between the two is real rot, and it is invisible to
every other signal here.

Two disciplines keep it honest:

- **Extraction is not this run's job.** Rules arrive already written, as
  greppable statements, from a human or an interactive session that read
  `CLAUDE.md`, the ADRs and the lint config. This run only **checks** them,
  by grep, so the score stays deterministic.
- **Only rules the linter cannot enforce.** A rule already guarded by
  oxlint/eslint returns zero violations forever and adds a penalty line
  that never fires. Before pinning a rule, check the repo's lint config;
  if it's in there, drop it.

No rules configured → the signal is unavailable, normalized out, and named
in provenance. Never invent rules at run time.

## 8 · Compose

**Bottom line first.** One sentence, and it names a **place**: "Cart is
where the entropy is — 34 commits across 9 files with no test seam, and it
co-changes with checkout without importing it." Not "several modules show
signs of decay." Draft the ledger, read your last paragraph, move it to
the top, delete what it made redundant.

**Bad news leads.** A module that crossed into the top band this week is
the bottom line even if everything else improved.

**Never overstate the score.** It is a proxy built from six greppable
signals, and the artifact says so once, in the provenance line. A reader
who thinks it is a measurement of quality will be wrong in a way that
costs them; a reader who thinks it is a ranked attention list is right.

This artifact is **viewer-neutral** (ADR-0039): it is about the code, not
the reader. No "you", no "yours", no render-time enhancer.

**No faces, and no names in the render.** Rot accretes across everyone who
ever touched a module; a face beside a score reads as blame and asserts a
causal story the evidence doesn't support. Bus factor rides as a **number**
— `1 author · 34 commits` — because knowledge concentrated in one head is
a structural risk, not a personal one. Names appear only in the context
block, where the reader is already on their way into a session.

## Author the artifact

Follow the `widget-artifact` skill for the HTML contract and compose from
its design language — headings, sections, ledger rows with lead + detail,
magnitude bars, sparklines, the **coupling matrix** (design.md · Coupling
matrix), pills, the provenance line. The `<h1>` carries the subject and
window (`corza · 90d`, mono).

Each ledger row is: the module name as the lead; the bar, score, and
direction arrow as its trailing cell; the signal breakdown as detail
(`34 commits · 1 author · 28% tested · in 61 / out 12`). Judged rows add
their sentence and the move. Score arithmetic — the named penalty lines —
belongs on the raw/full page and in the context block, never on a tile.

Size behavior:

- **1×1**: the stat tier. The **worst module's score** in mono, labelled
  with its name and direction (`84 ↗`, label `cart · worsening`), and the
  bottom line clamped to two lines beneath. A bare index would say the
  house is on fire without naming the room.
- **2×1 / 1×2**: the bottom line in full, then the top two rows with bars
  and scores. No matrix — a field needs at least 4 rows to read as one.
- **2×2**: the bottom line, then the ledger's top rows.
- **Wide tile (3–4 cols)**: ledger and matrix side by side, the ledger
  taking the flexible track. Cap the matrix at **exactly the top 8
  modules** by score, ties broken by churn, then by module id
  ascending — a deterministic order, so two runs over the same tree pick
  the same eight. **State the count held back**, computed from the
  uncapped census (`+12 in full view`, never a recount of what happened
  to render). Both columns carry `data-fit-list` — a column with no
  trimmable list is a floor the fit pass cannot get under, and it will
  trim the other to nothing while the tile still overflows.
- **Full view / raw page**: a page. The bottom line as a lede, the full
  matrix (every module), the complete ledger with each judged row's
  penalty arithmetic, then the provenance line: repo and window, resolved
  roots, module and file counts, which signal layers were available,
  weights version, history points, commits ignored as sweeps, and the
  proxy caveat.

Mark the worst row and any row carrying a hidden coupling `data-fit-keep`,
so a short tile can never trim its way into reporting only healthy
modules.

Degrade gracefully: a repo with no history in the window gets a bottom
line saying exactly that. A shallow clone (`git rev-parse --is-shallow-repository`)
loses the trend and the co-change matrix — render the ledger, drop the
sparklines, and say so in provenance rather than showing a flat line that
looks like stability. No repo configured → an empty state telling the user
to set the routine's repository.

## The context block

Carry the full evidence (`widget-artifact` § The context block), richer
than the render: every module with its penalty arithmetic; the complete
co-change table with each pair's percentage and whether an import exists;
every hidden coupling as **file pairs with commit counts**, so the claim
can be checked; the rules checked and which breached; bus factor **by
name**, with each module's top author and their share; the resolved roots,
weights, history points and window; and everything the tile capped.

Close with `## Ask me about` — whether a judged module really fails the
deletion test or the count is wrong, whether a hot pair is real coupling
or just shared release cadence, and what weight a signal deserves.

Then a `## Handoff` section naming the top module as a ready-to-run brief
for `/improve-codebase-architecture`: its id, its dependency category, its
evidence, and the move this run named. The weekly diagnosis and the
interactive design session are two halves of one loop; this is the seam
between them.
