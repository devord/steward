# @devord/steward

## 0.2.0

### Minor Changes

- f1b553a: `sync --apply` resolves connector names deterministically against the
  account roster (ADR-0046) and verifies convergence in code: the headless
  run must end with a machine-readable `steward-sync-result` block, and the
  command exits 0 only when cloud state matches the plan. Unresolved or
  ambiguous connector names, orphans pending web-UI deletion, and a missing
  result block all exit 1 — syncs that silently dropped a connector used to
  exit 0. Connector names are canonical sanitized roster names
  (`Google-Calendar`, `Atlassian-Rovo`); legacy underscore spellings still
  resolve and are reported as drifted.

### Patch Changes

- 4ec811d: Command hints printed by the CLI use the pasteable `npx @devord/steward …`
  form (ADR-0036) instead of a bare `steward …` that assumes a global
  install, and `--help` now shows the invocation line.

## 0.1.0

### Minor Changes

- bbfc460: Publish the routines CLI as `@devord/steward`, runnable via `npx` — `sync`,
  `run`, and `trigger` subcommands. The bundle inlines the schema and ships the
  three contract skills, so it runs anywhere, not only inside a monorepo checkout
  (ADR-0036). The web app stays private.
