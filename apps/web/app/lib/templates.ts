import type { RoutineTemplate } from "@steward/schema"

/** Where a discovered routine template was read from — its picker badge
    (ADR-0021/0023). `builtin` = the product repo's `templates/routines/`,
    shipped in the app bundle and available on every board; `repo` = the
    board's own data repo, scoped to that repo's boards. */
export type TemplateSource = "builtin" | "repo"

/** A routine template as the add-routine picker renders it. */
export type DiscoveredTemplate = RoutineTemplate & {
  source: TemplateSource
  /** Repo template hiding a same-named built-in (ADR-0021 shadowing) — the
      picker shows one card either way; the templates ledger names the
      override, since nothing else does. */
  shadows?: boolean
}
