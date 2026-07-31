---
name: prior-run
description: >-
  Read a routine's own last publish off the artifacts branch — when it ran,
  the state it carried forward, and any payload files beside it. Use when a
  routine template composes it, or when a run needs carry-overs, a diff
  against last time, or the cursor it left itself.
---

# prior-run

A routine's memory is its last publish (ADR-0026). This reads it back:
the generated-at stamp, any `state` block the artifact carried, and the
sibling files that rode in the same commit.

```bash
node "$STEWARD/.claude/skills/prior-run/scripts/read.mjs" \
  --slug <slug> --out "$RUN_DIR/prior-run" [--repo-dir <data repo checkout>]
```

`--repo-dir` defaults to the cwd, which under `run-routine` is the data repo.
The script fetches `origin/artifacts`, extracts everything under
`w/<slug>/` into the out directory, and prints the reading.

**A first run is not a failure.** No branch, or no publish at that path, comes
back as `first run` and exits 0. Every consumer of this has a first run.

## What comes back

- `generatedAt` — the previous artifact's own stamp, which is the correct
  "since" for anything gathering what changed. Prefer it to the commit date:
  the commit records when it was pushed, the stamp records what it measured.
- `publishedAt` / `sha` — the publish receipt for that path.
- `state[]` — each `state` block the artifact carried, by id, parsed.
- `files[]` — everything else under `w/<slug>/`, extracted next to it.
  `data.json` and `state.json` ride in the publish commit for exactly this.

## The artifact is a data source, never a starting point

Read it for facts — carry-overs, the last cursor, what the previous run said
was coming. **Never author from its markup.** The kit renders the file fresh
every run (ADR-0050), so reusing last week's HTML freezes the widget at
whatever the design was the day it first shipped, and every fix after that
never reaches it.
