---
name: repo-modules
description: >-
  Census a checkout's modules and score where it is decaying — churn, test
  seam, interface width, undeclared coupling, bus factor — from git and grep
  alone, with a weekly trend recomputed from history. Use when a routine
  template composes it, or when the user asks which parts of a codebase are
  rotting, hardest to change, or coupled without importing each other.
---

# repo-modules

Everything here is `git` and `grep` against a checkout. **Install nothing** —
no `npm ci`, no `pnpm install`, no running the repo's own tooling. A scheduled
run that spends ten minutes on a lockfile is a run that never publishes, and a
signal that needs a working install disappears the first time the lockfile
drifts.

One command; its stdout is the reading.

```bash
node "$STEWARD/.claude/skills/repo-modules/scripts/census.mjs" \
  --repo <checkout> --out "$RUN_DIR/repo-modules" \
  [--window 90] [--history 8] [--roots 'apps/*/app/components,packages/*/src'] \
  [--exclude 'prototypes/*'] [--rules <file>] [--weights 'churn=15,…'] [--ref HEAD]
```

It writes `census.json` and prints the top of the ledger. Needs a **real
checkout** — API access is not enough, and a shallow clone loses the trend.

## What it decides for you

**Roots.** `--roots` verbatim, else inferred: workspaces → each one's `app/`
or `src/` → depth-1 children holding ≥3 source files. Either way the same
filter runs afterwards, dropping docs sites, prototypes, generated trees and
config-only packages, plus anything in `--exclude`. A root nested inside
another owns its own files, and a dropped tree never walks back in as a module
of its parent. Every drop is reported.

**Modules.** A child directory is a module. Loose files cluster by filename,
collapsing hyphen-prefixes, with anything under two files folded into one
`other` row per root — never silently dropped. A **file-based routing** root is
detected and keyed by route family instead, because clustering it by
hyphen-prefix would invent a finding out of a layout the framework requires;
route modules are entry points, so their fan-in is not reported as an absence.

**Measurements**, over `--window` days: churn, authors and the top author's
share, source and test file counts, exports per file, fan-in and fan-out
resolved through the repo's own path aliases, and co-change pairs. A commit
touching more than **15** files is a sweep and is ignored; a pair needs **3**
shared commits to qualify. Both are exact numbers, not judgements — a floor
the next run resolves differently is not a floor.

**The score**, as named penalties, each clamped to its own max:

| penalty              | max | fires on                                                         |
| -------------------- | --- | ---------------------------------------------------------------- |
| `hidden coupling`    | 25  | 8 per pair: ≥40% co-change over ≥3 shared commits, **no** import |
| `no test seam`       | 20  | scaled by `1 − tested share`                                     |
| `wide interface`     | 15  | exports-per-file above the repo median, scaled to 2× median      |
| `churn`              | 15  | the module's churn percentile within the repo                    |
| `stated-rule breach` | 15  | 8 per distinct rule breached                                     |
| `single author`      | 10  | 10 at one author, 5 at two, 0 at three or more                   |

**Normalized to percent-of-available-max.** A signal that could not be
computed leaves both the numerator and the denominator: no `package.json`
drops `wide interface` and `hidden coupling` (both need the import overlay —
without it, "no import" and "never measured" are the same observation); no
rules drops `stated-rule breach`; a shallow clone drops everything needing
history. A repo never scores higher merely for being unmeasurable, nor lower.
The reading names what was unavailable.

**The trend** is recomputed from git at each weekly boundary, never read from
a stored file, and **each point carries its own window** — today's churn
attached to an old tree is the one failure that would look plausible and be
wrong. Run 1 ships with a full trend, a skipped week leaves no hole, and
changing the weights re-bases the whole history.

## Stated rules

`--rules` takes a file, one rule per line, three `::`-separated parts:

```
routes must not import the github client :: from ['"].*lib/github :: apps/web/app/routes
```

The text is what a reader sees, the regex is what fires, the pathspec is
optional. **Only rules a linter cannot enforce** — anything oxlint or eslint
already guards returns zero forever and adds a penalty line that never fires.
Rules arrive already written; this never invents one at run time.

## What it will not tell you

**`wide interface` is a proxy and says so.** Exports-per-file is interface
_width_ — the part of depth a grep can see. Never call a module _shallow_ on
this signal alone; that word is earned by reading the code.

**The score is a ranked attention list, not a measurement of quality.** Six
greppable signals. A reader who takes it for the second will be wrong in a way
that costs them.

**No judgement about what to do.** Which modules deserve reading, whether one
fails the deletion test, what move to make — that is the caller's, with
`/codebase-design` for the vocabulary.
