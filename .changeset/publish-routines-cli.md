---
"@devord/steward": minor
---

Publish the routines CLI as `@devord/steward`, runnable via `npx` — `sync`,
`run`, and `trigger` subcommands. The bundle inlines the schema and ships the
three contract skills, so it runs anywhere, not only inside a monorepo checkout
(ADR-0036). The web app stays private.
