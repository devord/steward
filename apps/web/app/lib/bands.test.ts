import type { Routine, Widget } from "@steward/schema"
import { describe, expect, it } from "vitest"

import {
  buildBands,
  mergeTemplateCategories,
  type PlacedCell,
} from "./bands.ts"

function cell(
  slug: string,
  template: string,
  category?: string | null,
): PlacedCell {
  const routine = {
    slug,
    name: slug,
    template,
    enabled: true,
    ...(category !== undefined && { category }),
  } as Routine
  const widget: Widget = {
    routine: slug,
    position: { col: 1, row: 1 },
    size: { cols: 1, rows: 1 },
  }
  return { widget, routine }
}

const TEMPLATES = { "repo-pulse": "Engineering", narrative: "Project Mgmt" }

describe("buildBands", () => {
  it("splits cells into bands by their resolved category", () => {
    const bands = buildBands(
      [
        cell("a-pulse", "repo-pulse"),
        cell("a-narrative", "narrative"),
        cell("b-pulse", "repo-pulse"),
      ],
      TEMPLATES,
      ["Project Mgmt", "Engineering"],
    )
    expect(bands.map((b) => b.category)).toEqual([
      "Project Mgmt",
      "Engineering",
    ])
    expect(bands[1]?.cells.map((c) => c.routine.slug)).toEqual([
      "a-pulse",
      "b-pulse",
    ])
  })

  it("leads with the uncategorized band, unlabeled", () => {
    const bands = buildBands(
      [
        cell("a-pulse", "repo-pulse"),
        cell("plan", "daily-plan"),
        cell("a-narrative", "narrative"),
      ],
      TEMPLATES,
      [],
    )
    expect(bands[0]?.category).toBe(null)
    expect(bands[0]?.cells.map((c) => c.routine.slug)).toEqual(["plan"])
  })

  // The hazard that motivated the floor: a built-in gaining a category must
  // not leave an unrelated board showing one lone heading over a headingless
  // remainder, which reads as breakage rather than organization.
  it("renders flat below the floor rather than one lonely band", () => {
    const bands = buildBands(
      [cell("a-pulse", "repo-pulse"), cell("plan", "daily-plan")],
      TEMPLATES,
      [],
    )
    expect(bands).toHaveLength(1)
    expect(bands[0]?.category).toBe(null)
    expect(bands[0]?.cells).toHaveLength(2)
  })

  it("keeps every cell exactly once, banded or flat", () => {
    const cells = [
      cell("a-pulse", "repo-pulse"),
      cell("a-narrative", "narrative"),
      cell("plan", "daily-plan"),
    ]
    const banded = buildBands(cells, TEMPLATES, [])
    expect(
      banded.flatMap((b) => b.cells.map((c) => c.routine.slug)).sort(),
    ).toEqual(["a-narrative", "a-pulse", "plan"])
  })

  it("lets a routine's own category override its template's", () => {
    const bands = buildBands(
      [
        cell("a-pulse", "repo-pulse", "Project Mgmt"),
        cell("a-narrative", "narrative"),
        cell("b-pulse", "repo-pulse"),
      ],
      TEMPLATES,
      ["Engineering", "Project Mgmt"],
    )
    const pm = bands.find((b) => b.category === "Project Mgmt")
    expect(pm?.cells.map((c) => c.routine.slug).sort()).toEqual([
      "a-narrative",
      "a-pulse",
    ])
  })

  it("drops an opted-out routine into the unlabeled band, not its template's", () => {
    const bands = buildBands(
      [
        cell("a-pulse", "repo-pulse", null),
        cell("b-pulse", "repo-pulse"),
        cell("a-narrative", "narrative"),
      ],
      TEMPLATES,
      [],
    )
    expect(bands[0]?.category).toBe(null)
    expect(bands[0]?.cells.map((c) => c.routine.slug)).toEqual(["a-pulse"])
  })

  it("bands from a materialized category alone, before templates arrive", () => {
    const bands = buildBands(
      [
        cell("a-pulse", "repo-pulse", "Engineering"),
        cell("a-narrative", "narrative", "Project Mgmt"),
      ],
      {},
      ["Engineering", "Project Mgmt"],
    )
    expect(bands.map((b) => b.category)).toEqual([
      "Engineering",
      "Project Mgmt",
    ])
  })
})

describe("mergeTemplateCategories", () => {
  it("returns the built-in map untouched before the stream lands", () => {
    const builtin = { "repo-pulse": "Engineering" }
    expect(mergeTemplateCategories(builtin, null)).toBe(builtin)
  })

  it("lets a repo template shadow a same-named built-in (ADR-0021)", () => {
    expect(
      mergeTemplateCategories({ "repo-pulse": "Engineering" }, [
        { id: "repo-pulse", widget: { category: "Delivery" } },
      ]),
    ).toEqual({ "repo-pulse": "Delivery" })
  })

  it("ignores streamed templates that declare no category", () => {
    expect(
      mergeTemplateCategories({ "repo-pulse": "Engineering" }, [
        { id: "custom", widget: {} },
      ]),
    ).toEqual({ "repo-pulse": "Engineering" })
  })
})
