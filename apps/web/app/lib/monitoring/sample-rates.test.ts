import { describe, expect, it } from "vitest"

import { getSampleRates } from "./sample-rates.ts"

describe("getSampleRates", () => {
  it("collects nothing when no tier is set", () => {
    // Local dev and anything else Vercel didn't stamp: the same silence a
    // missing DSN buys, so the two gates can't disagree.
    const rates = getSampleRates(undefined)
    expect(rates.sampleRate).toBe(0)
    expect(rates.traces).toBe(0)
    expect(rates.replaySessions).toBe(0)
    expect(rates.replayErrors).toBe(0)
  })

  it("collects nothing for preview", () => {
    // Previews are inert by design — the DSN is unset there too, but a leak
    // into the Preview scope must still send nothing.
    expect(getSampleRates("preview")).toEqual({
      sampleRate: 0,
      traces: 0,
      replaySessions: 0,
      replayErrors: 0,
    })
  })

  it("fails closed on an unrecognised tier", () => {
    // A mistyped or newly invented tier must not inherit production's rates.
    const rates = getSampleRates("prodcution")
    expect(rates.sampleRate).toBe(0)
    expect(rates.traces).toBe(0)
  })

  it("captures every error in production", () => {
    // Errors are rare and a sampled-away crash is a crash nobody hears, so
    // this is the rate that must not drift down with the trace rate.
    expect(getSampleRates("production").sampleRate).toBe(1)
  })

  it("samples production traces down, because always-on tabs would spend the month", () => {
    // One board revalidation is 65–98 spans and a visible tab fires one every
    // 120s, so an unsampled always-on board is ~1.7M spans/month against a 5M
    // allowance. Head-based sampling keeps whole traces, just fewer of them.
    const rates = getSampleRates("production")
    expect(rates.traces).toBeGreaterThan(0)
    expect(rates.traces).toBeLessThan(1)
  })

  it("records replay only for errored sessions", () => {
    // The deliberate asymmetry: ordinary sessions of a product full of
    // private repo names are not worth recording; errored ones are.
    const rates = getSampleRates("production")
    expect(rates.replaySessions).toBe(0)
    expect(rates.replayErrors).toBe(1)
  })

  it("lets a local run opt in with VERCEL_ENV=development", () => {
    expect(getSampleRates("development").sampleRate).toBe(1)
  })

  it("does not sample traces locally, where the quota argument doesn't apply", () => {
    // One person on one machine reproducing one thing: sampling would hide
    // the trace they switched this on to look at.
    expect(getSampleRates("development").traces).toBe(1)
  })

  it("never records replay locally", () => {
    expect(getSampleRates("development").replayErrors).toBe(0)
    expect(getSampleRates("development").replaySessions).toBe(0)
  })
})
