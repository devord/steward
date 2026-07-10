import { describe, expect, it } from "vitest"

import { parseRoutineSkill, widgetMetaSchema } from "./skill.ts"

describe("widgetMetaSchema", () => {
  it("accepts the full hint shape", () => {
    const result = widgetMetaSchema.safeParse({
      artifact: "One-line description of what the artifact shows",
      sizes: { default: { cols: 2, rows: 1 }, min: { cols: 1, rows: 1 } },
      schedule: "0 8 * * *",
    })
    expect(result.success).toBe(true)
  })

  it("needs only the artifact line — sizes and schedule are hints", () => {
    const result = widgetMetaSchema.safeParse({ artifact: "x" })
    expect(result.success).toBe(true)
  })

  it("rejects a sizes block without a default", () => {
    const result = widgetMetaSchema.safeParse({
      artifact: "x",
      sizes: { min: { cols: 1, rows: 1 } },
    })
    expect(result.success).toBe(false)
  })
})

const SKILL_MD = `---
name: daily-plan
description: Produce today's working plan as a bulletin widget artifact.
widget:
  artifact: "Today's plan: top 3 priorities, time blocks, and carry-overs"
  sizes:
    default: { cols: 2, rows: 2 }
  schedule: "0 8 * * *"
---

# Daily plan
`

describe("parseRoutineSkill", () => {
  it("reads a widget-capable skill's frontmatter", () => {
    const skill = parseRoutineSkill("daily-plan", SKILL_MD)
    expect(skill).toMatchObject({
      id: "daily-plan",
      name: "daily-plan",
      widget: { schedule: "0 8 * * *" },
    })
  })

  it("returns null for a skill without a widget block", () => {
    const md = "---\nname: x\ndescription: not routine-capable\n---\nbody"
    expect(parseRoutineSkill("x", md)).toBeNull()
  })

  it("returns null instead of throwing on broken frontmatter", () => {
    expect(parseRoutineSkill("x", "---\n{{nope\n---\n")).toBeNull()
    expect(parseRoutineSkill("x", "no frontmatter at all")).toBeNull()
  })

  it("rejects a non-kebab-case skill directory name", () => {
    const md = `---\ndescription: d\nwidget:\n  artifact: a\n---\n`
    expect(parseRoutineSkill("Daily Plan", md)).toBeNull()
  })
})
