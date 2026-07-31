/**
 * The mark's geometry — the one source every surface draws from.
 *
 * The bow tie used to be hand-tuned path data pasted into six places at once
 * (`logo.tsx`, `favicon.svg`, `scripts/icon*.svg`, both wordmarks), each
 * carrying a comment begging the next editor to keep them in sync. They are
 * now all generated from this module by `node scripts/gen-brand.ts`, so the
 * geometry cannot drift: there is one bow, and every mirror is a render of it.
 *
 * ## The construction
 *
 * Ratios on a 64-unit tile, in `MARK_RATIOS`, built into path data by
 * `buildMark`. Nothing here is eyeballed — the left wing is derived and the
 * right is its mirror, so symmetry is a property of the construction rather
 * than something to check for.
 *
 * This module used to *describe* six ratios in this comment while holding
 * three literal path strings underneath, which meant the numbers could not be
 * measured, varied or tested — only re-typed. They are data now, and the two
 * gates in `theme.test.ts` read them directly (ADR-0053).
 *
 * | ratio       |         | why                                             |
 * | ----------- | ------- | ----------------------------------------------- |
 * | bow         | 56 × 28 | exactly 2:1, and 88% × 44% of the tile          |
 * | waist       | 10 / 28 | the pinch; this is what makes it read as a bow  |
 * | cross       | 4       | each wing runs 4 past centre, so the two overlap |
 * | notch       | 5       | the butterfly bite in the outer edge            |
 * | corner      | 4       | the flared tip's rounding                       |
 * | sweep, puff | —       | where the top edge's control sits, as fractions |
 * | notchSpread | 6.5     | how far apart the notch's two controls sit      |
 * | field       | 56 / 64 | the tie's share of the tile — derived, not set  |
 *
 * `sweep`, `puff` and `notchSpread` carried no name until the construction
 * became data: they were digits inside `"M 33 28 Q 22.65 23.74 …"` and nothing
 * could see them, let alone test them.
 *
 * Every length here clears one device pixel at the declared minimum
 * (`MARK_MINIMUM`), which is what `mark.test.ts` holds. The previous cut did
 * not: its `notch` was 0.65px on the favicon, its `corner` 0.45px and its
 * `cinch` 0.17px — three named ratios, two of them chosen by a failing test,
 * that at the size people actually see the mark were drawing nothing at all.
 *
 * Neither fold creases nor a tile bevel are drawn. Both were tried at every
 * weight that read as material and every one of them also read as damage — a
 * scratch across the cloth, a white bar floating over the tile.
 */

/** The tile the mark is constructed on. Every number below is in these units. */
export const MARK_TILE = 64

/** The air the glyph crop leaves around the ink, per side. */
const GLYPH_AIR = 2

/**
 * The bare glyph's tight crop: the bow's own bounding box plus `GLYPH_AIR` on
 * every side, centred on the tile so the tie sits on the line-box centre next
 * to the wordmark.
 *
 * Derived rather than written down. As a literal (`"8 19 48 26"`) it was
 * correct only for a 44×22 bow, and silently cropped any other — which is a
 * trap for exactly the redraw this file is built to allow.
 */
export function glyphViewBox(r: MarkRatios = MARK_RATIOS): string {
  const w = r.bowW + 2 * GLYPH_AIR
  const h = r.bowH + 2 * GLYPH_AIR
  return `${MARK_TILE / 2 - w / 2} ${MARK_TILE / 2 - h / 2} ${w} ${h}`
}

/** The chip's crop — the full tile. */
export const CHIP_VIEWBOX = "0 0 64 64"

/** Every number the bow is built from, in tile units (or as a fraction). */
export type MarkRatios = {
  /** The bow's full span, tip to tip. */
  bowW: number
  /** The bow's height at the flared tips. */
  bowH: number
  /** The pinch at the centre — what makes the silhouette read as a bow. */
  waist: number
  /** How far each wing reaches past the tile's centre, so the two overlap. */
  cross: number
  /** Depth of the butterfly bite in the outer edge. */
  notch: number
  /** Rounding at the flared tip's two corners. */
  corner: number
  /** Where the top edge's control sits along the tip-to-waist run, 0–1. */
  sweep: number
  /** How far that control lifts from the waist toward the tip, 0–1. */
  puff: number
  /** How far apart the notch's two controls sit, either side of centre. */
  notchSpread: number
}

/**
 * The bow.
 *
 * **There is no knot** (ADR-0053). The mark was three shapes for a year and
 * the third one was the whole problem: a 10×14 block whose only job was to be
 * a different colour from the cloth it lay on, at a size where that boundary
 * was 4px wide and 1.40:1. Every attempt to save it made it worse — opening
 * the waist to 59% turned the bow into a slab with a letterbox slot, and
 * bunching the cloth behind it turned it into a belt buckle.
 *
 * Dropping it does not solve that problem, it deletes it: with one shape
 * there is no interior edge to hold at 3:1, no feature to keep above a pixel,
 * and nothing to measure clearance for. The waist pinch carries the read on
 * its own — which `gen-brand.ts` had already argued for the one-colour cut,
 * in as many words: *"the knot is a colour relationship, not a shape the
 * outline depends on. At one ink it simply stops being drawn, and nothing is
 * lost."* That was true at every ink, not just one.
 *
 * Gone with it: `knotW`, `knotH`, `knotCorner`, `cinch`, and the `gather` /
 * `pinchGap` pair that existed only to enclose it. `tuck` is now `cross`,
 * measured from the centre rather than from the knot's edge, because there is
 * no knot's edge.
 *
 * `field` is not here either: the tie's share of the tile is
 * `bowW / MARK_TILE`, a consequence of the bow's span rather than a knob of
 * its own. Naming it separately would let the two disagree.
 */
export const MARK_RATIOS: MarkRatios = {
  // 56×28 holds the 2:1 the bow has always been while covering 88% × 44% of
  // the tile, against 69% × 34% before. A 2:1 shape in a square can never use
  // more than half of it, which is why the icon read as small next to other
  // products' — and why the tile, not the bow, is where the rest of the
  // presence had to come from.
  bowW: 56,
  bowH: 28,
  waist: 10,
  cross: 4,
  notch: 5,
  corner: 4,
  sweep: 0.488,
  puff: 0.609,
  notchSpread: 6.5,
}

/**
 * The chip's bow is turned, because a bow tie is worn rather than laid flat.
 *
 * Twelve degrees: enough to read as tied by a person, not so much that the
 * silhouette loses its horizon at 16px. Only the chip turns — the bare glyph
 * in chrome sits on a text baseline next to a word and has to stay level.
 */
export const CHIP_TILT = 12

/**
 * A cubic whose two control points sit `d` off its chord bows out by exactly
 * ¾·d at the midpoint, so a depth anyone can name (`notch`, `cinch`) converts
 * to a control offset by 4/3. Without this the depths in `MARK_RATIOS` would
 * be control offsets — numbers that mean nothing to the eye measuring them.
 */
const CTL = 4 / 3

const C = MARK_TILE / 2

/** Two decimals, and no `-0`: the form the path data has always been in. */
function n(v: number): string {
  const r = Math.round(v * 100) / 100
  return String(r === 0 ? 0 : r)
}

type Pt = [number, number]
type Quad = { p0: Pt; p1: Pt; p2: Pt }

/** Where a wing's key x-positions land, for a given side. */
function wingAnchors(r: MarkRatios, dir: 1 | -1) {
  const outer = C - (dir * r.bowW) / 2
  // The inner edge runs `cross` units past the tile's centre, so the two
  // wings overlap each other and the silhouette is one continuous mass rather
  // than two shapes meeting on a seam. At the old overlap of two units the
  // join was half a pixel at 16px and any antialiasing showed the ground
  // through the middle; eight units is two pixels there.
  const inner = C + dir * r.cross
  const cornerX = outer + dir * r.corner
  return { outer, inner, cornerX }
}

/**
 * The wing's top edge, inner end first.
 *
 * One quadratic: from the waist at the centre out to the flared tip. It was
 * briefly four, to bunch cloth behind a knot that no longer exists.
 */
function topEdge(r: MarkRatios, dir: 1 | -1): Quad[] {
  const { inner, cornerX } = wingAnchors(r, dir)
  const puffY = r.waist / 2 + r.puff * (r.bowH / 2 - r.waist / 2)
  return [
    {
      p0: [inner, C - r.waist / 2],
      p1: [inner - dir * r.sweep * Math.abs(cornerX - inner), C - puffY],
      p2: [cornerX, C - r.bowH / 2],
    },
  ]
}

/**
 * One wing. `dir` is 1 for the left and −1 for the right, which is the whole
 * of the mirroring — there is no second copy of this to keep in step.
 */
function wingPath(r: MarkRatios, dir: 1 | -1): string {
  const { outer, cornerX } = wingAnchors(r, dir)
  const yTop = C - r.bowH / 2
  const yBot = C + r.bowH / 2
  const notchX = outer + dir * r.notch * CTL
  const top = topEdge(r, dir)
  // The bottom edge is the top one reflected through the tile's centre line,
  // walked back inward.
  const flip = (p: Pt): Pt => [p[0], 2 * C - p[1]]
  const bottom = [...top]
    .reverse()
    .map((q) => ({ p0: flip(q.p2), p1: flip(q.p1), p2: flip(q.p0) }))
  const draw = (q: Quad) =>
    `Q ${n(q.p1[0])} ${n(q.p1[1])} ${n(q.p2[0])} ${n(q.p2[1])}`
  return [
    `M ${n(top[0].p0[0])} ${n(top[0].p0[1])}`,
    ...top.map(draw),
    `Q ${n(outer)} ${n(yTop)} ${n(outer)} ${n(yTop + r.corner)}`,
    `C ${n(notchX)} ${n(C - r.notchSpread)} ${n(notchX)} ${n(C + r.notchSpread)} ${n(outer)} ${n(yBot - r.corner)}`,
    `Q ${n(outer)} ${n(yBot)} ${n(cornerX)} ${n(yBot)}`,
    ...bottom.map(draw),
    "Z",
  ].join(" ")
}

/**
 * The two wings for a given set of ratios.
 *
 * Taking ratios as an argument rather than reading the constant is what makes
 * a proof sheet possible: `scripts/mark-sheet.ts` renders several cuts side by
 * side by calling this with each, so a redraw is judged against real pixels
 * instead of described in prose (ADR-0054).
 */
export function buildMark(r: MarkRatios = MARK_RATIOS): {
  wingL: string
  wingR: string
} {
  return { wingL: wingPath(r, 1), wingR: wingPath(r, -1) }
}

/**
 * The chip's tile as a **superellipse** — the continuous-curvature squircle.
 *
 * A rect's `rx` draws a circular arc, which meets the straight edge at a
 * curvature discontinuity: the corner starts turning all at once, and the eye
 * reads the join even when it cannot name it. Every platform icon grid uses a
 * continuous curve instead, and it is most of what separates a tile that looks
 * drawn from one that looks defaulted. `n = 5` sits near Apple's.
 *
 * Emitted as a sampled polyline rather than a Bézier fit: the tile is
 * generated into static SVGs anyway, the sampling error at 128 steps is far
 * under a device pixel at any size the mark ships at, and a polyline cannot
 * drift from the curve it approximates the way a hand-fitted control point
 * can.
 */
export function squirclePath(
  size: number = MARK_TILE,
  exp = 5,
  steps = 128,
): string {
  const a = size / 2
  const pts: string[] = []
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * 2 * Math.PI
    const ct = Math.cos(t)
    const st = Math.sin(t)
    pts.push(
      `${i ? "L" : "M"} ${n(a + a * Math.sign(ct) * Math.abs(ct) ** (2 / exp))} ${n(a + a * Math.sign(st) * Math.abs(st) ** (2 / exp))}`,
    )
  }
  return `${pts.join(" ")} Z`
}

/**
 * The smallest size each framing is declared to survive, in **device** pixels
 * at 1×, measured across the framing's own viewBox width.
 *
 * Device pixels, not CSS pixels: a floor that assumes a 2× display is not a
 * floor. The `.ico` frames are packed at 16, Windows at 100% and every
 * external monitor render there, and that is where the fine work disappears.
 */
export const MARK_MINIMUM = { chip: 16, glyph: 20 } as const

/**
 * Units across, per framing — the chip shows the whole tile, the glyph crops
 * to the bow. This is the divisor that turns a declared minimum into pixels
 * per unit, and it is why the two framings have different floors: at 16px the
 * chip spends a third of its width on tile around the bow, so its units are
 * smaller than the glyph's at 20px.
 */
export function markSpan(
  framing: "chip" | "glyph",
  r: MarkRatios = MARK_RATIOS,
): number {
  return framing === "chip" ? MARK_TILE : r.bowW + 2 * GLYPH_AIR
}

export const MARK_SPAN = {
  chip: markSpan("chip"),
  glyph: markSpan("glyph"),
} as const

/**
 * The drawn features a viewer can lose, in tile units.
 *
 * `sweep` and `puff` are absent because they are fractions positioning a
 * control point, and `notchSpread` because it places one rather than sizing
 * anything — none of the three is a thing on screen with a width. Everything
 * that *is* has to survive `MARK_MINIMUM` (ADR-0053).
 */
export function drawnFeatures(
  r: MarkRatios = MARK_RATIOS,
): Record<string, number> {
  return {
    bowW: r.bowW,
    bowH: r.bowH,
    waist: r.waist,
    cross: r.cross,
    notch: r.notch,
    corner: r.corner,
  }
}

const MARK = buildMark()

/** The shipped glyph crop. Callers rendering another cut want `glyphViewBox`. */
export const GLYPH_VIEWBOX = glyphViewBox()

export const WING_L = MARK.wingL
export const WING_R = MARK.wingR

/**
 * The two wings, which overlap each other at the centre by `2 × cross`.
 *
 * They carry the same fill everywhere the mark is drawn, so the overlap is
 * invisible and the silhouette is one mass. There is no third path: the knot
 * is not drawn (ADR-0053).
 */
export const MARK_PATHS = [WING_L, WING_R] as const

/**
 * The chip's tile gradient axis — top-left to bottom-right across the tile.
 *
 * The diagonal is not a style choice. The two stops fail on opposite grounds:
 * `#d65d0e` clears 3:1 on every dark surface and drops to 2.72 on a pale one,
 * `#af3a03` clears every light surface and drops to 2.41 on a dark one. Run
 * diagonally, both stops touch the perimeter, so on all 32 grounds measured —
 * Steward's 14 themes twice over, plus Chrome's and GitHub's light and dark
 * chrome — at least one part of the tile's edge always clears the floor. That
 * is what lets the chip drop its border.
 */
export const TILE_GRADIENT = { x1: 6, y1: 0, x2: 58, y2: 64 } as const

/**
 * The logotype: "Steward" set in Geist Mono 600 at 40px, tracking −1, and
 * converted to outlines.
 *
 * Outlines rather than a live `<text>` node because the wordmark's audience
 * is GitHub's image context, which cannot load a webfont — live text would
 * render in whatever mono the viewer happens to have and the lockup would
 * stop being the brand. Positioned at a baseline of y=46.5, which is the
 * measured optical alignment that centres the word's cap band on the tile.
 */
export const LOGOTYPE =
  "M98.30 47.14Q95.15 47.14 92.86 45.90Q90.56 44.66 89.25 42.41Q87.94 40.16 87.70 37.07L92.70 36.80Q92.97 38.72 93.73 40.04Q94.50 41.35 95.70 42.00Q96.90 42.66 98.52 42.66Q100.04 42.66 101.10 42.26Q102.15 41.85 102.71 41.06Q103.26 40.26 103.26 39.12Q103.26 37.93 102.71 37.07Q102.15 36.21 100.72 35.49Q99.28 34.76 96.60 34.04Q93.72 33.24 91.88 32.23Q90.03 31.22 89.16 29.70Q88.30 28.17 88.30 25.89Q88.30 23.35 89.44 21.45Q90.58 19.55 92.74 18.50Q94.91 17.46 97.96 17.46Q100.96 17.46 103.09 18.60Q105.22 19.74 106.44 21.84Q107.66 23.93 107.91 26.82L102.87 27.08Q102.66 25.52 102.03 24.36Q101.40 23.20 100.34 22.57Q99.27 21.94 97.77 21.94Q95.74 21.94 94.54 22.94Q93.34 23.93 93.34 25.60Q93.34 26.73 93.87 27.50Q94.40 28.26 95.73 28.86Q97.06 29.45 99.43 30.12Q102.74 31.01 104.68 32.22Q106.62 33.43 107.46 35.08Q108.30 36.72 108.30 39.00Q108.30 41.45 107.08 43.29Q105.86 45.12 103.62 46.13Q101.38 47.14 98.30 47.14Z M123.99 46.50Q120.56 46.50 118.92 44.92Q117.28 43.35 117.28 40.08V20.13H122.02V39.73Q122.02 41.21 122.72 41.93Q123.42 42.64 124.86 42.64H130.12V46.50ZM110.84 29.00V25.14H130.12V29.00Z M144.14 46.98Q141.14 46.98 138.88 45.61Q136.62 44.24 135.37 41.73Q134.12 39.21 134.12 35.82Q134.12 32.48 135.36 29.97Q136.61 27.47 138.84 26.06Q141.06 24.66 144.05 24.66Q146.94 24.66 149.15 26.02Q151.37 27.39 152.62 29.91Q153.88 32.43 153.88 35.91V37.15H139.02Q139.22 39.88 140.60 41.30Q141.98 42.72 144.22 42.72Q145.92 42.72 147.06 41.92Q148.20 41.12 148.64 39.79L153.47 40.13Q152.47 43.32 150.08 45.15Q147.68 46.98 144.14 46.98ZM139.06 33.69H148.78Q148.57 31.27 147.28 30.09Q145.99 28.92 144.02 28.92Q141.99 28.92 140.70 30.13Q139.41 31.34 139.06 33.69Z M159.66 46.50 155.64 25.14H160.47L162.70 40.36L165.22 28.20H168.78L171.30 40.36L173.53 25.14H178.36L174.36 46.50H169.45L167.00 35.00L164.55 46.50Z M187.04 46.98Q185.06 46.98 183.44 46.26Q181.82 45.54 180.88 44.20Q179.94 42.86 179.94 41.03Q179.94 38.31 181.64 36.80Q183.34 35.29 186.53 34.63L193.20 33.22Q193.20 30.96 192.25 29.80Q191.30 28.63 189.31 28.63Q187.50 28.63 186.50 29.50Q185.50 30.36 185.16 31.84L180.24 31.54Q180.84 28.44 183.21 26.55Q185.58 24.66 189.25 24.66Q193.62 24.66 195.78 26.98Q197.94 29.31 197.94 33.46V41.43Q197.94 42.21 198.24 42.51Q198.54 42.80 199.12 42.80H200.16V46.50Q199.92 46.54 199.38 46.59Q198.83 46.64 198.27 46.64Q196.75 46.64 195.69 46.12Q194.63 45.60 194.08 44.55Q193.53 43.50 193.47 41.96H194.08Q193.86 43.38 192.92 44.53Q191.97 45.68 190.46 46.33Q188.94 46.98 187.04 46.98ZM187.89 43.28Q189.62 43.28 190.80 42.67Q191.98 42.06 192.59 40.91Q193.20 39.76 193.20 38.20V36.74L187.87 37.86Q186.18 38.20 185.50 38.88Q184.83 39.56 184.83 40.74Q184.83 41.93 185.63 42.61Q186.42 43.28 187.89 43.28Z M204.12 46.50V42.64H211.47L209.38 44.71V26.91L211.47 29.00H204.12V25.14H212.98L213.42 31.33L213.00 31.00Q213.27 28.09 214.59 26.62Q215.91 25.14 218.42 25.14H223.08V29.11H218.70Q217.17 29.11 216.16 29.66Q215.14 30.22 214.63 31.30Q214.12 32.39 214.12 34.02V44.71L212.06 42.64H220.71V46.50Z M233.99 46.98Q231.34 46.98 229.38 45.64Q227.42 44.31 226.35 41.81Q225.28 39.32 225.28 35.82Q225.28 32.32 226.35 29.83Q227.42 27.33 229.38 26.00Q231.34 24.66 233.99 24.66Q235.78 24.66 237.17 25.30Q238.57 25.94 239.49 27.00Q240.42 28.05 240.74 29.32L240.30 30.21V18.10H245.04V46.50H240.56L240.33 41.11L240.91 41.92Q240.48 43.37 239.52 44.52Q238.57 45.67 237.18 46.32Q235.78 46.98 233.99 46.98ZM235.10 42.72Q236.69 42.72 237.86 41.90Q239.03 41.08 239.67 39.53Q240.30 37.98 240.30 35.82Q240.30 33.61 239.67 32.07Q239.03 30.52 237.86 29.72Q236.68 28.92 235.06 28.92Q232.74 28.92 231.48 30.72Q230.21 32.52 230.21 35.82Q230.21 39.09 231.48 40.91Q232.74 42.72 235.10 42.72Z"

/** The lockup's canvas: the 64-unit chip, then the word. */
export const WORDMARK_VIEWBOX = "0 0 300 64"
