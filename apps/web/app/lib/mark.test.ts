import { readFile } from "node:fs/promises"

import { describe, expect, it } from "vitest"

import {
  buildMark,
  CHIP_INSET,
  chipTransform,
  CHIP_TILT,
  drawnFeatures,
  MARK_BUTTONS,
  MARK_MINIMUM,
  MARK_RATIOS,
  MARK_SPAN,
  markSpan,
  MASK_FILL,
  MASK_INSET,
  MASK_SAFE,
  squirclePath,
} from "./mark.ts"

/**
 * The mark's **size** contract (ADR-0053, amended by ADR-0055), the half its
 * colour contract cannot see.
 *
 * `theme.test.ts` holds every boundary the mark draws at ≥3:1. That is
 * necessary and not sufficient: contrast says two regions differ, never that
 * either is big enough to be a region. The old cut shipped a `notch` of 0.65px
 * and a `cinch` of 0.17px on the favicon — named ratios that at the size people
 * see the mark were not drawing anything, while every contrast assertion
 * passed. So the floor is declared in **device pixels at 1×** (`MARK_MINIMUM`)
 * and every drawn feature is measured against it.
 *
 * The mark is a real bow tie again (ADR-0055): a knot and two buttons come
 * back. They are safe not because they are large but because the mark is a
 * **single ink** — the knot and the buttons carry the same fill as the wings,
 * so no interior edge has to hold a contrast the way the old coloured knot did.
 * What still has to hold is that each is a *region* at the minimum, which is
 * what this suite reads off `drawnFeatures`.
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
      // Zero passes: a feature either survives at the declared minimum or it is
      // **not drawn**. What is not honest is the third state the old mark
      // shipped in — a ratio named, argued for, and rendering as nothing. The
      // buttons clear the floor even at 16px (1.2px), so they are kept.
      const tooSmall = Object.entries(drawnFeatures())
        .filter(([, units]) => units > 0)
        .map(([name, units]) => [name, units * scale] as const)
        .filter(([, px]) => px < 1)
        .map(([name, px]) => `${name} ${px.toFixed(2)}px`)
      expect(tooSmall).toEqual([])
    })
  }

  it("the mark is a bow tie: two wings and a knot, in one ink", () => {
    // ADR-0055. The knot is a third *shape*, but not a third *colour*: it
    // carries the wings' fill, so the gaps around it are ground, not an
    // ink-against-ink edge. That is what makes it safe where ADR-0053's
    // coloured knot, measured at 1.40:1 on the favicon, was not.
    const mark = buildMark()
    expect(Object.keys(mark)).toEqual(["wingL", "wingR", "knot"])
    // Two buttons, below the bow — the shirt studs.
    expect(MARK_BUTTONS).toHaveLength(2)
    expect(MARK_BUTTONS.every((b) => b.cy > 32)).toBe(true)
  })

  it("the knot bridges the wings without touching them", () => {
    // The wing throats sit `inner` units off centre; the knot is a square of
    // side `knot`, so it reaches `knot/2`. A hair of ground stays between them
    // — the fold detail the reference draws — and closes into one mass only as
    // the mark shrinks.
    expect(MARK_RATIOS.knot / 2).toBeLessThan(MARK_RATIOS.inner)
  })

  it("the construction is symmetric, so the wings cannot drift apart", () => {
    // The right wing is the left one mirrored through the tile's centre — a
    // consequence of `wingPath` taking a direction, not two strings kept in
    // step by hand.
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

  it("the bow is wider than tall and fills the tile's width", () => {
    // A bow tie reads as a bow by being wide and pinched, not square. It spans
    // most of the tile's width so the icon does not read as small beside other
    // products'.
    expect(MARK_RATIOS.bowW).toBeGreaterThan(MARK_RATIOS.bowH)
    expect(MARK_RATIOS.bowW / MARK_SPAN.chip).toBeGreaterThanOrEqual(0.83)
  })

  it("the glyph crop follows the bow, so a redraw cannot clip itself", () => {
    // The crop width tracks the bow plus its air; a wider bow widens its own
    // crop rather than being sliced by a literal.
    expect(markSpan("glyph")).toBe(MARK_RATIOS.bowW + 4)
  })

  it("the tile is a closed superellipse, not a rounded rect", () => {
    const d = squirclePath()
    expect(d.startsWith("M ")).toBe(true)
    expect(d.endsWith(" Z")).toBe(true)
    const corner = d.match(/M ([\d.]+) ([\d.]+)/)
    expect(Number(corner?.[1])).toBeGreaterThan(63)
  })
})

/**
 * The mark's **placement** contract, the third thing neither of the other two
 * could see. `mark.test.ts` held every feature above a pixel and `theme.test.ts`
 * every boundary above 3:1, and between them the old mark still shipped three
 * different chips. Neither suite asked *where* the bow sits on its tile — a
 * whole-shape property, and the one a person notices first.
 */
describe("every chip places the mark the same way", () => {
  /** Half the bow's span after a given inset, in tile units. */
  const reach = (inset: number) => (MARK_RATIOS.bowW * inset) / 2

  it("the bow is level: the tile is square and the bow is symmetric", () => {
    expect(CHIP_TILT).toBe(0)
    expect(chipTransform()).not.toMatch(/rotate/)
  })

  it("the chip keeps real ground around the bow, not a near miss", () => {
    // At full size the bow reaches 27 of 32 units — five of clearance. Inset,
    // it keeps enough ground to read as placed rather than crammed.
    expect(MARK_SPAN.chip / 2 - reach(1)).toBe(5)
    expect(MARK_SPAN.chip / 2 - reach(CHIP_INSET)).toBeGreaterThanOrEqual(6)
  })

  it("the maskable is padded for Android's crop and stays off the mask", () => {
    // The maskable is the Android adaptive icon: the launcher masks and crops
    // it and it sits beside other apps, so it takes the conventional keyline
    // padding, not the chip's full-bleed fill. The bow's tips reach MASK_FILL
    // of the safe zone — inside it with margin — and the bow fills *less* of the
    // canvas than the (uncropped) chip fills of its tile, so Steward is not
    // tighter than its neighbours. A detour to a bold fill read as cramped on a
    // real home screen.
    const safe = (MARK_SPAN.chip * MASK_SAFE) / 2
    expect(reach(MASK_INSET) / safe).toBeCloseTo(MASK_FILL, 3)
    expect(reach(MASK_INSET)).toBeLessThan(safe)
    expect(MASK_INSET).toBeLessThan(CHIP_INSET)
  })

  it("every shipped chip is the same drawing", async () => {
    // The generator and the component composed their own placements once, so
    // the landing page's chip and the browser tab's were different objects.
    // Assert on the artefacts, since that is where they diverged. The favicon
    // drops the buttons for its size, but the bow's placement — the transform —
    // is identical, which is what this holds.
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
