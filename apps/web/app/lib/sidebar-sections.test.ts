import { describe, expect, it } from "vitest"

import type { SidebarBoard } from "./dashboard.server.ts"
import { groupBoards } from "./sidebar-sections.ts"

const board = (slug: string, group: string | null = null): SidebarBoard => ({
  slug,
  name: null,
  group,
  lastRunAt: null,
  stale: false,
})

describe("groupBoards", () => {
  it("returns a single unlabeled section when nothing is grouped", () => {
    const sections = groupBoards([board("main"), board("ops")], [])
    expect(sections).toEqual([
      { label: null, boards: [board("main"), board("ops")] },
    ])
  })

  it("leads with ungrouped boards, then labeled sections", () => {
    const sections = groupBoards(
      [board("main"), board("corza", "Clients"), board("steward", "Projects")],
      [],
    )
    expect(sections.map((s) => s.label)).toEqual([null, "Clients", "Projects"])
    expect(sections[0].boards).toEqual([board("main")])
  })

  it("orders labeled sections by the repo's `groups` list", () => {
    // Authored order is Projects-before-Clients even though the boards arrive
    // Clients-first and the alphabetical order is the reverse.
    const sections = groupBoards(
      [board("corza", "Clients"), board("steward", "Projects")],
      ["Projects", "Clients"],
    )
    expect(sections.map((s) => s.label)).toEqual(["Projects", "Clients"])
  })

  it("appends sections missing from `groups` alphabetically, after listed ones", () => {
    const sections = groupBoards(
      [board("a", "Zulu"), board("b", "Alpha"), board("c", "Listed")],
      ["Listed"],
    )
    expect(sections.map((s) => s.label)).toEqual(["Listed", "Alpha", "Zulu"])
  })

  it("ignores `groups` names that no board uses (no empty headings)", () => {
    const sections = groupBoards(
      [board("corza", "Clients")],
      ["Ghost", "Clients"],
    )
    expect(sections.map((s) => s.label)).toEqual(["Clients"])
  })

  it("preserves incoming board order within a section", () => {
    const sections = groupBoards(
      [board("b", "Clients"), board("a", "Clients")],
      [],
    )
    expect(sections[0].boards.map((b) => b.slug)).toEqual(["b", "a"])
  })

  it("omits the unlabeled section when every board is grouped", () => {
    const sections = groupBoards([board("corza", "Clients")], [])
    expect(sections.map((s) => s.label)).toEqual(["Clients"])
  })
})
