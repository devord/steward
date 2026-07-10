import { parseRoutineSkill } from "@bulletin/schema"

import type { DiscoveredSkill, SkillSource } from "./skills.ts"
import { getFile, listTreePaths } from "./github.server.ts"

/**
 * Live skill discovery (ADR-0015): read SKILL.md frontmatter straight from
 * the source repos — the board's data repo (private/team skills) and the
 * plugins repo (shared skills) — instead of a generated catalog. One tree
 * listing per repo plus a frontmatter fetch per candidate, all ETag-cached
 * by the GitHub client, so repeat wizard opens cost only 304s.
 */

/** `.claude/skills/<id>/SKILL.md` in data repos, `<plugin>/skills/<id>/SKILL.md`
    in the plugins marketplace — one rule: the file sits in `skills/<id>/`. */
const SKILL_MD = /(?:^|\/)skills\/([a-z0-9-]+)\/SKILL\.md$/

export interface SkillSourceRef {
  repo: string
  source: SkillSource
}

async function discoverFrom(
  token: string,
  { repo, source }: SkillSourceRef,
): Promise<DiscoveredSkill[]> {
  const paths = await listTreePaths(token, repo)
  if (!paths) return []
  const candidates = paths.flatMap((path) => {
    const id = SKILL_MD.exec(path)?.[1]
    return id ? [{ id, path }] : []
  })
  const skills = await Promise.all(
    candidates.map(async ({ id, path }) => {
      const file = await getFile(token, repo, path)
      if (!file) return null
      const skill = parseRoutineSkill(id, file.text)
      return skill ? { ...skill, source } : null
    }),
  )
  return skills.filter((skill) => skill != null)
}

/**
 * Routine-capable skills across all sources, ordered private → team
 * (ADR-0015) and deduped by id — the narrower repo shadows the wider one.
 * A source that can't be read degrades to no entries: discovery inherits
 * the viewer's permissions, and a missing plugins repo is not an error.
 */
export async function discoverRoutineSkills(
  token: string,
  sources: SkillSourceRef[],
): Promise<DiscoveredSkill[]> {
  const perSource = await Promise.all(
    sources.map((ref) => discoverFrom(token, ref).catch(() => [])),
  )
  const seen = new Set<string>()
  const skills: DiscoveredSkill[] = []
  for (const found of perSource) {
    for (const skill of found) {
      if (seen.has(skill.id)) continue
      seen.add(skill.id)
      skills.push(skill)
    }
  }
  return skills.sort(
    (a, b) => Number(a.source === "team") - Number(b.source === "team"),
  )
}
