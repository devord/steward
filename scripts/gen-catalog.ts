/**
 * Generates catalog/skills.json from the `widget:` frontmatter blocks in
 * .claude/skills/<id>/SKILL.md (ADR-0006). Skills without a `widget:` block
 * are not routine-capable and are excluded. Output is deterministic (sorted
 * by id, no timestamp) so CI can fail on staleness with a plain git diff.
 *
 * Run via `pnpm gen:catalog` (node executes TypeScript directly).
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

import { type CatalogSkill, catalogFileSchema } from "@bulletin/schema"
import { parse } from "yaml"
import { z } from "zod"

const root = path.resolve(import.meta.dirname, "..")
const skillsDir = path.join(root, ".claude", "skills")
const outFile = path.join(root, "catalog", "skills.json")

const frontmatterSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().min(1),
  widget: z.unknown().optional(),
})

function readFrontmatter(skillFile: string): unknown {
  const text = readFileSync(skillFile, "utf8")
  const match = text.match(/^---\n([\s\S]*?)\n---(?:\n|$)/)
  if (!match) return null
  return parse(match[1] ?? "")
}

const skills: CatalogSkill[] = []
const errors: string[] = []

for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const skillFile = path.join(skillsDir, entry.name, "SKILL.md")
  let raw: unknown
  try {
    raw = readFrontmatter(skillFile)
  } catch {
    continue // no SKILL.md — not a skill directory
  }
  const frontmatter = frontmatterSchema.safeParse(raw)
  if (!frontmatter.success) {
    errors.push(
      `${entry.name}: invalid frontmatter — ${frontmatter.error.message}`,
    )
    continue
  }
  if (frontmatter.data.widget == null) continue // opted out of the catalog

  const candidate = {
    id: entry.name,
    name: frontmatter.data.name ?? entry.name,
    description: frontmatter.data.description,
    widget: frontmatter.data.widget,
  }
  const validated = catalogFileSchema.shape.skills.element.safeParse(candidate)
  if (!validated.success) {
    errors.push(
      `${entry.name}: invalid widget block — ${validated.error.message}`,
    )
    continue
  }
  skills.push(validated.data)
}

if (errors.length > 0) {
  console.error(
    "gen-catalog failed:\n" + errors.map((e) => `  - ${e}`).join("\n"),
  )
  process.exit(1)
}

skills.sort((a, b) => a.id.localeCompare(b.id))
const catalog = catalogFileSchema.parse({ skills })

mkdirSync(path.dirname(outFile), { recursive: true })
writeFileSync(outFile, JSON.stringify(catalog, null, 2) + "\n")
console.log(`catalog/skills.json: ${skills.length} skill(s)`)
