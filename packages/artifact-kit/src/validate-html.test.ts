import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { beforeAll, describe, expect, it } from "vitest"

import { renderArtifact } from "./render.tsx"

/**
 * The publish gate, exercised from both directions (ADR-0050).
 *
 * `validate.mjs` had no tests at all while it was 735 lines of selector
 * parsing, and ADR-0050 then made most of that unreachable: the kit compiles
 * the markup, so subgrid ancestry and media-query grammar are no longer things
 * an artifact can get wrong. Deleting a check is cheap and deleting it *too
 * far* is silent — a validator that passes everything looks exactly like a
 * validator with nothing left to catch.
 *
 * So each surviving check gets a probe that breaks one thing in an otherwise
 * valid render and asserts it fires. The clean render asserting zero of both
 * is the other half: it is what the 30 Tailwind `color-mix` false warnings
 * used to make impossible to state.
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, "..", "..", "..")
const kitDir = path.join(repoRoot, ".claude", "skills", "widget-artifact")
const validator = path.join(kitDir, "scripts", "validate.mjs")

/** Run the validator over one artifact string; never throws on exit 1. */
function validate(html: string): { errors: number; warnings: number } {
  const dir = mkdtempSync(path.join(tmpdir(), "steward-validate-"))
  const file = path.join(dir, "artifact.html")
  writeFileSync(file, html)
  let out = ""
  try {
    out = execFileSync(process.execPath, [validator, file], {
      encoding: "utf8",
    })
  } catch (e) {
    // Exit 1 is how it reports errors — the output is on the error object.
    const err = e as { stdout?: string }
    out = err.stdout ?? ""
  }
  const tally = out.match(/(\d+) error\(s\), (\d+) warning\(s\)/)
  if (!tally) throw new Error(`no tally line in validator output:\n${out}`)
  return { errors: Number(tally[1]), warnings: Number(tally[2]) }
}

let clean: string

beforeAll(() => {
  // The real stylesheet, because the class-coverage check reads it: a stub
  // would make every class in the render look unstyled.
  const css = readFileSync(path.join(kitDir, "kit", "kit.css"), "utf8")
  clean = renderArtifact(
    {
      slug: "example-probe",
      title: "Example probe",
      generatedAt: "2026-07-30T09:00:00Z",
      stat: { value: 3, label: "to file", tone: "attn" },
      blocks: [
        {
          kind: "queue",
          label: "Recommended",
          rows: [
            { id: "r1", title: "First finding", detail: "Why it matters." },
            { id: "r2", title: "Second finding" },
          ],
        },
      ],
      context: "## Where it stands\n\nProbe.\n\n## Ask me about\n\n- Anything.",
    },
    css,
  )
})

describe("a clean kit render", () => {
  it("passes with no errors and no warnings", () => {
    // Zero *warnings* is the assertion that matters. Before the palette check
    // was narrowed to inline styles, every artifact carried 30 of them —
    // Tailwind's `color-mix` fallbacks and alpha-suffixed palette hexes — and
    // noise at that level is indistinguishable from a real finding.
    expect(validate(clean)).toEqual({ errors: 0, warnings: 0 })
  })

  it("passes a render with no data-fit-item anywhere in the markup", () => {
    // tiers.css is @import-ed into every compiled stylesheet unconditionally,
    // and it carries the attribute selector `[data-fit-list] > thead` — so a
    // whole-file substring scan for "data-fit-list" is true on every render,
    // Throughput/prose-only ones included. A `prose` block (and `throughput`,
    // repo-stats's band) deliberately has no `data-fit-item` anywhere — there
    // is nothing to trim — so this must not trip the fit-wiring check.
    const css = readFileSync(path.join(kitDir, "kit", "kit.css"), "utf8")
    const noFitMarkup = renderArtifact(
      {
        slug: "prose-only-probe",
        title: "Prose-only probe",
        generatedAt: "2026-07-30T09:00:00Z",
        blocks: [
          {
            kind: "prose",
            items: [{ id: "p1", body: "Nothing here needs trimming." }],
          },
        ],
      },
      css,
    )
    expect(validate(noFitMarkup).errors).toBe(0)
  })
})

describe("errors", () => {
  const breaks: [string, (html: string) => string][] = [
    [
      "the kit stamp is missing",
      (h) => h.replace(/<meta name="steward-kit-version"[^>]*>/, ""),
    ],
    [
      "the kit stamp is not semver",
      (h) => h.replace(/(steward-kit-version" content=")[^"]*/, "$1v1"),
    ],
    [
      "a resource is loaded over the network",
      (h) => h.replace("<body", '<img src="https://example.test/x.png"><body'),
    ],
    [
      "a script calls a network API",
      (h) => h.replace("</body", '<script>fetch("/x")</script></body'),
    ],
    [
      "a class has no rule in the stylesheet",
      (h) => h.replace("<main", '<main class="totally-invented-class"'),
    ],
    [
      "a fit list holds no trimmable unit",
      (h) => h.split("data-fit-item").join("data-inert-item"),
    ],
  ]
  for (const [what, breakIt] of breaks) {
    it(`rejects when ${what}`, () => {
      expect(validate(breakIt(clean)).errors).toBeGreaterThan(0)
    })
  }
})

describe("warnings", () => {
  const smells: [string, (html: string) => string][] = [
    [
      "an inline style paints off-palette",
      (h) => h.replace("<main", '<main style="color:#ff0000"'),
    ],
    [
      "static text says “your”",
      (h) => h.replace("</footer>", "</footer><p>your queue</p>"),
    ],
    [
      "there is no briefing to hand to Claude",
      (h) =>
        h.replace(/<script[^>]*id="steward-context"[\s\S]*?<\/script>/, ""),
    ],
  ]
  for (const [what, smell] of smells) {
    it(`warns, but still publishes, when ${what}`, () => {
      const { errors, warnings } = validate(smell(clean))
      expect(warnings).toBeGreaterThan(0)
      expect(errors).toBe(0)
    })
  }
})
