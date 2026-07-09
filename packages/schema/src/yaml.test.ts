import { describe, expect, it } from "vitest"

import {
  parseDashboardFile,
  parseRoutinesFile,
  serializeRoutinesFile,
} from "./yaml.ts"

const ROUTINES_YAML = `routines:
  - slug: daily-plan
    name: Daily Plan
    skill: daily-plan
    schedule: "0 8 * * *"
    instructions: |
      Focus on the bulletin project.
`

describe("parseRoutinesFile", () => {
  it("parses YAML and applies schema defaults", () => {
    const parsed = parseRoutinesFile(ROUTINES_YAML)
    expect(parsed.routines[0]?.enabled).toBe(true)
    expect(parsed.routines[0]?.instructions).toContain("bulletin project")
  })

  it("rejects YAML that parses but fails the schema", () => {
    expect(() => parseRoutinesFile("routines:\n  - slug: Bad Slug\n")).toThrow()
  })
})

describe("serializeRoutinesFile", () => {
  it("round-trips through parse", () => {
    const parsed = parseRoutinesFile(ROUTINES_YAML)
    expect(parseRoutinesFile(serializeRoutinesFile(parsed))).toEqual(parsed)
  })

  it("is stable: serialize(parse(serialize(x))) === serialize(x)", () => {
    const once = serializeRoutinesFile(parseRoutinesFile(ROUTINES_YAML))
    expect(serializeRoutinesFile(parseRoutinesFile(once))).toBe(once)
  })
})

describe("parseDashboardFile", () => {
  it("parses a dashboard file", () => {
    const parsed = parseDashboardFile(
      `grid:
  columns: 4
  rowHeight: 150
widgets:
  - routine: daily-plan
    position: { col: 1, row: 1 }
    size: { cols: 2, rows: 1 }
`,
    )
    expect(parsed.widgets).toHaveLength(1)
  })
})
