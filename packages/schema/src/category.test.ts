import { describe, expect, it } from "vitest"

import {
  CATEGORY_NAME_MAX,
  orderCategories,
  resolveCategory,
  routineCategorySchema,
} from "./category.ts"
import { routineSchema } from "./routine.ts"
import { parseRoutineTemplate } from "./template.ts"

describe("resolveCategory", () => {
  it("inherits the template's category when the routine is silent", () => {
    expect(resolveCategory({}, "Engineering")).toBe("Engineering")
  })

  it("prefers the routine's own name over the template's", () => {
    expect(resolveCategory({ category: "Delivery" }, "Engineering")).toBe(
      "Delivery",
    )
  })

  // The tri-state's whole reason for existing: once absence means "ask the
  // template", null is the only way left to say "I looked, there is none".
  it("treats an explicit null as opting out, not as inheriting", () => {
    expect(resolveCategory({ category: null }, "Engineering")).toBe(null)
  })

  it("resolves to none when neither routine nor template names one", () => {
    expect(resolveCategory({}, undefined)).toBe(null)
  })

  // Templates stream in (ADR-0030) while routines.yaml is awaited, so the
  // materialized value has to stand alone before they land.
  it("answers from the routine alone when the template hasn't arrived", () => {
    expect(resolveCategory({ category: "Engineering" }, undefined)).toBe(
      "Engineering",
    )
    expect(resolveCategory({}, undefined)).toBe(null)
  })
})

describe("orderCategories", () => {
  it("renders listed categories in the repo's order", () => {
    expect(
      orderCategories(
        ["Engineering", "Project Management"],
        ["Project Management", "Engineering"],
      ),
    ).toEqual(["Project Management", "Engineering"])
  })

  it("sorts unlisted categories after the listed ones, alphabetically", () => {
    expect(
      orderCategories(["Zeta", "Alpha", "Engineering"], ["Engineering"]),
    ).toEqual(["Engineering", "Alpha", "Zeta"])
  })

  // ADR-0034's rule, one tier down: a name nothing uses must not leave a
  // heading with no widgets under it.
  it("drops listed names no routine uses rather than emptying a band", () => {
    expect(orderCategories(["Engineering"], ["Design", "Engineering"])).toEqual(
      ["Engineering"],
    )
  })

  it("emits one band for a name the repo lists twice", () => {
    expect(
      orderCategories(["Engineering"], ["Engineering", "Engineering"]),
    ).toEqual(["Engineering"])
  })

  it("falls back to alphabetical with no order list", () => {
    expect(orderCategories(["Zeta", "Alpha"], undefined)).toEqual([
      "Alpha",
      "Zeta",
    ])
  })
})

describe("routineCategorySchema", () => {
  it("accepts a name and an explicit null", () => {
    expect(routineCategorySchema.parse("Engineering")).toBe("Engineering")
    expect(routineCategorySchema.parse(null)).toBe(null)
  })

  it("rejects blank and over-long names", () => {
    expect(routineCategorySchema.safeParse("   ").success).toBe(false)
    expect(routineCategorySchema.safeParse("").success).toBe(false)
    expect(
      routineCategorySchema.safeParse("x".repeat(CATEGORY_NAME_MAX + 1))
        .success,
    ).toBe(false)
  })
})

describe("category on the wire", () => {
  const base = { slug: "corza-pulse", name: "Corza", template: "repo-pulse" }

  it("keeps absent and null distinguishable through the routine schema", () => {
    expect("category" in routineSchema.parse(base)).toBe(false)
    expect(routineSchema.parse({ ...base, category: null }).category).toBe(null)
  })

  it("reads a template's category out of widget frontmatter", () => {
    const parsed = parseRoutineTemplate(
      "repo-pulse",
      [
        "---",
        "description: Open PRs and CI",
        "widget:",
        "  artifact: Open PRs",
        "  category: Engineering",
        "---",
        "body",
      ].join("\n"),
    )
    expect(parsed?.widget.category).toBe("Engineering")
  })

  it("leaves a template without one absent, so its routines inherit nothing", () => {
    const parsed = parseRoutineTemplate(
      "custom",
      [
        "---",
        "description: Freeform",
        "widget:",
        "  artifact: X",
        "---",
        "",
      ].join("\n"),
    )
    expect(parsed?.widget.category).toBe(undefined)
  })
})
