import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterAll, describe, expect, it } from "vitest"

/**
 * These compile the real `tiers.css` with the real Tailwind CLI, because the
 * failure this guards against is invisible any other way: an OR-tier written
 * in the *inline* `@custom-variant` form emits
 *
 *     .roomy\:flex (min-height: 400px) { ... }
 *
 * — a selector with a stray media condition welded on. That is invalid CSS,
 * so the browser drops the rule and only the width half of the tier applies.
 * Tailwind reports no error, the build succeeds, and the artifact just quietly
 * fails to reach its tier on a tall-narrow tile. Nothing short of inspecting
 * the compiled output catches it.
 */
const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.resolve(here, "..", "..")
// @tailwindcss/cli is this package's own devDependency, so pnpm links the bin
// into the package's node_modules — not the workspace root's.
const cli = path.resolve(pkgRoot, "node_modules", ".bin", "tailwindcss")

const dir = mkdtempSync(path.join(tmpdir(), "steward-tiers-"))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

/** Compile the kit's tiers against a probe using every variant under test. */
function compile(classes: string[]): string {
  const probe = path.join(dir, "probe.html")
  const input = path.join(dir, "in.css")
  const out = path.join(dir, "out.css")
  writeFileSync(probe, `<div class="${classes.join(" ")}"></div>`)
  writeFileSync(
    input,
    [
      '@import "tailwindcss";',
      `@import "${path.join(here, "tiers.css")}";`,
      `@source "${probe}";`,
    ].join("\n"),
  )
  execFileSync(cli, ["-i", input, "-o", out], { cwd: pkgRoot, stdio: "pipe" })
  return readFileSync(out, "utf8")
}

/** Media conditions wrapping a given utility, in source order. */
function mediaFor(css: string, cls: string): string[] {
  const escaped = cls.replace(/[:.]/g, (c) => `\\\\?\\${c}`)
  const found: string[] = []
  const re = /@media([^{]+)\{([\s\S]*?)\n {2}\}/g
  for (const [, cond, body] of css.matchAll(re)) {
    if (new RegExp(`\\.${escaped}\\b`).test(body)) found.push(cond.trim())
  }
  return found
}

describe("tier variants", () => {
  const css = compile([
    "beyond-glance:block",
    "roomy:flex",
    "tier-detail:grid",
    "tall:hidden",
    "tile:p-2",
    "page-only:p-6",
  ])

  it("never emits a selector with a media condition welded onto it", () => {
    // The exact shape the inline @custom-variant form produces.
    expect(css).not.toMatch(/^\s*\.[^{}\n]*\((?:min|max)-(?:width|height):/m)
  })

  it("expands an OR-tier into one media block per condition", () => {
    expect(mediaFor(css, "beyond-glance:block")).toEqual([
      "(min-width: 341px)",
      "(min-height: 161px)",
    ])
    expect(mediaFor(css, "roomy:flex")).toEqual([
      "(min-width: 480px)",
      "(min-height: 400px)",
    ])
  })

  it("keeps single-condition tiers single", () => {
    expect(mediaFor(css, "tier-detail:grid")).toEqual(["(min-width: 701px)"])
    expect(mediaFor(css, "tall:hidden")).toEqual(["(min-height: 161px)"])
  })

  it("hands every button a pointer, and lets a utility take it back", () => {
    // Tailwind v4's preflight dropped v3's `cursor: pointer` on `button`, so
    // the kit's toggle and copy buttons came out with the arrow while the
    // anchors and the scrub input next to them came out with the hand: two
    // clickable things in one band disagreeing about whether they are
    // clickable. Restored as a base default rather than per-component, so it
    // reaches artifacts already published (ADR-0050) — none of them name a
    // cursor — and so `cursor-*` still wins where a component wants otherwise.
    expect(css).toMatch(/(^|\n)\s*button\s*\{[^}]*cursor:\s*pointer/)
    // And inside `@layer base`, not loose. An unlayered rule outranks every
    // utility whatever the specificity, which is how a "sensible default"
    // becomes something no component can opt out of. Written as "reachable
    // from the layer's opening brace without crossing another `@layer`",
    // because the emitted blocks are not in the order they are declared in.
    expect(css).toMatch(
      /@layer base\s*\{(?:(?!@layer)[\s\S])*?\bbutton\s*\{[^}]*cursor:\s*pointer/,
    )
  })

  it("gates tile and page on the board's stamp, not on a breakpoint", () => {
    // Width alone cannot tell a wide tile from the full view (ADR-0027), which
    // is why these key off `data-steward-tile` rather than a media query.
    expect(css).toMatch(/:root\[data-steward-tile\] \.tile\\:p-2/)
    expect(css).toMatch(/:root:not\(\[data-steward-tile\]\) \.page-only\\:p-6/)
  })
})
