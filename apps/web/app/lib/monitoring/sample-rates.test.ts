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

  it("captures every error and every trace in production", () => {
    const rates = getSampleRates("production")
    expect(rates.sampleRate).toBe(1)
    expect(rates.traces).toBe(1)
  })

  it("records replay only for errored sessions", () => {
    // The deliberate asymmetry: ordinary sessions of a product full of
    // private repo names are not worth recording; errored ones are.
    const rates = getSampleRates("production")
    expect(rates.replaySessions).toBe(0)
    expect(rates.replayErrors).toBe(1)
  })

  it("lets a local run opt in with VERCEL_ENV=development", () => {
    expect(getSampleRates("development")).toEqual(getSampleRates("production"))
  })
})
