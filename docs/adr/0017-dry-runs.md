# Dry runs: local working tree in, local file out

Testing a skill edit must not require pushing anything — not the skill, not
`routines.yaml`, and above all not a test artifact onto the live widget.
A **dry run** is the same pointer prompt with a dry clause; `run-routine`
changes exactly two behaviors:

- **In**: resolve `routines.yaml` and skills from the **local working
  tree, dirty state included**, instead of a fresh clone. What you're
  editing is what runs.
- **Out**: `publish-widget` **writes the artifact to a local file and opens
  it in the browser** instead of committing to the `artifacts` branch.
  Nothing is pushed; the live widget never sees a test run.

The ergonomic wrapper is a launcher script in the bulletin repo, next to
`routines-sync.ts` (this is the M5 backlog's "`bulletin apply` CLI",
arrived with a real justification):

```
pnpm routine <slug>              # interactive manual run → publishes
pnpm routine <slug> --dry        # dry run → local file, opened in browser
pnpm routine <slug> --repo Form-Factory/bulletin-data-team
```

It stays dumb on purpose: resolve the data-repo checkout (sibling
directory by convention, env/flag override), compose the pointer prompt —
with the dry clause when `--dry` — and exec **interactive** `claude` (not
`-p`) in the data-repo cwd with `--add-dir <bulletin checkout>` (the cwd
alone can't resolve the contract skills, ADR-0014), so interactive skills
can ask their questions and dry runs land in front of your eyes. All real
logic stays in the contract skills; the script is prompt assembly + cwd +
exec. The app's "copy command" button copies the raw `claude "…"`
one-liner — run it from a bulletin checkout, where the contract skills
resolve (ADR-0014); a machine with local routines has one, since
routines:sync enacted them from it.

## Considered options

- **Local file + browser open (chosen)** — fastest loop, clean git
  history, zero cleanup.
- **Publish to a preview path/branch** (`w/<slug>/preview.html`) — renders
  in the real dashboard iframe, but every test run becomes a push: exactly
  the friction this ADR removes. If iframe-faithful preview matters, a dev
  `/preview` route rendering a local file gets it without the push.

## Consequences

- Dry output skips the sandboxed-iframe context; artifacts behaving
  differently under `sandbox="allow-scripts"` (ADR-0002) can still only be
  caught by a real publish or a future `/preview` route.
- The dry clause is part of the dispatcher's contract — a routine skill
  never needs to know it's being dry-run; only `run-routine` and
  `publish-widget` branch on it.
