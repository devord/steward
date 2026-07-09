# Routine execution: stable pointer prompt, everything else versioned

Claude Code routines are **cloud resources** on a user's account (prompt,
repos, environment, triggers), created via the web UI or `/schedule`. There
is no repo-based declarative routine format today, and editing a routine
edits cloud state — invisible to version control. We minimize what lives in
the cloud to pure metadata:

- The cloud routine's **prompt is a stable one-liner**, created once and
  never edited: _"Run the bulletin routine `<slug>` — follow the
  `run-routine` skill."_
- The **`run-routine` skill** (shared repo) is the dispatcher: resolve
  `<slug>` in the data repo's `data/routines.yaml`, execute that routine's
  `skill` with its `instructions`, author per the widget standard, publish
  via `publish-widget`.
- **Per-routine guidance is data, not prompt**: the optional multiline
  `instructions:` field on the routine in `routines.yaml`. Editing what a
  routine does is a normal config edit — drafted, diffed, committed,
  reviewable — and never touches the cloud resource.
- `pnpm routines:sync` reconciles `routines.yaml` against the account's
  scheduled routines (create / delete / schedule drift). The YAML is the
  source of truth; the cloud copy is a projection.

## Considered options

- **Pointer prompt + dispatcher skill (chosen)** — one cloud edit per
  routine ever (creation); all content versioned; the same prompt runs on
  any host.
- **Prompt file per routine** (`.claude/routines/<slug>.md`, cloud prompt
  says "execute that file") — versioned too, but duplicates what
  `routines.yaml` already declares and adds a second file to keep in sync.
  An `instructionsFile:` field can bring this back for long-form cases.
- **Full prompt in the cloud routine** — every edit is an unversioned cloud
  edit; drift from `routines.yaml` is guaranteed. Rejected.

## Consequences

- **Hosts are interchangeable**: a Claude cloud routine (laptop can be off;
  daily run limits; needs GitHub access to the private data repo from the
  cloud environment), a local schedule, or `@formfactory-dev/runner` on an
  always-on team VM — all fire the identical pointer prompt.
- Missed runs surface as staleness on the widget (footer + badge), not as
  silent failure.
- Renaming a routine's slug is the one edit that _does_ require touching the
  cloud routine — treat slugs as stable identifiers.
