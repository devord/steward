# App chrome components: shadcn/ui on Base UI, styled by the gruvbox tokens

M3 made the app a real product UI — wizard dialog, selects, sync panel,
checkboxes. Hand-rolling accessible primitives (focus traps, listbox
keyboard handling, portal positioning) is not this project's job. We adopted
**shadcn/ui with Base UI primitives** (the default since July 2026),
`class-variance-authority` for variants, and the `cn()`
(clsx + tailwind-merge) utility — components vendored into
`apps/web/app/components/ui/` by the shadcn CLI, owned like the rest of the
code.

ADR-0007's split is unchanged: this is app chrome only; artifacts still
inline raw tokens and can never load a component library.

## Theme integration

shadcn components consume semantic tokens (`--background`, `--primary`,
`--border`, …). Those are defined once in `apps/web/app/app.css` as a
dark-only `:root` block whose every value is a gruvbox palette color from
the `@theme` block (orange = primary, bg1 = card, red = destructive, …).
The rule: **the semantic layer may only alias `@theme` palette values** —
a new color at that layer is a palette change and belongs in `@theme` (and
in the `widget-artifact` snippet, per ADR-0007).

The app renders dark-only: no `.dark` toggling, `color-scheme: dark`, and
the `dark` class statically on `<html>` so component `dark:` variants apply.

## Considered options

- **shadcn + Base UI (chosen)** — vendored source (no runtime lock-in),
  accessible primitives, cva variants; Base UI is shadcn's current default.
- **shadcn + Radix** — legacy default; new projects get Base UI, and
  nothing here needs Radix-only ecosystem pieces (e.g. AI Elements).
- **Keep hand-rolled Tailwind** — fine for M2's read-only page; dialogs and
  selects would mean reimplementing accessibility by hand.
- **A packaged component library (MUI, Mantine…)** — second design
  vocabulary and theme system fighting the token palette.

## Consequences

- New components arrive via `pnpm dlx shadcn@latest add <name>` (config in
  `apps/web/components.json`), then get reviewed and reformatted like any
  other source file.
- Chrome typography moved to Geist Variable (bundled via fontsource — no
  external font requests at runtime). Artifacts keep `system-ui`: they
  cannot load fonts at all, and the palette, not the typeface, is what the
  two sides share.
- `tw-animate-css` and `shadcn/tailwind.css` are imported by `app.css`;
  they style behavior (animations, base resets), not the palette.
