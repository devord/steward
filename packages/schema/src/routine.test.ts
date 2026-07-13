import { describe, expect, it } from "vitest"

import { dashboardFileSchema, dashboardPath } from "./dashboard.ts"
import {
  cloudSources,
  isManual,
  routineHost,
  routineSchema,
  routinesFileSchema,
  triggerFileSchema,
  triggerPath,
} from "./routine.ts"

describe("routinesFileSchema", () => {
  it("parses a valid routines file and applies defaults", () => {
    const parsed = routinesFileSchema.parse({
      routines: [
        {
          slug: "daily-plan",
          name: "Daily Plan",
          template: "daily-plan",
          schedule: "0 8 * * *",
        },
      ],
    })
    expect(parsed.routines[0]?.enabled).toBe(true)
  })

  it("round-trips an optional runner", () => {
    const parsed = routinesFileSchema.parse({
      routines: [
        {
          slug: "repo-pulse",
          name: "Repo Pulse",
          template: "repo-pulse",
          schedule: "0 */4 * * *",
          runner: "dmoraes",
        },
      ],
    })
    expect(parsed.routines[0]?.runner).toBe("dmoraes")
  })

  it("rejects a non-kebab-case slug", () => {
    const result = routinesFileSchema.safeParse({
      routines: [
        {
          slug: "Daily Plan",
          name: "Daily Plan",
          template: "daily-plan",
          schedule: "0 8 * * *",
        },
      ],
    })
    expect(result.success).toBe(false)
  })

  it("accepts a freeform manual routine via the custom template (ADR-0022/0016)", () => {
    const parsed = routinesFileSchema.parse({
      routines: [
        {
          slug: "retro-notes",
          name: "Retro Notes",
          template: "custom",
          instructions: "Summarize this week's retro action items.",
        },
      ],
    })
    const routine = parsed.routines[0]
    expect(routine?.template).toBe("custom")
    expect(routine && isManual(routine)).toBe(true)
    expect(routine && routineHost(routine)).toBe("cloud")
  })

  it("keeps an explicit local host (ADR-0012)", () => {
    const parsed = routinesFileSchema.parse({
      routines: [
        {
          slug: "time-tracking",
          name: "Time Tracking",
          template: "time-track",
          host: "local",
        },
      ],
    })
    const routine = parsed.routines[0]
    expect(routine && routineHost(routine)).toBe("local")
  })

  it("rejects a routine without a template — instructions alone aren't one (ADR-0022)", () => {
    for (const routine of [
      { slug: "empty", name: "Empty", schedule: "0 8 * * *" },
      { slug: "empty", name: "Empty", instructions: "do the thing" },
    ]) {
      const result = routinesFileSchema.safeParse({ routines: [routine] })
      expect(result.success).toBe(false)
    }
  })

  it("rejects blank instructions — absent beats blank", () => {
    for (const instructions of ["", "   ", " \n "]) {
      const result = routinesFileSchema.safeParse({
        routines: [
          { slug: "empty", name: "Empty", template: "custom", instructions },
        ],
      })
      expect(result.success).toBe(false)
    }
  })

  it("parses template params as strings or string lists (ADR-0020)", () => {
    const parsed = routinesFileSchema.parse({
      routines: [
        {
          slug: "repo-pulse",
          name: "Repo Pulse",
          template: "repo-pulse",
          params: {
            repos: ["devord/steward", "devord/plugins"],
            lens: "reviews",
          },
        },
      ],
    })
    expect(parsed.routines[0]?.params).toEqual({
      repos: ["devord/steward", "devord/plugins"],
      lens: "reviews",
    })
  })

  it("rejects empty param values — absent beats blank", () => {
    for (const params of [
      { repos: [] },
      { lens: "" },
      { lens: "   " },
      { repos: [""] },
      { repos: ["  "] },
    ]) {
      const result = routinesFileSchema.safeParse({
        routines: [{ slug: "x", name: "X", template: "s", params }],
      })
      expect(result.success).toBe(false)
    }
  })

  it("parses cloud repos and connectors (ADR-0018)", () => {
    const parsed = routinesFileSchema.parse({
      routines: [
        {
          slug: "repo-pulse",
          name: "Repo Pulse",
          template: "repo-pulse",
          schedule: "0 */4 * * *",
          repos: ["devord/plugins"],
          connectors: ["GitHub"],
        },
      ],
    })
    expect(parsed.routines[0]?.repos).toEqual(["devord/plugins"])
    expect(parsed.routines[0]?.connectors).toEqual(["GitHub"])
  })

  it("rejects a repo that is not owner/repo", () => {
    const result = routinesFileSchema.safeParse({
      routines: [
        {
          slug: "repo-pulse",
          name: "Repo Pulse",
          template: "repo-pulse",
          repos: ["just-a-name"],
        },
      ],
    })
    expect(result.success).toBe(false)
  })
})

describe("cloudSources", () => {
  const base = ["devord/steward", "danielmoraes/steward-data-danielmoraes"]

  it("unions declared extras onto the base, base first", () => {
    const routine = routineSchema.parse({
      slug: "repo-pulse",
      name: "Repo Pulse",
      template: "repo-pulse",
      repos: ["devord/plugins"],
    })
    expect(cloudSources(routine, base)).toEqual([...base, "devord/plugins"])
  })

  it("de-duplicates a repo already in the base", () => {
    const routine = routineSchema.parse({
      slug: "daily-plan",
      name: "Daily Plan",
      template: "daily-plan",
      repos: ["devord/steward"],
    })
    expect(cloudSources(routine, base)).toEqual(base)
  })

  it("is just the base when no extras are declared", () => {
    const routine = routineSchema.parse({
      slug: "daily-plan",
      name: "Daily Plan",
      template: "daily-plan",
    })
    expect(cloudSources(routine, base)).toEqual(base)
  })
})

describe("triggerPath", () => {
  it("maps a slug to its trigger token file", () => {
    expect(triggerPath("repo-pulse")).toBe("data/triggers/repo-pulse.json")
  })

  it("rejects a slug that would escape the triggers dir", () => {
    expect(() => triggerPath("../secrets")).toThrow()
  })
})

describe("triggerFileSchema", () => {
  it("round-trips the owning Claude account (ADR-0029)", () => {
    const parsed = triggerFileSchema.parse({
      routine: "rt_123",
      token: "tok",
      account: "daniel@dmoraes.org",
    })
    expect(parsed.account).toBe("daniel@dmoraes.org")
  })

  it("accepts a pre-ADR-0029 trigger without an account", () => {
    const parsed = triggerFileSchema.parse({ routine: "rt_123", token: "tok" })
    expect(parsed.account).toBeUndefined()
  })

  it("rejects a blank account — absent beats blank", () => {
    const result = triggerFileSchema.safeParse({
      routine: "rt_123",
      token: "tok",
      account: "   ",
    })
    expect(result.success).toBe(false)
  })
})

describe("dashboardPath", () => {
  it("maps a slug to its layout file", () => {
    expect(dashboardPath("team-ops")).toBe("data/dashboards/team-ops.yaml")
  })

  it("rejects a slug that would escape the dashboards dir", () => {
    expect(() => dashboardPath("../secrets")).toThrow()
  })
})

describe("dashboardFileSchema", () => {
  it("keeps the optional display name", () => {
    const parsed = dashboardFileSchema.parse({
      name: "Team Ops",
      grid: {},
      widgets: [],
    })
    expect(parsed.name).toBe("Team Ops")
  })

  it("rejects a widget wider than the grid", () => {
    const result = dashboardFileSchema.safeParse({
      grid: { columns: 4, rowHeight: 150 },
      widgets: [
        {
          routine: "daily-plan",
          position: { col: 1, row: 1 },
          size: { cols: 5, rows: 1 },
        },
      ],
    })
    expect(result.success).toBe(false)
  })
})
