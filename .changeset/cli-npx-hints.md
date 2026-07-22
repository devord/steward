---
"@devord/steward": patch
---

Command hints printed by the CLI use the pasteable `npx @devord/steward …`
form (ADR-0036) instead of a bare `steward …` that assumes a global
install, and `--help` now shows the invocation line.
