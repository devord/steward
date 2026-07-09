import { describe, expect, it } from "vitest"

import { diffLines } from "./diff.ts"

describe("diffLines", () => {
  it("marks everything added against an empty base", () => {
    const diff = diffLines("", "a\nb")
    expect(diff).toEqual([
      { kind: "add", text: "a" },
      { kind: "add", text: "b" },
    ])
  })

  it("finds a one-line change", () => {
    const diff = diffLines("a\nb\nc", "a\nB\nc")
    expect(diff).toEqual([
      { kind: "same", text: "a" },
      { kind: "del", text: "b" },
      { kind: "add", text: "B" },
      { kind: "same", text: "c" },
    ])
  })

  it("reports identical inputs as all-same", () => {
    expect(
      diffLines("x\ny", "x\ny").every((line) => line.kind === "same"),
    ).toBe(true)
  })
})
