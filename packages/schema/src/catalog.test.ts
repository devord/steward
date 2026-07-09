import { describe, expect, it } from "vitest"

import { catalogFileSchema, widgetMetaSchema } from "./catalog.ts"

describe("widgetMetaSchema", () => {
  it("accepts the ADR-0006 example shape", () => {
    const result = widgetMetaSchema.safeParse({
      artifact: "One-line description of what the artifact shows",
      sizes: { default: { cols: 2, rows: 1 }, min: { cols: 1, rows: 1 } },
      schedule: "0 8 * * *",
    })
    expect(result.success).toBe(true)
  })

  it("requires a default size", () => {
    const result = widgetMetaSchema.safeParse({
      artifact: "x",
      sizes: { min: { cols: 1, rows: 1 } },
      schedule: "0 8 * * *",
    })
    expect(result.success).toBe(false)
  })
})

describe("catalogFileSchema", () => {
  it("rejects a skill id that is not kebab-case", () => {
    const result = catalogFileSchema.safeParse({
      skills: [
        {
          id: "Daily Plan",
          name: "Daily Plan",
          description: "d",
          widget: {
            artifact: "a",
            sizes: { default: { cols: 1, rows: 1 } },
            schedule: "0 8 * * *",
          },
        },
      ],
    })
    expect(result.success).toBe(false)
  })
})
