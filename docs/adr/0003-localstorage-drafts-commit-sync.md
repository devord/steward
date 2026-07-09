# Config edits: localStorage drafts, persisted by commit or PR

The UI must let users edit routines and dashboard layout freely without a
write per keystroke, and the source of truth is YAML in their data repo
(ADR-0001). We chose: all edits mutate a **draft in localStorage** (keyed by
data repo, carrying the base blob SHAs it was loaded against); a persistent
"unsynced changes" indicator opens a **Sync panel** with a rendered YAML diff
and the persist actions.

## Persist actions

- **Commit (default)** — direct commit to the data repo's `main` via the
  API; it's the user's own repo, review-by-default would be ceremony.
- **Open PR** — an opt-in toggle: create `dash/config-<timestamp>`, commit,
  open a PR. For users who want review or run branch protection.
- **Download files / copy patch** — the "apply locally, then PR myself"
  escape hatch. A real `bulletin apply` CLI is deliberately deferred until
  the download proves annoying.

## Consequences

- **Conflict detection** is SHA-based: if the remote blob SHA moved since the
  draft's base, warn and offer to re-apply the draft onto the fresh base.
  Single-user data repos make real conflicts rare.
- Drafts don't sync across devices — accepted; the canonical state is always
  one commit away.
- No server-side write path exists besides the GitHub API; the app stays
  stateless (session cookie only).
