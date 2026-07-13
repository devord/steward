import { describe, expect, it } from "vitest"

import {
  parseDashboardFile,
  parseRepoFile,
  parseRoutinesFile,
  serializeRepoFile,
  serializeRoutinesFile,
} from "./yaml.ts"

const ROUTINES_YAML = `routines:
  - slug: daily-plan
    name: Daily Plan
    template: daily-plan
    schedule: "0 8 * * *"
    instructions: |
      Focus on the steward project.
`

describe("parseRoutinesFile", () => {
  it("parses YAML and applies schema defaults", () => {
    const parsed = parseRoutinesFile(ROUTINES_YAML)
    expect(parsed.routines[0]?.enabled).toBe(true)
    expect(parsed.routines[0]?.instructions).toContain("steward project")
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

describe("parseRepoFile", () => {
  it("parses a display name", () => {
    expect(parseRepoFile("name: Form Factory\n")).toEqual({
      name: "Form Factory",
    })
  })

  it("treats an empty file as an empty config", () => {
    expect(parseRepoFile("")).toEqual({})
  })

  it("rejects a blank name", () => {
    expect(() => parseRepoFile('name: "  "\n')).toThrow()
  })

  it("round-trips through serialize", () => {
    const parsed = parseRepoFile("name: Form Factory\n")
    expect(parseRepoFile(serializeRepoFile(parsed))).toEqual(parsed)
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
