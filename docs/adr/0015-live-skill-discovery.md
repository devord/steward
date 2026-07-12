# Live skill discovery replaces the generated catalog

Supersedes ADR-0006.

> Amended by ADR-0021: the discovered things are now **routine templates**
> at `templates/routines/<id>.md` (data repos live via the API, built-ins
> from the app bundle); the plugins-repo source is retired. The `widget:`
> frontmatter contract and the live-read approach below still stand.

The generated catalog assumed one source repo. After ADR-0014 skills span
three — one of them a private data repo a central catalog can't see even in
principle — and after ADR-0013 the picker it powers is an optional
accelerator, not the primary path. The machinery (generator script, CI
freshness check, committed build output, now cross-repo merging) no longer
pays for itself.

Instead the add-routine picker **reads `SKILL.md` frontmatter live** via
the contents API: one directory listing of `.claude/skills/` in the plugins
repo and one in the signed-in user's data repo (team repo on team
dashboards), a handful of frontmatter fetches, ETag-cached. Nothing is
generated, nothing goes stale, nothing needs CI.

What survives from ADR-0006: the **`widget:` frontmatter block as the
opt-in filter** — the plugins repo is full of non-routine skills, and only
skills with a `widget:` block appear in the picker. Its metadata (artifact
description, sizes, suggested schedule) remains picker hints, validated by
`packages/schema`, now read live; missing details fall back to wizard
defaults.

## Consequences

- Delete `scripts/gen-catalog.ts`, `catalog/skills.json`, the CI freshness
  check, and the "Catalog" glossary entry. The `pnpm gen:catalog` step
  disappears from the skill-editing workflow.
- Discovery inherits the viewer's permissions for free: your private skills
  appear only to you because only your token can list your data repo.
- Picker sources are ordered and badged: private (data repo) → team
  (plugins). A few extra API calls per wizard open, amortized by ETags —
  within the rate-limit watch item of the roadmap.
- Skills in _uninstalled_ plugins are invisible to the picker; installing
  the plugin is how a teammate opts into the team's routine skills.
