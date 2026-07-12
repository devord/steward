# Routine templates replace content skills

Amends ADR-0014 (placement), ADR-0015 (discovery), and ADR-0018 (repos);
the plugins-repo tier is retired.

The things the picker offered were never skills. `repo-pulse` was only
ever executed by the `run-routine` dispatcher — its own description said
"not meant for interactive invocation" — and the skill mechanism was
serving purely as a distribution channel. That channel is where the
friction lived: the plugin-install/clone fallback in the dispatcher, the
plugins repo required in every cloud routine's `repos:`, plugin↔app merge
ordering, teammates invisible to the picker until they install the
plugin, and `repo-pulse` polluting every interactive session's skill
list.

ADR-0020 removed the reason for the arrangement. ADR-0014 kept content
out of the bulletin repo because content coupled _team-specific_ reports
to the product; with params, the team-specific part (which repos, which
focus) lives in `routines.yaml`, and what remains in the file is a
generic, parameterized report definition — platform, like a default
theme.

## Decision

The definitions become **routine templates**: plain markdown files with
the same frontmatter contract (`name`, `description`, the `widget:` block
of ADR-0015/0020), body = the authoring procedure. A template lives at
**`templates/routines/<id>.md`** in whichever repo can hold it:

- **Built-in** — this repo. Generic, product-quality templates
  (`repo-pulse`, `daily-plan`) that version with the widget standard and
  the contract skills. The web app ships them in its bundle (they're in
  its own repo), so the picker needs no API call, no env var, and no
  access check for them.
- **Team** — the team data repo. Team-specific templates every runner
  can read.
- **Private** — a personal data repo (replacing `.claude/skills/` there).

ADR-0014's readership rule survives — a template lives in the narrowest
repo all its users can read — minus the plugins tier, whose only remaining
occupant was "shared but not generic", an empty set for a single-team
deployment. The `bulletin` plugin in the plugins repo is deleted.

**The YAML field renames with the concept**: `template: repo-pulse`,
with no legacy `skill:` alias — a UI that says "template" over a YAML
that says `skill:` would violate "git is visible, name things plainly",
and the few existing data repos were migrated by hand in the same
change. `skill:` in a routines file is simply unknown (stripped on
parse), leaving a template-less routine that fails the
template-or-instructions refine loudly.

**Resolution moves from Claude Code to the dispatcher** (reversing
ADR-0014's "resolution stays Claude Code's job" for content): given
`template:`, `run-routine` reads `templates/routines/<id>.md` from the
data repo checkout first (private/team), then from the bulletin checkout
(the repo the dispatcher itself lives in — always present: attached as a
cloud source per ADR-0018's base, `--add-dir`'d locally per ADR-0014).
Found: follow the body with the routine's `instructions` and `params`.
Not found: hard-fail loudly, unchanged — no skill-resolution fallback; a
prompt can still _mention_ a real skill by name and resolve it
best-effort, exactly as ADR-0013 always allowed.

## Considered options

- **Plain files in `templates/routines/`, dispatcher-resolved (chosen).**
  One glob rule across all three tiers; no plugin machinery; built-ins
  readable by the app from its own bundle; templates stop registering as
  skills in interactive sessions.
- **Keep them skills, rename only the UI.** The word and the YAML field
  diverge, and every plugin problem above stays.
- **Move them into bulletin as `.claude/skills/`.** Same repo win, but
  they'd register in every session from a bulletin checkout, and the
  UI/mechanism mismatch remains.
- **Name them "routines".** Collides with the scheduled instance — "add a
  routine, pick a routine" is circular; instantiation needs its own word.

## Consequences

- `BULLETIN_PLUGINS_REPO` is removed; discovery reads the board's data
  repo plus the bundled built-ins. Picker badges become
  Built-in / Team / Private; a data-repo template shadows a same-named
  built-in.
- ADR-0018's `repos:` no longer needs the plugins repo; existing routines
  get the extra trimmed on the next `routines:sync --apply`.
- Migrations outside this repo, done atomically with this change: delete
  the `bulletin` plugin from the plugins marketplace; move personal/team
  data-repo skills to `templates/routines/`; rewrite `skill:` →
  `template:` in every routines.yaml by hand. No transition machinery —
  the fleet is small enough to migrate in one sitting.
- "Promote this prompt into a template" (ADR-0013's deferred affordance)
  becomes a file write to the data repo — same shape as every other sync.
