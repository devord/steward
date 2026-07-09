# The skills catalog is generated, never hand-maintained

The add-routine wizard needs to know which skills can back a routine, what
their artifact shows, which widget sizes they support, and a sensible default
schedule. That metadata belongs next to the skill it describes, not in a
hand-curated list that drifts.

A skill opts in by adding a `widget:` block to its `SKILL.md` frontmatter:

```yaml
widget:
  artifact: "One-line description of what the artifact shows"
  sizes: { default: { cols: 2, rows: 1 }, min: { cols: 1, rows: 1 } }
  schedule: "0 8 * * *" # suggested default
```

`pnpm gen:catalog` scans `.claude/skills/*/SKILL.md` (and installed plugin
skills) and emits `catalog/skills.json`; the app reads that file from the
shared repo via the contents API. Skills without a `widget:` block are
excluded — not every skill is a routine.

## Consequences

- **CI freshness check**: regenerate and fail if dirty. A stale catalog is a
  build error, not a runtime surprise.
- Hand-editing `catalog/skills.json` is always wrong; it's build output that
  happens to be committed (committed so the app can fetch it without a build
  step).
- The `widget:` frontmatter is validated by `packages/schema` — the same
  schemas the app and generator share.
