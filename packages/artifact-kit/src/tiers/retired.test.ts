import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

/**
 * The injected stylesheet has to stay a superset of what published markup
 * names.
 *
 * The board injects the *current* `kit.css` over artifacts published months
 * ago (ADR-0050) — that is what lets a design fix reach the board without
 * rerunning every routine. It only holds while every class the published files
 * carry still has a rule behind it. Tailwind compiles what it can see, so the
 * moment a component stops writing a class it falls out of the output, and the
 * published artifact keeps the class on the element with nothing under it.
 *
 * That is not a revert to the old design, it is the absence of one. Measured
 * on the real corpus when `tier-detail:text-2xl` was retired: every published
 * hero sat at 44px at *every* size, including the 1384px full view where it
 * had been 24px. The step-down did not come back, it disappeared, and every
 * artifact already on the board got worse the moment the stylesheet shipped.
 *
 * `build.mjs` keeps a `RETIRED` list for exactly this. This pins it, because
 * the failure is invisible from source: the components are correct, the tests
 * pass, the new renders look right, and only the files nobody is re-rendering
 * break.
 */
const css = readFileSync(
  new URL(
    "../../../../.claude/skills/widget-artifact/kit/kit.css",
    import.meta.url,
  ),
  "utf8",
)

/** `.tier-detail\:text-2xl` — the escaped form Tailwind emits. */
const defines = (cls: string) =>
  new RegExp(`\\.${cls.replace(/[:.[\]]/g, (c) => `\\\\\\${c}`)}[,{\\s]`).test(
    css,
  )

describe("classes retired from source but live in published artifacts", () => {
  it.each([
    // The hero step-down, before StatTier and VerdictBand moved to the tier
    // that actually adds the lines the hero shares the tile with.
    "tier-detail:text-2xl",
    "tier-detail:text-xl",
    "tier-detail:text-left",
    // The stage strip, before it was gated on width as well as height.
    "taller:block",
    // The verdict hero's dot, and the flex gap that spaced it — dropped when
    // the row became inline flow and the dot stopped earning its width. A
    // published dot with no `size-[0.22em]` under it is not a smaller dot, it
    // is a full-width bar across the tile.
    "gap-[0.2em]",
    "size-[0.22em]",
  ])("keeps %s in the injected stylesheet", (cls) => {
    expect(defines(cls)).toBe(true)
  })

  it("still compiles the classes that replaced them", () => {
    // The other half: the retirement list must not be the only thing keeping
    // the stylesheet alive. These come from real component source.
    for (const cls of [
      "beyond-glance:text-2xl",
      "tier-detail:taller:block",
      // The verdict glyph, now set inline and centred on the cap band.
      "align-[-0.05em]",
      // The stat row's wrapped-line gap and its note measure.
      "beyond-glance:gap-y-1",
      "beyond-glance:max-w-[72ch]",
    ])
      expect(defines(cls), cls).toBe(true)
  })
})
