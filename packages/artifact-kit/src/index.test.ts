import { describe, expect, it } from "vitest"

import { KIT_MAJOR, KIT_VERSION } from "./index.ts"

describe("the kit version stamp", () => {
  // KIT_MAJOR is parsed out of the string, so a malformed KIT_VERSION doesn't
  // fail loudly — `Number("v1")` is NaN, and every `NaN !== major` comparison
  // the board makes is true, so the compat warning either fires constantly or
  // (worse, depending which way the check reads) never fires at all. The
  // stamp's whole job is telling the board when injected CSS has moved past
  // what an artifact was compiled against; a quietly-NaN major retires that
  // guard without retiring the risk.
  it("is plain three-part semver, so the major actually parses", () => {
    expect(KIT_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
    expect(KIT_MAJOR).toBeTypeOf("number")
    expect(Number.isInteger(KIT_MAJOR)).toBe(true)
    expect(KIT_MAJOR).toBeGreaterThanOrEqual(1)
  })

  it("derives the major from the version rather than restating it", () => {
    expect(KIT_MAJOR).toBe(Number(KIT_VERSION.split(".")[0]))
  })
})
