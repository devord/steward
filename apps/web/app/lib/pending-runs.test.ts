import { describe, expect, it } from "vitest"

import type { ArtifactInfo } from "./dashboard.server.ts"
import { type PendingRun, pendingToClear } from "./pending-runs.ts"

const NOW = Date.parse("2026-07-10T12:00:00Z")

const artifact = (sha: string | null): ArtifactInfo => ({
  html: sha == null ? null : "<h1>plan</h1>",
  sha,
  lastRunAt: null,
})

const run = (firedAt: number, sha: string | null): PendingRun => ({
  firedAt,
  sha,
})

describe("pendingToClear", () => {
  it("clears a run once the artifact SHA changes from the one on file", () => {
    const fired = run(NOW - 2 * 60_000, "sha-old")
    expect(
      pendingToClear({ a: fired }, { a: artifact("sha-new") }, NOW),
    ).toEqual(["a"])
  })

  it("clears a run once a first-ever artifact publishes (null baseline)", () => {
    const fired = run(NOW - 2 * 60_000, null)
    expect(pendingToClear({ a: fired }, { a: artifact("sha-1") }, NOW)).toEqual(
      ["a"],
    )
  })

  it("keeps a run whose artifact SHA is unchanged since it fired", () => {
    const fired = run(NOW - 2 * 60_000, "sha-same")
    expect(
      pendingToClear({ a: fired }, { a: artifact("sha-same") }, NOW),
    ).toEqual([])
  })

  it("keeps a fresh run that hasn't published yet (still no artifact)", () => {
    const fired = run(NOW - 60_000, null)
    expect(pendingToClear({ a: fired }, { a: artifact(null) }, NOW)).toEqual([])
  })

  it("keeps a run when the artifact hasn't loaded at all this poll", () => {
    const fired = run(NOW - 60_000, "sha-old")
    expect(pendingToClear({ a: fired }, {}, NOW)).toEqual([])
  })

  it("keeps a run when a published artifact flaps to unreachable", () => {
    // A transient GitHub 5xx nulls the SHA without a real publish — that must
    // not read as "changed" and clear a run that's still in flight.
    const fired = run(NOW - 60_000, "sha-old")
    const unreachable: ArtifactInfo = {
      html: null,
      sha: null,
      lastRunAt: null,
      unreachable: true,
    }
    expect(pendingToClear({ a: fired }, { a: unreachable }, NOW)).toEqual([])
  })

  it("clears a run that has waited past the timeout with no new artifact", () => {
    const fired = run(NOW - 31 * 60_000, "sha-old") // > 30min
    expect(
      pendingToClear({ a: fired }, { a: artifact("sha-old") }, NOW),
    ).toEqual(["a"])
  })
})
