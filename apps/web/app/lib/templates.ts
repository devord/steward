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
  /** A canned artifact render for the picker's preview (ADR-0037), when the
      template ships one — a built-in's `docs/samples/<id>.html` archetype or a
      repo template's `templates/routines/<id>.sample.html` sibling. Raw
      artifact HTML; the picker frames it exactly as the board frames a live
      widget. Absent when the template ships no sample. */
  sample?: string
}
