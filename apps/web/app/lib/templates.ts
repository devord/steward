import type { RoutineTemplate } from "@bulletin/schema"

/** Where a discovered routine template was read from — its picker badge
    (ADR-0021). `builtin` = this repo's `templates/routines/`, shipped in
    the app bundle; `private` = the viewer's own data repo; `team` = the
    shared team data repo. */
export type TemplateSource = "builtin" | "private" | "team"

/** A routine template as the add-routine picker renders it. */
export type DiscoveredTemplate = RoutineTemplate & { source: TemplateSource }
