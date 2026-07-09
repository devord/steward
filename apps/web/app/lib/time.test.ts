import { describe, expect, it } from "vitest"

import { cronIntervalMs, formatAgo } from "./time.ts"

const HOUR = 3_600_000

describe("formatAgo", () => {
  const now = Date.parse("2026-07-09T12:00:00Z")

  it("formats minutes, hours, and days", () => {
    expect(formatAgo("2026-07-09T11:58:00Z", now)).toBe("2m ago")
    expect(formatAgo("2026-07-09T09:00:00Z", now)).toBe("3h ago")
    expect(formatAgo("2026-07-05T12:00:00Z", now)).toBe("4d ago")
  })

  it("never goes negative on clock skew", () => {
    expect(formatAgo("2026-07-09T12:01:00Z", now)).toBe("just now")
  })
})

describe("cronIntervalMs", () => {
  it("reads step minutes and hours", () => {
    expect(cronIntervalMs("*/15 * * * *")).toBe(15 * 60_000)
    expect(cronIntervalMs("0 */4 * * *")).toBe(4 * HOUR)
  })

  it("classifies daily and weekly schedules", () => {
    expect(cronIntervalMs("0 8 * * *")).toBe(24 * HOUR)
    expect(cronIntervalMs("0 9 * * 1")).toBe(7 * 24 * HOUR)
  })

  it("rejects malformed expressions", () => {
    expect(cronIntervalMs("not a cron")).toBeNull()
  })
})
