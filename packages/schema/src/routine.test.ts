import { describe, expect, it } from "vitest"

import { dashboardFileSchema, dashboardPath } from "./dashboard.ts"
import { routinesFileSchema } from "./routine.ts"

describe("routinesFileSchema", () => {
  it("parses a valid routines file and applies defaults", () => {
    const parsed = routinesFileSchema.parse({
      routines: [
        {
          slug: "daily-plan",
          name: "Daily Plan",
          skill: "daily-plan",
          schedule: "0 8 * * *",
        },
      ],
    })
    expect(parsed.routines[0]?.enabled).toBe(true)
  })

  it("round-trips an optional runner", () => {
    const parsed = routinesFileSchema.parse({
      routines: [
        {
          slug: "repo-pulse",
          name: "Repo Pulse",
          skill: "repo-pulse",
          schedule: "0 */4 * * *",
          runner: "dmoraes",
        },
      ],
    })
    expect(parsed.routines[0]?.runner).toBe("dmoraes")
  })

  it("rejects a non-kebab-case slug", () => {
    const result = routinesFileSchema.safeParse({
      routines: [
        {
          slug: "Daily Plan",
          name: "Daily Plan",
          skill: "daily-plan",
          schedule: "0 8 * * *",
        },
      ],
    })
    expect(result.success).toBe(false)
  })
})

describe("dashboardPath", () => {
  it("maps a slug to its layout file", () => {
    expect(dashboardPath("team-ops")).toBe("data/dashboards/team-ops.yaml")
  })

  it("rejects a slug that would escape the dashboards dir", () => {
    expect(() => dashboardPath("../secrets")).toThrow()
  })
})

describe("dashboardFileSchema", () => {
  it("keeps the optional display name", () => {
    const parsed = dashboardFileSchema.parse({
      name: "Team Ops",
      grid: {},
      widgets: [],
    })
    expect(parsed.name).toBe("Team Ops")
  })

  it("rejects a widget wider than the grid", () => {
    const result = dashboardFileSchema.safeParse({
      grid: { columns: 4, rowHeight: 150 },
      widgets: [
        {
          routine: "daily-plan",
          position: { col: 1, row: 1 },
          size: { cols: 5, rows: 1 },
        },
      ],
    })
    expect(result.success).toBe(false)
  })
})
