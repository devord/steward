import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

/**
 * A chart-bearing artifact has to survive the **publish** validator, not just
 * the renderer.
 *
 * This is the gap that shipped ADR-0062 broken. Every test in this package
 * asserted on what `renderArtifact` produced, and all of them passed — while
 * `scripts/validate.mjs`, which is what actually gates a publish, rejected the
 * output with 23 errors. `corza-progress` compiled its burn-up, failed here,
 * and published without it; the routine's own provenance line diagnosed the
 * cause more precisely than any test in this suite could.
 *
 * The lesson is the shape of the test, not the specific bug: the renderer is
 * not the last word on whether a run can publish, so something has to exercise
 * the thing that is.
 *
 * Runs the real script over a real render, because a reimplementation of the
 * validator here would be a second copy free to disagree with the first.
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, "..", "..", "..", "..")
const kit = path.join(repoRoot, ".claude", "skills", "widget-artifact")
const render = path.join(kit, "kit", "render.mjs")
const validate = path.join(kit, "scripts", "validate.mjs")

const doc = {
  slug: "chart-publishable",
  generatedAt: "2026-08-04T09:00:00Z",
  stat: { value: 3, label: "hotspots" },
  blocks: [
    {
      kind: "chart",
      id: "scatter",
      label: "Churn against interface width",
      spec: {
        data: {
          values: [
            { module: "cart", commits: 34, exports: 8.9 },
            { module: "checkout", commits: 28, exports: 6.2 },
            { module: "catalog", commits: 22, exports: 4.1 },
            { module: "pricing", commits: 19, exports: 3.8 },
          ],
        },
        semantic_types: {
          module: "Category",
          commits: "Quantity",
          exports: "Quantity",
        },
        chart_spec: {
          chartType: "Scatter Plot",
          encodings: { x: "commits", y: "exports" },
        },
      },
    },
    {
      kind: "series",
      label: "Burn-up",
      spec: {
        from: "2026-07-01",
        to: "2026-08-01",
        today: "2026-07-30",
        max: 40,
        lines: [
          {
            id: "scope",
            label: "40 scope",
            role: "ceiling",
            points: [
              { x: "2026-07-01", y: 32 },
              { x: "2026-07-30", y: 40 },
            ],
          },
          {
            id: "landed",
            label: "16 landed",
            role: "hero",
            points: [
              { x: "2026-07-01", y: 4 },
              { x: "2026-07-30", y: 16 },
            ],
          },
        ],
      },
    },
    {
      kind: "matrix",
      label: "Co-change",
      spec: {
        labels: ["cart", "checkout", "pricing", "catalog"],
        cells: [
          { a: 0, b: 1, value: 14 },
          { a: 1, b: 2, value: 6 },
          { a: 2, b: 3, value: 9 },
        ],
        marks: [{ a: 0, b: 1, label: "cart and checkout" }],
      },
    },
  ],
  provenance: ["4 modules censused"],
}

describe("a chart-bearing artifact is publishable", () => {
  it("passes scripts/validate.mjs with no errors", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "steward-publishable-"))
    const data = path.join(dir, "data.json")
    const html = path.join(dir, "index.html")
    writeFileSync(data, JSON.stringify(doc))

    execFileSync(process.execPath, [render, data, html], { stdio: "pipe" })
    const report = execFileSync(process.execPath, [validate, html], {
      encoding: "utf8",
      stdio: "pipe",
    })

    // The message matters as much as the count: a failure here should say
    // which class, so whoever reads it knows whether the kit or a routine
    // owns the fix.
    expect(report).toContain("0 error(s)")
    expect(report).not.toMatch(/role-mark|mark-line|role-axis/)
  }, 60_000)
})
