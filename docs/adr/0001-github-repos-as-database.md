# GitHub repos as the database — one shared, one private per user

Bulletin needs to store routine definitions, dashboard layouts, and published
artifacts for multiple users, where artifacts (billing hours, daily plans)
must be private to their owner. We chose **no database**: GitHub repos hold
everything, split into one shared product repo and one private data repo per
user (`bulletin-data-<login>`, generated from a template).

GitHub has **no per-path read permissions** — anyone with read access to a
repo sees every file on every branch — so privacy must come from repo
boundaries. The app reads the catalog and contracts from the shared repo and
config + artifacts from the signed-in user's data repo, all via the contents
API with the user's own token: GitHub itself enforces that your token can't
read my private repo.

## Considered options

- **Two-repo split (chosen)** — privacy by repo boundary; no server-side
  state beyond an encrypted session cookie; config is versioned, diffable,
  reviewable for free.
- **Single shared repo, per-user paths** — simplest, but every collaborator
  sees every user's artifacts and routine definitions. Rejected on privacy.
- **Per-user/per-routine branches in a shared repo** — worst of both: shared
  read permissions _and_ branch sprawl. Rejected.
- **A real database + object store** — solves privacy but adds infra, auth,
  and migrations for a v1 whose write volume is a few YAML edits per day.

## Consequences

- The data repo is resolved by **naming convention** (`<login>/bulletin-data-<login>`),
  so no user→repo mapping needs storing; an override can live in the session
  cookie. A first-run wizard creates it via the generate-from-template API.
- Routine definitions and dashboard layout are private too (they leak what
  you track). Sharing a _specific_ widget externally is a future second
  publish target, not a repo-permission question.
- Collaborators a user explicitly invites to their data repo see everything
  in it — that's user-controlled sharing, not a leak.
- Drafts (see ADR-0003) live in localStorage and don't sync across devices.
