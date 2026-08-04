import { describe, expect, it } from "vitest"

import { stewardTags } from "./scope.ts"

const HOME = "daniel/steward-data-daniel"

describe("stewardTags", () => {
  it("names the repo and the board on a canonical board URL", () => {
    expect(stewardTags("/r/devord/steward-data/ops")).toEqual({
      data_repo: "devord/steward-data",
      dashboard: "ops",
    })
  })

  it("names the repo alone on the routine pool view", () => {
    // `/r/:owner/:repo/routines` is a per-repo fixture (ADR-0025), not one
    // routine — so `routine` stays absent rather than reading "routines".
    expect(stewardTags("/r/devord/steward-data/routines")).toEqual({
      data_repo: "devord/steward-data",
    })
  })

  it("names the routine on its detail view", () => {
    expect(
      stewardTags("/r/devord/steward-data/routines/shopify-intel"),
    ).toEqual({
      data_repo: "devord/steward-data",
      routine: "shopify-intel",
    })
  })

  it("names the same routine when browsing one of its published versions", () => {
    expect(
      stewardTags("/r/devord/steward-data/routines/shopify-intel/at/deadbeef"),
    ).toEqual({
      data_repo: "devord/steward-data",
      routine: "shopify-intel",
    })
  })

  it("names the repo without a board on a bare repo path", () => {
    expect(stewardTags("/r/devord/steward-data")).toEqual({
      data_repo: "devord/steward-data",
    })
  })

  it("resolves `/` to the home repo's default board", () => {
    expect(stewardTags("/", HOME)).toEqual({
      data_repo: HOME,
      dashboard: "main",
    })
  })

  it("anchors a non-repo route to the viewer's home repo", () => {
    // Settings, setup, and the resource routes still answer "whose Steward".
    expect(stewardTags("/settings", HOME)).toEqual({ data_repo: HOME })
    expect(stewardTags("/run", HOME)).toEqual({ data_repo: HOME })
  })

  it("tags nothing for an anonymous visitor on the landing page", () => {
    expect(stewardTags("/")).toEqual({})
  })

  it("prefers the URL's repo over the viewer's home repo", () => {
    expect(stewardTags("/r/devord/steward-data/ops", HOME).data_repo).toBe(
      "devord/steward-data",
    )
  })
})
