---
"@devord/steward": minor
---

`sync --apply` resolves connector names deterministically against the
account roster (ADR-0046) and verifies convergence in code: the headless
run must end with a machine-readable `steward-sync-result` block, and the
command exits 0 only when cloud state matches the plan. Unresolved or
ambiguous connector names, orphans pending web-UI deletion, and a missing
result block all exit 1 — syncs that silently dropped a connector used to
exit 0. Connector names are canonical sanitized roster names
(`Google-Calendar`, `Atlassian-Rovo`); legacy underscore spellings still
resolve and are reported as drifted.
