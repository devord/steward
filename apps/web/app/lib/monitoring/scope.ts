import { DEFAULT_DASHBOARD } from "../repos.ts"

/**
 * The Steward nouns an event carries beside the viewer's login (ADR-0059):
 * *where* it happened, in the glossary's own words. Absent keys are omitted
 * rather than sent empty — a tag that is always present but usually blank is
 * worse than a tag that means something whenever it appears.
 */
export interface StewardTags {
  /** `owner/repo` of the data repo in view. */
  data_repo?: string
  /** Board slug. */
  dashboard?: string
  /** Routine slug. */
  routine?: string
}

/**
 * Derive the tags from a pathname, in one place rather than across the
 * seventeen routes that touch auth.
 *
 * Every repo-scoped URL is `/r/:owner/:repo/[:dashboard | routines[/:slug]]`
 * (ADR-0023/0025/0033), so the whole shape is readable off the path — no
 * loader data, no churn at the call sites. `/` is the home repo's default
 * board, but *which* repo that is depends on the session, so the caller
 * passes `homeRepo` in (`scope.server.ts`); with no session it stays absent.
 *
 * Cardinality is small on every axis: a handful of repos, a handful of
 * boards each, a routine roster in the tens.
 */
export function stewardTags(pathname: string, homeRepo?: string): StewardTags {
  const segments = pathname.split("/").filter((segment) => segment.length > 0)

  if (segments[0] === "r" && segments.length >= 3) {
    const tags: StewardTags = { data_repo: `${segments[1]}/${segments[2]}` }
    if (segments[3] === "routines") {
      // `/r/:owner/:repo/routines` is the pool view — a repo, no one routine.
      // `/…/routines/:slug` and `/…/routines/:slug/at/:sha` both name one.
      if (segments[4]) tags.routine = segments[4]
    } else if (segments[3]) {
      tags.dashboard = segments[3]
    }
    return tags
  }

  // `/` renders the home repo's default board. Every other non-repo route —
  // settings, setup, the docs, the resource routes — gets the repo the
  // viewer is anchored to and nothing more, which is still the right answer
  // to "whose Steward broke".
  if (!homeRepo) return {}
  return segments.length === 0
    ? { data_repo: homeRepo, dashboard: DEFAULT_DASHBOARD }
    : { data_repo: homeRepo }
}
