import { describe, expect, it } from "vitest"

import { collapsedBandsCookie, parseCollapsedBands } from "./band-collapse.ts"

describe("parseCollapsedBands", () => {
  it("round-trips a collapsed set through the cookie value", () => {
    const cookie = collapsedBandsCookie(["Engineering", "Project Management"])
    const value = cookie.split(";")[0] ?? ""
    expect(parseCollapsedBands(value)).toEqual([
      "Engineering",
      "Project Management",
    ])
  })

  it("reads the cookie out of a header carrying others", () => {
    const mine = collapsedBandsCookie(["Engineering"]).split(";")[0] ?? ""
    expect(
      parseCollapsedBands(`steward_locale=pt-BR; ${mine}; other=1`),
    ).toEqual(["Engineering"])
  })

  it("treats a missing cookie as nothing collapsed", () => {
    expect(parseCollapsedBands(null)).toEqual([])
    expect(parseCollapsedBands("steward_locale=en")).toEqual([])
  })

  // Every band open is the honest floor: a corrupt preference must never
  // silently hide a widget the viewer expects to see.
  it("degrades malformed values to nothing collapsed", () => {
    expect(parseCollapsedBands("steward_bands_collapsed=%%%")).toEqual([])
    expect(parseCollapsedBands("steward_bands_collapsed=notjson")).toEqual([])
    expect(parseCollapsedBands('steward_bands_collapsed={"a":1}')).toEqual([])
    expect(parseCollapsedBands("steward_bands_collapsed=")).toEqual([])
  })

  it("keeps only string entries from a mixed array", () => {
    const raw = encodeURIComponent(JSON.stringify(["Engineering", 3, null]))
    expect(parseCollapsedBands(`steward_bands_collapsed=${raw}`)).toEqual([
      "Engineering",
    ])
  })
})

describe("collapsedBandsCookie", () => {
  it("de-duplicates and scopes the cookie to the whole app", () => {
    const cookie = collapsedBandsCookie(["Engineering", "Engineering"])
    expect(cookie).toContain("Path=/")
    expect(cookie).toContain("SameSite=Lax")
    expect(parseCollapsedBands(cookie.split(";")[0] ?? "")).toEqual([
      "Engineering",
    ])
  })

  it("survives a category name with a comma or semicolon in it", () => {
    const cookie = collapsedBandsCookie(["Design; QA", "A,B"])
    expect(parseCollapsedBands(cookie.split(";")[0] ?? "")).toEqual([
      "Design; QA",
      "A,B",
    ])
  })
})
