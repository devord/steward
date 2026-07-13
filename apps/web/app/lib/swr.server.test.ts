import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { __resetSwr, invalidateSwr, swr } from "./swr.server.ts"

const TTL = 60_000

describe("swr", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    __resetSwr()
  })

  it("loads live on a miss and serves the cache within the TTL", async () => {
    const load = vi.fn().mockResolvedValue("v1")
    expect(await swr("k", TTL, load)).toBe("v1")
    expect(await swr("k", TTL, load)).toBe("v1")
    expect(load).toHaveBeenCalledTimes(1)
  })

  it("serves stale immediately and refreshes in the background", async () => {
    let version = 1
    const load = vi
      .fn()
      .mockImplementation(() => Promise.resolve(`v${version}`))
    await swr("k", TTL, load)
    version = 2
    vi.advanceTimersByTime(TTL + 1)

    // The stale read answers instantly with the old value...
    expect(await swr("k", TTL, load)).toBe("v1")
    // ...and the background refresh makes the next read current.
    await vi.runAllTimersAsync()
    expect(await swr("k", TTL, load)).toBe("v2")
    expect(load).toHaveBeenCalledTimes(2)
  })

  it("keeps the stale value when a background refresh fails, then retries", async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce("v1")
      .mockRejectedValueOnce(new Error("flap"))
      .mockResolvedValueOnce("v2")
    await swr("k", TTL, load)
    vi.advanceTimersByTime(TTL + 1)

    expect(await swr("k", TTL, load)).toBe("v1") // triggers the failing refresh
    await vi.runAllTimersAsync()
    expect(await swr("k", TTL, load)).toBe("v1") // still stale; triggers retry
    await vi.runAllTimersAsync()
    expect(await swr("k", TTL, load)).toBe("v2")
  })

  it("treats an entry past its hard max-age as a miss, surfacing failures", async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce("v1")
      .mockRejectedValue(new Error("down"))
    await swr("k", TTL, load)
    vi.advanceTimersByTime(TTL * 10 + 1)

    await expect(swr("k", TTL, load)).rejects.toThrow("down")
  })

  it("invalidates by prefix, leaving other tokens' entries", async () => {
    await swr("sidebar:a:x", TTL, () => Promise.resolve("a"))
    await swr("sidebar:b:x", TTL, () => Promise.resolve("b"))
    invalidateSwr("sidebar:a")

    const reload = vi.fn().mockResolvedValue("a2")
    expect(await swr("sidebar:a:x", TTL, reload)).toBe("a2")
    expect(reload).toHaveBeenCalledTimes(1)
    const untouched = vi.fn()
    expect(await swr("sidebar:b:x", TTL, untouched)).toBe("b")
    expect(untouched).not.toHaveBeenCalled()
  })
})
