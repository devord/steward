import type { Routine } from "@steward/schema"
import { describe, expect, it } from "vitest"

import type { ArtifactInfo } from "./dashboard.server.ts"
import { isStale, setupCommands, widgetStatus } from "./routine-status.ts"

const NOW = Date.parse("2026-07-10T12:00:00Z")

function routine(over: Partial<Routine> = {}): Routine {
  return {
    slug: "r",
    name: "R",
    template: "custom",
    enabled: true,
    instructions: "do it",
    ...over,
  }
}

const ctx = (over: Partial<Parameters<typeof widgetStatus>[1]> = {}) => ({
  committed: true,
  hasTrigger: undefined,
  artifact: undefined,
  pendingFiredAt: null,
  now: NOW,
  ...over,
})

const artifact = (over: Partial<ArtifactInfo> = {}): ArtifactInfo => ({
  html: null,
  sha: null,
  lastRunAt: null,
  ...over,
})

describe("isStale", () => {
  it("is false for manual routines and never-run ones", () => {
    expect(isStale(routine(), "2026-01-01T00:00:00Z", NOW)).toBe(false)
    expect(isStale(routine({ schedule: "0 * * * *" }), null, NOW)).toBe(false)
  })

  it("is true when overdue by more than one interval", () => {
    // Hourly; last run 3h ago → past 2× the interval.
    const threeHoursAgo = new Date(NOW - 3 * 3_600_000).toISOString()
    expect(
      isStale(routine({ schedule: "0 * * * *" }), threeHoursAgo, NOW),
    ).toBe(true)
  })

  it("is false within the grace window", () => {
    const recent = new Date(NOW - 30 * 60_000).toISOString()
    expect(isStale(routine({ schedule: "0 * * * *" }), recent, NOW)).toBe(false)
  })
})

describe("widgetStatus", () => {
  it("running wins over everything when a fire is pending", () => {
    const status = widgetStatus(
      routine(),
      ctx({ pendingFiredAt: NOW, artifact: artifact({ html: "<p>x</p>" }) }),
    )
    expect(status).toEqual({ kind: "running", firedAt: NOW })
  })

  it("live with an artifact, carrying staleness", () => {
    const fresh = widgetStatus(
      routine({ schedule: "0 * * * *" }),
      ctx({
        artifact: artifact({
          html: "<p>x</p>",
          lastRunAt: new Date(NOW - 60_000).toISOString(),
        }),
      }),
    )
    expect(fresh).toEqual({ kind: "live", stale: false })
  })

  it("draft when not committed", () => {
    expect(widgetStatus(routine(), ctx({ committed: false })).kind).toBe(
      "draft",
    )
  })

  it("disabled beats awaiting", () => {
    expect(widgetStatus(routine({ enabled: false }), ctx()).kind).toBe(
      "disabled",
    )
  })

  it("unreachable when the body fetch failed", () => {
    expect(
      widgetStatus(
        routine(),
        ctx({ artifact: artifact({ unreachable: true }) }),
      ).kind,
    ).toBe("unreachable")
  })

  it("needs-trigger for a manual cloud routine without its trigger", () => {
    expect(widgetStatus(routine(), ctx({ hasTrigger: false })).kind).toBe(
      "needs-trigger",
    )
  })

  it("ready-manual for a manual cloud routine that has its trigger", () => {
    expect(widgetStatus(routine(), ctx({ hasTrigger: true })).kind).toBe(
      "ready-manual",
    )
  })

  it("awaiting for a manual cloud routine whose trigger check flapped", () => {
    expect(widgetStatus(routine(), ctx({ hasTrigger: undefined })).kind).toBe(
      "awaiting-first-run",
    )
  })

  it("awaiting for a scheduled cloud routine with no artifact", () => {
    expect(widgetStatus(routine({ schedule: "0 8 * * *" }), ctx()).kind).toBe(
      "awaiting-first-run",
    )
  })

  it("ready-scheduled for a scheduled cloud routine whose trigger exists", () => {
    expect(
      widgetStatus(
        routine({ schedule: "0 8 * * *" }),
        ctx({ hasTrigger: true }),
      ).kind,
    ).toBe("ready-scheduled")
  })

  it("awaiting for a scheduled cloud routine without a trigger — the cron still fires", () => {
    expect(
      widgetStatus(
        routine({ schedule: "0 8 * * *" }),
        ctx({ hasTrigger: false }),
      ).kind,
    ).toBe("awaiting-first-run")
  })

  it("awaiting for a local routine (no trigger concept)", () => {
    expect(widgetStatus(routine({ host: "local" }), ctx()).kind).toBe(
      "awaiting-first-run",
    )
  })
})

describe("setupCommands", () => {
  it("cloud routines enact via routines:sync, nothing to run locally", () => {
    expect(setupCommands(routine({ schedule: "0 8 * * *" }))).toEqual({
      enact:
        "npx @devord/steward sync --apply --file <path-to-data-repo>/data/routines.yaml",
      runOnce: null,
      trigger:
        "npx @devord/steward trigger r --file <path-to-data-repo>/data/routines.yaml",
    })
  })

  it("a known repo slug makes the commands copy-pasteable via --repo", () => {
    expect(
      setupCommands(
        routine({ schedule: "0 8 * * *" }),
        "alice/steward-data-alice",
      ),
    ).toEqual({
      enact: "npx @devord/steward sync --apply --repo alice/steward-data-alice",
      runOnce: null,
      trigger: "npx @devord/steward trigger r --repo alice/steward-data-alice",
    })
  })

  it("local scheduled routines enact and can be run once", () => {
    expect(
      setupCommands(routine({ host: "local", schedule: "0 8 * * *" })),
    ).toEqual({
      enact:
        "steward sync --apply --file <path-to-data-repo>/data/routines.yaml",
      runOnce: "npx @devord/steward run r",
      trigger: null,
    })
  })

  it("local manual routines have nothing to enact — just run them", () => {
    expect(setupCommands(routine({ host: "local" }))).toEqual({
      enact: null,
      runOnce: "npx @devord/steward run r",
      trigger: null,
    })
  })
})
