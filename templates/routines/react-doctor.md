---
name: react-doctor
description: >-
  Scan a React repository with the react-doctor skill it carries, open up to
  three pull requests for the fixes it could verify, and report what is still
  live and what is waiting on review. Executed by the run-routine dispatcher
  (ADR-0021).
widget:
  artifact: "What React Doctor found, what it opened a PR for, and what needs a human"
  sizes:
    default: { cols: 2, rows: 2 }
    min: { cols: 1, rows: 1 }
  # Weekly, Monday morning. Findings move when the code moves, and a PR
  # opened on Monday has the week to be reviewed.
  schedule: "0 8 * * 1"
  # Instances slug themselves <first-repo>-doctor (ADR-0040).
  subjectParam: repos
  category: Engineering
  params:
    - key: repos
      label: Repository to scan
      type: repos
      required: true
      hint: >-
        One repo — a pull request lands in one repo. Needs a real checkout,
        not just API access
    - key: deliver
      label: What a run may do
      type: select
      options: ["pull request", "report only"]
      hint: >-
        Empty means pull request. `report only` scans and publishes and never
        writes to the repo
---

# React doctor

React Doctor is a deterministic scanner: curated lint rules, dead-code and
supply-chain checks over a React codebase, returning a 0–100 score and per-rule
diagnostics across security, performance, correctness, accessibility and
architecture.

Findings are cheap. A scanner on a schedule that nobody reads is a scanner
nobody installed, so this routine does the second half too: **it fixes what can
be verified, opens the pull request, and the widget is the review queue.** The
reader owns the repo. On Monday they want to know which rules are still live,
which ones already have a PR with their name on it, and whether last week's
worked.

## The gate

Run only when the checkout carries its own **`react-doctor` skill** —
`.claude/skills/react-doctor/SKILL.md`, put there by
`npx react-doctor@latest install`.

That committed file is the repo's consent and its configuration: it pins the
scanner, names the projects, and points at the repo's own
`.react-doctor/false-positives.md`. Scanning without it means an ungoverned
tool writing branches into a codebase that never asked for one.

No skill → **stop before scanning** and publish the not-installed artifact
below, naming the one command. Installing it is a commit to somebody's repo and
belongs to whoever owns the repo. This is not the dispatcher's
missing-primitive hard fail (`run-routine` § Composing primitives): the absence
**is** the finding, and the run publishes it.

## Compose

1. **`/prior-run`** — the score history this routine carries forward, the PRs
   it already has open, and what it left behind. The one sentence a recurring
   scan can write that a first run cannot is whether the number moved.
2. **The repo's own `react-doctor` skill.** It is committed in the target
   checkout, not in the roster this session loaded, so read
   `.claude/skills/react-doctor/SKILL.md` from the checkout and follow its body
   with the checkout as the working directory — the same way the dispatcher
   resolves a template by path. It owns the scan, the triage against the
   repo's false-positive file, the edit, the verification and the PR, and its
   own body is where the invocation comes from.

   **The guard, first — before the skill is invoked, not after.** That skill
   edits, commits and pushes under its own PR mode, so a run that opens it
   without saying which mode it is in has already written to somebody's repo by
   the time § Ship is read. The dispatcher's dry mode redirects
   `publish-widget` and nothing else; nothing in it reaches a git write to
   another repository. So resolve delivery here. A **dry run**, or
   `params.deliver` at `report only`, is a **held** run: agree the skill's
   report-only delivery — scan and triage, no edit, no branch, no PR. Anything
   else is live and agrees PR mode. State in one line which one you took.

   Ask it for a **whole-repo** scan. Its changed-and-lines scopes exist to gate
   a pull request in CI; this is the recurring read of the whole codebase.

3. Its **JSON is the reading**: `ok`, the per-project score, and each
   project's `diagnostics` with rule, severity, category, file and line. Read
   `projects[].diagnostics` per project, never a flattened array, and take the
   skill's disposition for each finding rather than re-judging it.

`instructions:` say which findings matter and which trees to leave alone; the
repo's React Doctor config decides what is scanned.

## Ship

A **held** run has nothing to ship: the guard was read in § Compose, before the
skill could act, and the artifact reports the fixes that would have gone. What
follows is what a live run does, per fix the skill verified.

**The full `<plugin>/<rule>` key is the identity**, everywhere below and in the
render — React Doctor namespaces every diagnostic, so the plugin is half the
name (`react-doctor/no-derived-state`). A branch, a row or an open-PR check
keyed on the bare rule would skip a rule nobody fixed.

- **One rule, one branch, one PR** — `react-doctor/<plugin>/<rule>`, cut from
  the default branch. The key is what keeps the branch name stable across runs.
- **A rule whose branch already has an open PR is skipped**, matched on that
  key, and its row reads `open`. Force-pushing over a PR rewrites code somebody
  is in the middle of reading.
- **At most three PRs a run**, errors before warnings, most-occurring first.
  What the cap holds back keeps its row and its count, and next Monday opens
  the next one. Four machine-authored PRs a week is a queue nobody reviews,
  which costs more trust than the fixes earn.
- **Ship only what the skill verified.** Its verification step — focused tests,
  the repo's own checks, a clean rescan — is the whole reason a machine's diff
  is safe to merge. A fix it could not verify, because the checks would not run
  in this environment or the rescan still reports the rule, is not a PR: it
  stays a finding, and provenance says verification was unavailable.

git works in a scheduled run; the GitHub API usually does not, so push the
branch with git and open the PR with the `mcp__github__*` tools the run
carries. **The branch is the durable record and the PR is the notification**
(ADR-0026, the same split `slack-post` runs on): when the PR cannot be opened,
the pushed branch is still the work — report its compare URL and count the rule
as left for a human.

_Done when_ every fix the skill verified is either in a pull request or carries
a row saying why it is not — the cap stopped at three, a PR is already open on
it, or the push never became one.

## Present

Write `data.json` per `$STEWARD/.claude/skills/widget-artifact/kit/CONTRACT.md`
and render it with the kit.

- **`verdict`, never `stat`.** This tile has to be able to say `Not installed`,
  which is not a number, and a glance that changes shape between runs teaches
  nobody. First match wins, so bad news leads:

  | word            | level     | fires when                                     |
  | --------------- | --------- | ---------------------------------------------- |
  | `Not installed` | `pending` | no react-doctor skill in the checkout          |
  | `Blocked`       | `bad`     | `ok: false`, or the skill hit a stop condition |
  | `Needs a human` | `bad`     | a live finding has nobody's PR on it           |
  | `Fixes ready`   | `attn`    | every live finding is in a PR awaiting review  |
  | `Clean`         | `good`    | no live findings                               |

  A finding is **live** until it is waived, so those five are exhaustive and
  they never overlap: the waived ones are not findings anybody is being asked
  to act on, and a scan that turns up nothing but waivers is `Clean` with the
  waivers on the ledger and their count on the `caveat`. `Fixes ready` needs a
  PR to be ready — with nothing live and nothing open, `Clean` is the honest
  word.

  `gate` carries **the score and its movement** (`78/100 · was 71`): the tool's
  own headline figure sits beside the word rather than competing with it.
  `clauses` are the reasons that fired, each with its measured value, PR
  numbers as `refs`. `caveat` is what the scan could not cover, in the
  scanner's terms — a score over 9 of 11 projects is a different claim from a
  score over all of them.

- **No `bottomLine`.** The verdict is already the sentence; a second one under
  it says the same thing in prose.

- **One `queue` block, two `groups` — `Errors` then `Warnings`.** Severity is
  the order the scanner's own playbook works in, so it is the grouping, and one
  block keeps both on one set of column widths.

  **A row is a rule, not an occurrence.** Fourteen hits of one rule is one row
  carrying `14`; a row per hit is the JSON in a nicer font.

  **Rows sort the way § Ship picks** — errors before warnings, then
  most-occurring first. Trimming is bottom-up, so that order is also the
  pinning: the rows a tile keeps are the rules next Monday opens.

  - The row's `state` is the **disposition**: `open` (a PR is waiting on it),
    `left` (nobody has it — over the cap, unverifiable, or needs judgement),
    `waived` (the repo's false-positive file claims it). **Only `left` takes a
    tone** — the chip meaning _nobody has this_ is the one that earns colour.
  - `title` is the **full `<plugin>/<rule>` key**, linked to its page at
    `https://www.react.doctor/prompts/rules/<plugin>/<rule>.md`. It is the one
    string that resolves to a doc, a branch and a grep.
  - `detail` is the defect in one clause and where it concentrates — "context
    value rebuilt every render; 9 of 14 hits in `checkout/`".
  - `values`: **`category`** (`security`, `a11y`, `performance`,
    `from: "detail"`, `tone: "warn"` on security only, the one category that
    changes the order a reader works in), **`files`** (`"4 files"`, numeric,
    `from: "page"`), and **`hits`** as a **`meter`** carrying the occurrence
    count. One scale across both groups, so the ledger sorts itself on sight.

  **A merged fix has no row**, because the rule stops firing. That movement
  lives on the verdict's `gate` and in the briefing, which is the only place a
  reader can learn that last week's PR worked.

- **A `rail: true` `queue`, "Pull requests"** — every PR this routine has open
  on the repo, this run's first and chipped `new`. `title` is `#128` plus the
  PR title, linked; `detail` the rule it closes; `values` the diff size and a
  CI column (`icon`: `check` passing · `circle-x` failing · `clock` pending).
  It qualifies the ledger rather than being it, and it is the band the reader
  actually clicks.

- **A `chart` block, "Score"** — a `Line Chart` over the current series in
  `state` below, one point per run, with the `note` naming the selection it is
  plotted under and how many older points fall outside it. Under two points, no
  band.

- **The document's `state`** — a **history**, not a snapshot, because a run
  that carries only the last score can never plot more than two points. One
  entry per run, each with its own `at`, its `score`, and the **`selection`**
  it was measured under: scanner and skill versions, projects, scope,
  categories, and the revision of the repo's false-positive file, since waiving
  a rule moves the score without the code changing. That list is the selection
  everywhere else in this template refers to. Append this run's entry, keep the
  last 26, and drop nothing else.

  **The selection is the comparability key**, and it governs both the chart and
  the `gate`: React Doctor's scores compare across identical selections and
  nothing else, so a selection that differs from the previous entry's starts a
  new series and that run reports no movement. Two scores measured different
  ways make a line that is a shape rather than a claim.

  The open PRs ride here too — each one's `<plugin>/<rule>` key, branch, number
  and status — so the next run skips the rule it already opened, and knows
  which of last week's PRs landed.

- **`provenance`** — the selection, the commit scanned, diagnostics counted,
  PRs opened, and anything the scan or the verification could not reach.
  **`provenanceLink`** → the repo's pull request list filtered to
  `react-doctor/`.

- **`empty`** — two designed states. No skill in the checkout → a `headline`
  naming the repo and the fact, `detail` the one command. No repo configured →
  a state naming the setting. **A clean scan is not empty**: that is the
  `Clean` verdict, and it is the most valuable thing this widget ever prints.

**No faces, viewer-neutral (ADR-0039).** A finding belongs to a rule and a
file, never to whoever wrote the line, and one published file is read by
everyone on the board.

## The context block

Every finding the tile capped, with rule, severity, file and line, so the list
can be worked without a rescan. Each PR with the diff it carries and the checks
that passed. Every diagnostic the skill **rejected** and the evidence behind
it, because a false positive suppressed silently is a rule that gets argued
about again next week. The selection this run measured under. What changed
since last run — rules gone, rules new, the score either way. And everything
this run could not verify.

Close with `## Ask me about` — whether a waived rule should go into the repo's
false-positive file for good, which capped finding to open next, and what a
rule that keeps coming back says about the code that keeps producing it.
