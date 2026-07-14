import { describe, expect, it } from "vitest"

import { deriveRuns, type RunReceipt } from "./runs.ts"

const HOUR = 3_600_000

/** Newest-first receipts, `hoursAgo` counted from a fixed origin. */
function receipt(hoursAgo: number, over: Partial<RunReceipt> = {}): RunReceipt {
  return {
    sha: `sha-${hoursAgo}`,
    htmlUrl: `https://github.com/o/r/commit/sha-${hoursAgo}`,
    at: new Date(1_770_000_000_000 - hoursAgo * HOUR).toISOString(),
    author: "Claude",
    ...over,
  }
}

describe("deriveRuns", () => {
  it("returns nothing for no receipts", () => {
    expect(deriveRuns([], "0 */4 * * *")).toEqual([])
  })

  it("marks the oldest receipt as the first run, schedule or not", () => {
    const scheduled = deriveRuns([receipt(8), receipt(12)], "0 */4 * * *")
    expect(scheduled[1]?.cadence).toBe("first")
    const manual = deriveRuns([receipt(8), receipt(12)], null)
    expect(manual[1]?.cadence).toBe("first")
  })

  it("never claims a first run on a capped listing — merely the oldest fetched", () => {
    const runs = deriveRuns([receipt(8), receipt(12)], "0 */4 * * *", true)
    expect(runs[1]?.cadence).toBeNull()
    expect(runs[0]?.cadence).toBe("on-schedule")
  })

  it("computes each run's gap to the previous run, none for the first", () => {
    const runs = deriveRuns([receipt(0), receipt(4), receipt(16)], null)
    expect(runs.map((r) => r.gapMs)).toEqual([4 * HOUR, 12 * HOUR, null])
  })

  it("judges cadence against the schedule: within 2× the interval is on time", () => {
    // A 4h cron ran at 4h and 7h gaps (fine) and once after 16h (missed runs).
    const runs = deriveRuns(
      [receipt(0), receipt(16), receipt(23), receipt(27)],
      "0 */4 * * *",
    )
    expect(runs.map((r) => r.cadence)).toEqual([
      "late",
      "on-schedule",
      "on-schedule",
      "first",
    ])
  })

  it("leaves cadence unjudged without a schedule or with an unparsable one", () => {
    const manual = deriveRuns([receipt(0), receipt(99)], null)
    expect(manual[0]?.cadence).toBeNull()
    const weird = deriveRuns([receipt(0), receipt(99)], "not a cron")
    expect(weird[0]?.cadence).toBeNull()
  })

  it("never reports a negative gap when commit dates interleave", () => {
    // The contents API orders by history, not timestamp — a rebased or
    // clock-skewed pair must not surface as a negative duration.
    const runs = deriveRuns([receipt(4), receipt(3)], null)
    expect(runs[0]?.gapMs).toBe(0)
  })
})
