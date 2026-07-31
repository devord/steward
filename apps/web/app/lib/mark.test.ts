import { readFile } from "node:fs/promises"

import { describe, expect, it } from "vitest"

import {
  buildMark,
  CHIP_INSET,
  chipTransform,
  CHIP_TILT,
  drawnFeatures,
  MARK_MINIMUM,
  MARK_RATIOS,
  MARK_SPAN,
  markSpan,
  MASK_INSET,
  MASK_SAFE,
  squirclePath,
} from "./mark.ts"

/**
 * The mark's **size** contract (ADR-0053), the half its colour contract
 * cannot see.
 *
 * `theme.test.ts` holds every boundary the mark draws at ≥3:1. That is
 * necessary and it is not sufficient: contrast says two regions differ, never
 * that either is big enough to be a region. The mark shipped with a `notch` of
 * 0.65px and a `cinch` of 0.17px on the favicon — named ratios, argued for in
 * DESIGN.md, that at the size people actually see the mark were not drawing
 * anything at all. Every contrast assertion passed the whole time.
 *
 * So the floor is declared in **device pixels at 1×** (`MARK_MINIMUM`) and
 * every drawn feature is measured against it.
 */

const framings = ["chip", "glyph"] as const

/** Device pixels one tile unit occupies, in a framing at its declared floor. */
function pxPerUnit(framing: (typeof framings)[number]): number {
  return MARK_MINIMUM[framing] / MARK_SPAN[framing]
}

describe("the mark survives its declared minimum", () => {
  for (const framing of framings) {
    const scale = pxPerUnit(framing)
    const min = MARK_MINIMUM[framing]

    it(`${framing} @ ${min}px: every drawn feature ≥ 1 device pixel`, () => {
      // Zero passes: a feature either survives at the declared minimum or it
      // is **not drawn**, and those are both honest answers. What is not
      // honest is the third state the mark shipped in — a `cinch` of 0.7
      // units carried in the path data, named in the comment table, argued
      // for in DESIGN.md, and rendering as 0.17px of nothing.
      const tooSmall = Object.entries(drawnFeatures())
        .filter(([, units]) => units > 0)
        .map(([name, units]) => [name, units * scale] as const)
        .filter(([, px]) => px < 1)
        .map(([name, px]) => `${name} ${px.toFixed(2)}px`)
      expect(tooSmall).toEqual([])
    })
  }

  it("the bow is one shape — there is no interior edge to hold", () => {
    // The whole legibility argument (ADR-0053). Two paths, both carrying the
    // same fill wherever the mark is drawn, so the only contrast boundary the
    // mark has is against its ground. A third path here would reintroduce the
    // ink-against-ink edge that measured 1.40:1 on the favicon while every
    // test in the suite was green.
    const mark = buildMark()
    expect(Object.keys(mark)).toEqual(["wingL", "wingR"])
  })

  it("the wings overlap, so the silhouette is one mass", () => {
    // Each wing runs `cross` units past the centre, so the join is 2 × cross
    // wide. Below a device pixel of overlap, antialiasing on the two edges
    // can show the ground straight through the middle of the mark.
    const overlapPx = 2 * MARK_RATIOS.cross * pxPerUnit("chip")
    expect(overlapPx).toBeGreaterThanOrEqual(1)
  })

  it("the construction is symmetric, so the wings cannot drift apart", () => {
    // The right wing is the left one mirrored through the tile's centre. This
    // is the property that used to be maintained by typing two path strings
    // carefully; it is now a consequence of `wingPath` taking a direction.
    const { wingL, wingR } = buildMark()
    const xs = (d: string) =>
      d
        .split(/[A-Z ,]+/)
        .filter(Boolean)
        .map(Number)
        .filter((_, i) => i % 2 === 0)
    const mirrored = xs(wingL).map((x) => Math.round((64 - x) * 100) / 100)
    expect(xs(wingR)).toEqual(mirrored)
  })

  it("the bow covers more of the tile than it used to", () => {
    // The reason the icon read as small beside other products': a 2:1 shape
    // in a square tile can never cover more than half of it, and this one was
    // covering 69% × 34%. The proportion is kept; the scale is not.
    expect(MARK_RATIOS.bowW / MARK_SPAN.chip).toBeGreaterThanOrEqual(0.85)
    expect(MARK_RATIOS.bowW / MARK_RATIOS.bowH).toBeCloseTo(2, 2)
  })

  it("the glyph crop follows the bow, so a redraw cannot clip itself", () => {
    // `GLYPH_VIEWBOX` was a literal correct only for a 44×22 bow. Derived, a
    // wider bow widens its own crop.
    expect(markSpan("glyph")).toBe(MARK_RATIOS.bowW + 4)
  })

  it("the tile is a closed superellipse, not a rounded rect", () => {
    const d = squirclePath()
    expect(d.startsWith("M ")).toBe(true)
    expect(d.endsWith(" Z")).toBe(true)
    // Fuller in the corners than a circular arc of the same box: at 45° a
    // superellipse sits further out than a circle inscribed in the square.
    const corner = d.match(/M ([\d.]+) ([\d.]+)/)
    expect(Number(corner?.[1])).toBeGreaterThan(63)
  })
})

/**
 * The mark's **placement** contract, the third thing neither of the other two
 * could see.
 *
 * `mark.test.ts` held every drawn feature above a device pixel and
 * `theme.test.ts` held every boundary above 3:1, and between them the mark
 * still shipped three different chips: the app's inset to `CHIP_INSET`, the
 * favicon and launcher icons at full size, the maskable at a hand-typed 0.82
 * that ignored the crop it was named for. Both suites were green, because
 * neither asks where the bow sits on its tile — a whole-shape property, and
 * the one a person notices first.
 */
describe("every chip places the bow the same way", () => {
  /** Half the bow's span after a given inset, in tile units. */
  const reach = (inset: number) => (MARK_RATIOS.bowW * inset) / 2

  it("the bow is level: the tile is square and the bow is symmetric", () => {
    expect(CHIP_TILT).toBe(0)
    expect(chipTransform()).not.toMatch(/rotate/)
  })

  it("the chip keeps real ground around the bow, not a near miss", () => {
    // At full size the bow reaches 28 of 32 units — four units of clearance,
    // which at the declared 16px minimum is one device pixel. That is the
    // "margin" the shipped favicon had.
    expect(MARK_SPAN.chip / 2 - reach(1)).toBe(4)
    // Inset, it keeps enough ground to read as placed. Below ~6 units the tile
    // stops being ground and becomes an outline around the bow.
    expect(MARK_SPAN.chip / 2 - reach(CHIP_INSET)).toBeGreaterThanOrEqual(6)
  })

  it("the maskable bow holds the same share of what a launcher shows", () => {
    // The defect this constant exists to prevent: `CHIP_INSET` applied to a
    // full-bleed tile, 20% of which the launcher is about to crop, leaves the
    // bow filling ~90% of the safe zone. Measuring the share rather than the
    // scale is what keeps the two framings in step through a redraw.
    const safe = (MARK_SPAN.chip * MASK_SAFE) / 2
    expect(reach(MASK_INSET) / safe).toBeCloseTo(reach(CHIP_INSET) / 32, 3)
    expect(reach(MASK_INSET)).toBeLessThan(safe)
  })

  it("every shipped chip is the same drawing", async () => {
    // The generator and the component composed their own placements for a
    // year, so the landing page's chip and the browser tab's were different
    // objects built from the same geometry. Assert on the artefacts, since
    // that is where they diverged — a constant both files import proves
    // nothing about whether either one used it.
    const chips = [
      "../../public/favicon.svg",
      "../../../../brand/icon/steward-icon.svg",
    ]
    for (const rel of chips) {
      const svg = await readFile(new URL(rel, import.meta.url), "utf8")
      expect(svg, rel).toContain(`transform="${chipTransform()}"`)
    }
    const maskable = await readFile(
      new URL("../../../../scripts/icon-maskable.svg", import.meta.url),
      "utf8",
    )
    expect(maskable).toContain(`transform="${chipTransform(MASK_INSET)}"`)
  })
})
