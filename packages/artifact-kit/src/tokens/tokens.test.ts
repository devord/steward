import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8")

/**
 * These pin the two properties that, if broken, fail *silently* — the artifact
 * still renders, it just stops following the active theme, and nobody notices
 * until a screenshot looks wrong next to chrome that moved on.
 *
 * Whether the values themselves match the registry is not checked here: the
 * file is generated, and CI re-runs `scripts/gen-artifact-tokens.ts` and fails
 * on a dirty tree — the same freshness discipline ADR-0006 set for the skills
 * catalog. A test asserting the hexes would just be a second hand-maintained
 * copy of the thing the generator exists to stop us hand-maintaining.
 */
describe("the generated artifact palette", () => {
  it("resets Tailwind's stock palette", () => {
    // Without this, `bg-slate-700` compiles to a literal hex that the board's
    // override cannot reach — one element pinned to a fixed color while the
    // rest of the artifact follows the theme. Verified: with the reset in
    // place, stock-palette utilities emit no rule at all.
    expect(css).toContain("--color-*: initial")
  })

  it("declares every token as a plain custom property, never !important", () => {
    // artifactThemeStyle() re-points these names with `!important`. If the
    // generated file got there first with its own `!important`, the two would
    // tie on specificity and source order would decide — and the board's block
    // is appended after, so it would win today and break the moment anything
    // reorders the injection. Plain declarations keep the override unambiguous.
    const decls = [...css.matchAll(/^\s*(--color-[a-z0-9-]+):\s*([^;]+);/gm)]
    expect(decls.length).toBeGreaterThanOrEqual(17)
    for (const [, name, value] of decls) {
      expect(value, `${name} must be a bare value`).not.toContain("!important")
      expect(value.trim(), `${name} must be a hex literal`).toMatch(
        /^#[0-9a-f]{3,8}$/i,
      )
    }
  })

  it("sets color-scheme without !important so the board can re-point it", () => {
    expect(css).toMatch(/color-scheme:\s*(dark|light);/)
    expect(css).not.toMatch(/color-scheme:[^;]*!important/)
  })

  it("carries the mono stack the board's injected face expects (ADR-0031)", () => {
    // The board injects Geist Mono into the frame; the artifact must name it
    // first so the injected face is the one that binds, with the system mono
    // after the comma for a raw-opened file.
    expect(css).toMatch(/--font-mono:\s*"Geist Mono Variable"/)
  })
})
