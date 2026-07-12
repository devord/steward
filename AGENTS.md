# Steward

Dashboard of living widgets: each widget renders an HTML artifact kept fresh
by a scheduled Claude Code routine. Monorepo — web app in `apps/`, shared
packages in `packages/`, agent skills in `.claude/skills/`.

pnpm workspaces + Turborepo; lint/format/test via Vite+ (`vp`):

```bash
pnpm install && pnpm exec lefthook install  # once; ignoreScripts blocks hook auto-setup
pnpm check                                  # oxlint + oxfmt + typecheck; --fix instead of hand-formatting
pnpm test / build / typecheck / dev
```

Read when relevant:

- `CONTEXT.md` — domain glossary; use its terms exactly.
- `docs/adr/` — architecture decisions; change via a new ADR, not silently.
- `docs/widget-standard.md` — the artifact contract, for authoring or
  rendering widgets.
- `docs/roadmap.md` — milestone status.
- Skills: only the contract skills live here (`run-routine`,
  `widget-artifact`, `publish-widget`). Content is **routine templates** —
  `templates/routines/<id>.md` here (built-in) or in a data repo
  (team/private), discovered via their `widget:` frontmatter
  (ADR-0015/0021). `.claude/skills/react-router` is vendored — don't edit.

## Plan Mode

- Plans extremely concise; sacrifice grammar for concision.
- End each plan with unresolved questions to answer, if any.
