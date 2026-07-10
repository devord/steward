# Skills live in the narrowest repo all their users can read

Routine skills are content; the bulletin repo is the platform. Mixing them
couples every private or team-specific report to the product's history and
visibility. The rule: **a skill lives in the narrowest repo that all its
users can read.**

- **Bulletin (shared product repo)** — _contract skills only_:
  `run-routine`, `widget-artifact`, `publish-widget`. They define the
  platform and version with the app and the widget standard. No content
  skills, ever. The seeds move out: `repo-pulse` → the plugins repo,
  `daily-plan` → the data-repo template (`templates/data-repo/.claude/skills/`),
  where it doubles as the worked example of a private skill.
- **Plugins repo** (`form-factory/plugins`) — shared/team routine skills
  (`repo-pulse`, future `project-reports`). It's already the team's skill
  distribution mechanism; teammates get them by installing the plugin, with
  no bulletin coupling.
- **Data repo** (`bulletin-data-<login>`, and the team repo) — private
  routine skills at `.claude/skills/` (`time-tracking`, a personal
  `daily-plan`). The data repo already holds everything private to its
  owner; skills are more of it. Privacy stays repo-boundary-enforced
  (ADR-0001) — no new mechanism.

**Skill resolution stays Claude Code's job, not the dispatcher's.** The
routine's `skill:` is a plain name; it resolves because the run environment
has bulletin + the data repo checked out and the plugins repo installed.
No `source:` field, no custom loader.

## Considered options

- **Three-tier placement by readership (chosen).**
- **Content skills in bulletin** (status quo) — private skills are
  impossible (bulletin is team-visible) and team skills couple to product
  releases.
- **A coordination repo** (repo-coordination-template) — a fourth repo
  layer buying nothing ADR-0001's boundaries don't already give; the data
  repo _is_ the user's coordination point.

## Consequences

- The generated catalog can't see across three repos (one of them private
  by definition) — superseded by live discovery (ADR-0015).
- **To verify at build time**: the cloud routine environment can install
  the plugins repo. If not, the fallback is explicit: the dispatcher clones
  the plugins repo before invoking the skill.
- A team routine's skill must live in plugins (or the team repo), never in
  a member's personal data repo — other runners couldn't read it there.
- Local runs launch Claude in the _data repo_ (ADR-0017), where the
  contract skills don't exist — verified: a session cwd'd there resolves
  neither `run-routine` nor `publish-widget`. Two closures: the launcher
  and the launchd agents pass `--add-dir <bulletin checkout>` (added dirs
  contribute their project skills), and the plugins repo's `bulletin`
  plugin **mirrors the contract skills** so the app's copy-command
  one-liner works without a bulletin checkout. The bulletin repo stays the
  source of truth — a contract change must ship atomically with the app
  and the widget standard, and dry runs must execute the local tree's
  version — so the mirror is a copy: update here first, then re-mirror
  (drift is a roadmap watch item, not a mechanism).
