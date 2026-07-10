import type { RoutineSkill } from "@bulletin/schema"

/** Where a discovered skill was read from — its picker badge (ADR-0015).
    `private` = the viewer's own data repo; `team` = a shared source (the
    team data repo or the plugins repo). */
export type SkillSource = "private" | "team"

/** A routine-capable skill as the add-routine picker renders it. */
export type DiscoveredSkill = RoutineSkill & { source: SkillSource }
