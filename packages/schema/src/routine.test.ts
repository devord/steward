import { describe, expect, it } from "vitest"

import { dashboardFileSchema } from "./dashboard.ts"
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

describe("dashboardFileSchema", () => {
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
