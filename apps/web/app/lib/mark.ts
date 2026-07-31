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
 * Six ratios on a 64-unit tile. Nothing here is eyeballed — the left wing is
 * derived and the right is its mirror, so symmetry is a property of the
 * construction rather than something to check for.
 *
 * | ratio |            | why                                            |
 * | ----- | ---------- | ---------------------------------------------- |
 * | bow   | 44 × 22    | exactly 2:1                                    |
 * | knot  | 10 × 14    | 5:7, and the smallest of the three shapes      |
 * | waist | 8 / 22     | the pinch; this is what makes it read as a bow |
 * | tuck  | 6          | wings cross 2 past centre, under the knot      |
 * | notch | 2.6        | the butterfly bite in the outer edge           |
 * | field | 44 / 64    | the tie's share of the tile                    |
 *
 * Three of those were set by failures, not taste, and they are the reason the
 * mark survives its own test sheet:
 *
 * - **waist 8, not 11.** Held at half the tip height the silhouette broke
 *   into two lobes under blur — a dog bone, not a bow.
 * - **tuck 6, not 2.** At 2 the wings only reached the knot's edges, so the
 *   mark was two shapes leaning on a third to hide the seam between them —
 *   and any antialiasing seam, any half-pixel of rounding, showed the
 *   background straight through the middle. Crossing 2 units past centre
 *   makes the wings overlap each other, so the silhouette is one continuous
 *   mass and the knot is laid on top of solid cloth rather than plugging a
 *   gap. It is also why the one-colour cut can simply drop the knot.
 * - **notch 2.6, not 4.6.** Any deeper and each wing rounds off into its own
 *   separate blob.
 *
 * Neither fold creases nor a tile bevel are drawn. Both were tried at every
 * weight that read as material and every one of them also read as damage — a
 * scratch across the cloth, a white bar floating over the tile. The wing's
 * fold gradient carries the material alone, and one less trick survives one
 * more surface.
 */

/** The tile the mark is constructed on. Every number below is in these units. */
export const MARK_TILE = 64

/** Corner radius of the product-icon chip (0.219 × tile — the squircle). */
export const CHIP_RADIUS = 14

/**
 * The bare glyph's tight crop: the ink spans x 10–54, y 21–43, and this frames
 * it with two units of air, keeping the centre on y=32 so the tie sits on the
 * line-box centre next to the wordmark.
 */
export const GLYPH_VIEWBOX = "8 19 48 26"

/** The chip's crop — the full tile. */
export const CHIP_VIEWBOX = "0 0 64 64"

export const WING_L =
  "M 33 28 Q 22.65 23.74 11.8 21 Q 10 21 10 22.8 C 13.47 25.5 13.47 38.5 10 41.2 Q 10 43 11.8 43 Q 22.65 40.26 33 36 Z"

export const WING_R =
  "M 31 28 Q 41.35 23.74 52.2 21 Q 54 21 54 22.8 C 50.53 25.5 50.53 38.5 54 41.2 Q 54 43 52.2 43 Q 41.35 40.26 31 36 Z"

export const KNOT =
  "M 29.4 25 L 34.6 25 Q 37 25 37 27.4 C 36.07 29.6 36.07 34.4 37 36.6 Q 37 39 34.6 39 L 29.4 39 Q 27 39 27 36.6 C 27.93 34.4 27.93 29.6 27 27.4 Q 27 25 29.4 25 Z"

/**
 * Wings first, knot last. The wings overlap each other at the centre, and the
 * knot laps that seam — drawn in this order the fills never show a background
 * hairline between the shapes.
 */
export const MARK_PATHS = [WING_L, WING_R, KNOT] as const

/**
 * The fold gradient's axis, per wing: it runs from the flared tip down into
 * the gather at the knot, so the cloth is brightest where it catches the light
 * and deepest where it bunches.
 */
export const WING_GRADIENT = {
  left: { x1: 10, y1: 27, x2: 33, y2: 36 },
  right: { x1: 54, y1: 27, x2: 31, y2: 36 },
} as const

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
