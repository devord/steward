import { describe, expect, it } from "vitest"

import type { ArtifactInfo } from "./dashboard.server.ts"
import { pendingToClear } from "./pending-runs.ts"

const NOW = Date.parse("2026-07-10T12:00:00Z")

const artifact = (lastRunAt: string | null): ArtifactInfo => ({
  html: null,
  lastRunAt,
})

describe("pendingToClear", () => {
  it("clears a run whose artifact published after it fired", () => {
    const firedAt = NOW - 2 * 60_000
    const published = new Date(NOW - 30_000).toISOString()
    expect(
      pendingToClear({ a: firedAt }, { a: artifact(published) }, NOW),
    ).toEqual(["a"])
  })

  it("keeps a run whose only artifact predates the fire (skew guard)", () => {
    const firedAt = NOW - 2 * 60_000
    // An artifact from well before the fire must not clear the pending mark.
    const old = new Date(firedAt - 5 * 60_000).toISOString()
    expect(pendingToClear({ a: firedAt }, { a: artifact(old) }, NOW)).toEqual(
      [],
    )
  })

  it("tolerates minor clock skew — a publish just before the fire still clears", () => {
    const firedAt = NOW - 2 * 60_000
    // 30s before the fire: inside the 60s skew window → treated as the new run.
    const nearlySimultaneous = new Date(firedAt - 30_000).toISOString()
    expect(
      pendingToClear({ a: firedAt }, { a: artifact(nearlySimultaneous) }, NOW),
    ).toEqual(["a"])
  })

  it("clears a run that has waited past the timeout with no artifact", () => {
    const firedAt = NOW - 11 * 60_000 // > 10min
    expect(pendingToClear({ a: firedAt }, { a: artifact(null) }, NOW)).toEqual([
      "a",
    ])
  })

  it("keeps a fresh run that hasn't published or timed out", () => {
    const firedAt = NOW - 60_000
    expect(pendingToClear({ a: firedAt }, { a: artifact(null) }, NOW)).toEqual(
      [],
    )
  })
})
