import type { DashboardFile, RoutinesFile } from "@bulletin/schema"
import { describe, expect, it } from "vitest"

import {
  type Draft,
  type LastCommit,
  type ServerConfig,
  reconcileServerBase,
  rebaseDraft,
  removeRoutine,
  staleKinds,
} from "./draft.ts"

const routines = (slugs: string[]): RoutinesFile => ({
  routines: slugs.map((slug) => ({
    slug,
    name: slug.toUpperCase(),
    enabled: true,
    instructions: `do ${slug}`,
  })),
})

const dashboard = (slugs: string[]): DashboardFile => ({
  grid: { columns: 4, rowHeight: 150, width: "fixed" },
  widgets: slugs.map((slug, i) => ({
    routine: slug,
    position: { col: i + 1, row: 1 },
    size: { cols: 1, rows: 1 },
  })),
})

const draft = (): Draft => ({
  baseShas: { routines: "r0", dashboard: "d0" },
  routines: routines(["a", "b"]),
  dashboard: dashboard(["a", "b"]),
})

describe("removeRoutine", () => {
  it("drops the routine and every widget referencing it, leaving others", () => {
    const next = removeRoutine(draft(), "a")
    expect(next.routines.routines.map((r) => r.slug)).toEqual(["b"])
    expect(next.dashboard.widgets.map((w) => w.routine)).toEqual(["b"])
  })

  it("leaves the draft unchanged for an unknown slug", () => {
    const next = removeRoutine(draft(), "missing")
    expect(next.routines.routines.map((r) => r.slug)).toEqual(["a", "b"])
  })
})

describe("rebaseDraft + staleKinds", () => {
  it("adopting fresh SHAs clears the stale flag; content is untouched", () => {
    const d = draft()
    const server = { routines: "r1", dashboard: "d1" }
    expect(staleKinds(d.baseShas, server)).toEqual(["routines", "dashboard"])

    const rebased = rebaseDraft(d, server)
    expect(staleKinds(rebased.baseShas, server)).toEqual([])
    expect(rebased.routines).toEqual(d.routines)
    expect(rebased.dashboard).toEqual(d.dashboard)
  })

  it("reports only the file whose SHA moved", () => {
    expect(
      staleKinds(
        { routines: "r0", dashboard: "d0" },
        { routines: "r0", dashboard: "d1" },
      ),
    ).toEqual(["dashboard"])
  })
})

describe("reconcileServerBase", () => {
  const view: ServerConfig = {
    baseShas: { routines: "r_loader", dashboard: "d0" },
    baseFiles: { routines: "LOADER", dashboard: "D0" },
    routines: routines(["loader"]),
    dashboard: dashboard([]),
  }

  it("passes the view through untouched when no commit is pending", () => {
    const out = reconcileServerBase(view, null)
    expect(out.baseShas).toEqual(view.baseShas)
    expect(out.settled).toBe(true)
  })

  it("trusts the loader once it converged on the committed SHA", () => {
    const lastCommit: LastCommit = {
      prevShas: { routines: "r_prev", dashboard: "d0" },
      newShas: { routines: "r_loader" },
      routines: routines(["committed"]),
      dashboard: dashboard([]),
      files: { routines: "COMMITTED", dashboard: "D0" },
    }
    const out = reconcileServerBase(view, lastCommit)
    expect(out.baseShas.routines).toBe("r_loader")
    expect(out.baseFiles.routines).toBe("LOADER")
    expect(out.settled).toBe(true)
  })

  it("substitutes the committed blob when the loader still lags", () => {
    const committed = routines(["committed"])
    const lastCommit: LastCommit = {
      prevShas: { routines: "r_prev", dashboard: "d0" },
      newShas: { routines: "r_new" },
      routines: committed,
      dashboard: dashboard([]),
      files: { routines: "COMMITTED", dashboard: "D0" },
    }
    const lagging: ServerConfig = {
      ...view,
      baseShas: { routines: "r_prev", dashboard: "d0" },
      baseFiles: { routines: "OLD", dashboard: "D0" },
    }
    const out = reconcileServerBase(lagging, lastCommit)
    expect(out.baseShas.routines).toBe("r_new")
    expect(out.baseFiles.routines).toBe("COMMITTED")
    expect(out.routines).toBe(committed)
    expect(out.settled).toBe(false)
  })

  it("yields to a third-party commit that moved past ours", () => {
    const lastCommit: LastCommit = {
      prevShas: { routines: "r_prev", dashboard: "d0" },
      newShas: { routines: "r_new" },
      routines: routines(["committed"]),
      dashboard: dashboard([]),
      files: { routines: "COMMITTED", dashboard: "D0" },
    }
    const other: ServerConfig = {
      ...view,
      baseShas: { routines: "r_other", dashboard: "d0" },
    }
    const out = reconcileServerBase(other, lastCommit)
    expect(out.baseShas.routines).toBe("r_other")
    expect(out.settled).toBe(true)
  })
})
