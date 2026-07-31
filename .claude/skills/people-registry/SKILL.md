---
name: people-registry
description: >-
  Resolve GitHub logins or Jira account ids to a display name and an inlinable
  48px face, from a committed roster file (ADR-0044/0045). Use when a routine
  template composes it, or when rows need real names and faces instead of
  handles and monograms.
---

# people-registry

A face on a row is bytes in the file, never a URL — the sandbox has no network
and the board's own CDN is unreachable from a scheduled run (ADR-0044). So the
face comes from a **committed map**, which is a file read from a repo the run
already mounts.

No arithmetic here, so no script. Read the map, join, report what missed.

## 1. Read the map

The caller names it as `owner/repo:path` — typically
`Form-Factory/people:data/avatars-48.json`. Read the file from the checkout if
that repo is mounted, otherwise via the contents API.

```json
{
  "danielmoraes": {
    "name": "Daniel Moraes",
    "src": "data:image/webp;base64,…",
    "jira": "557058:abc-…"
  }
}
```

The map is keyed by **GitHub login**, with `jira` riding along as a field, so
one file serves both identity spaces.

_Done when_ the map is parsed, or you have recorded that it was unreachable —
in which case every name falls back below and no face resolves.

## 2. Join

- **A commit-shaped subject** (PR author, committer) joins on the **login**.
- **A ticket-shaped subject** (assignee, reporter) joins on
  `assignee.accountId` against the entry's `jira` field.

**Never join on the display name.** Jira and the roster disagree about a third
of a typical team — `Mark Cosca` is `Mark Dylan`, `Renan Lemos` is
`Renan Paixão` — and the failure is silent: a missed person renders as a
monogram, which is exactly what someone with no photo renders as. It looks
like it worked (ADR-0045).

## 3. Fall back, in order

For a subject the map does not carry:

1. `gh api users/<login> --jq .name` for a name only, when `gh` is reachable.
2. **The login itself.**

The name is never empty and never omitted — it is what the monogram takes its
initial from and what hover and a screen reader read, so a face with no name
is a row identifying nobody.

**Do not fetch an avatar image.** Every path — `avatar_url`, the `.png`
redirect — ends at `avatars.githubusercontent.com`, which a scheduled run
cannot reach. A URL in `src` is dropped by the kit anyway, so a fetch spends
bytes on a row that renders a monogram regardless. A monogram is the honest
fallback; a request that cannot succeed is not.

## 4. Hand back the reading

```
## people-registry — 9 of 12 resolved

Faces: 9 · names only: 2 · login only: 1
Unresolved: @ci-bot (no entry), @newhire (no entry, no gh)
Map: Form-Factory/people:data/avatars-48.json

Full map: $RUN_DIR/people-registry/people.json
```

Write the joined result to `$RUN_DIR/people-registry/people.json` — subject key
to `{ name, src, source }`, where `source` is `registry` | `github` | `login`.
The count of unresolved subjects belongs in the reading: a caller's provenance
line should be able to say how many faces are real.
