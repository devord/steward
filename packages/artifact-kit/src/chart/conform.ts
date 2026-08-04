import { PALETTE } from "../tokens/palette.ts"

/**
 * What a rendered chart has to be true of before it may reach the board
 * (ADR-0062).
 *
 * A routine names any `chartType` in flint's catalogue, so nothing upstream
 * can be trusted to have chosen a themed one — the safety has to come from
 * asserting on the output rather than from vetting the input.
 *
 * **On the emitted SVG, not on the spec.** This is the one thing the spike
 * overturned: colour enters a Vega render at three separate stages. Flint's
 * own output carried a single scheme reference (`tableau10`); the literals
 * appeared during `vl.compile`; and the gridline, tick and text colours came
 * from Vega's renderer defaults, present in neither spec. Checking before
 * compilation caught one colour of seven. The rendered file is the only place
 * every stage has already had its say.
 */

/** Every colour an artifact is allowed to paint, lowercased for comparison. */
const ALLOWED: ReadonlySet<string> = new Set(
  Object.values(PALETTE).map((c) => c.toLowerCase()),
)

/**
 * The artifact type floor (widget-standard §6). Vega derives axis and legend
 * sizes from the plot and will emit 10px and 11px unmodified.
 */
export const TYPE_FLOOR = 12

/**
 * Colours a renderer emits that carry no ink: a transparent fill, an explicit
 * none, and `currentColor` — which is *more* correct than a token, since it
 * inherits whatever the injected theme resolved.
 */
const INKLESS = new Set(["none", "transparent", "currentcolor", "inherit"])

const HEX = /#[0-9a-f]{3,8}\b/gi
const FUNCTIONAL = /\b(?:rgba?|hsla?|lab|lch|oklab|oklch|color)\([^)]*\)/gi
const FONT_SIZE = /font-size(?:\s*[:=]\s*|=)"?\s*([\d.]+)/gi
/**
 * Both spellings, and the attribute one has to stop at the closing quote
 * rather than at a `;`.
 *
 * Vega serializes the mono stack as `font-family="&quot;Geist Mono
 * Variable&quot;, ui-monospace, …"`, and `&quot;` contains a semicolon — so a
 * `[^;]` capture read the family as the literal string `&quot` and reported
 * every conforming chart as non-mono.
 */
const FONT_FAMILY = /font-family\s*=\s*"([^"]*)"|font-family\s*:\s*([^;"]+)/gi

/**
 * A reference that leaves the document.
 *
 * **Same-document fragments are exempt**, and that exemption is load-bearing
 * rather than a nicety: Vega clips every plot with `clip-path="url(#clipN)"`
 * and marks legend symbols with `xlink:href="#..."`. A blanket `url(`/`href=`
 * rejection therefore fails any chart with a clip — most of the catalogue —
 * for a rule about *network* access that a fragment never touches.
 *
 * So the test is for a scheme, a protocol-relative prefix, or a path: anything
 * the sandbox would have to fetch, and nothing it already has.
 */
const EXTERNAL =
  /(?:\b(?:xlink:)?href\s*=\s*"(?!#)|\burl\(\s*['"]?(?!#)|<image\b)/i

/** `&quot;` and friends, so a family reads as its text rather than its markup. */
function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
}

/**
 * Check one rendered chart. Returns the reasons it may not ship; empty means
 * it may.
 *
 * Deliberately string-level rather than parsed: this runs inside `render.mjs`,
 * which is a bundle executing as bare `node` in a routine environment with no
 * `node_modules`, and every property here is decidable on the text.
 */
export function conformChart(
  svg: string,
  at = "chart",
  budget?: number,
): string[] {
  const problems: string[] = []

  // The last line of defence for the type floor. Everything above holds the
  // *declared* sizes at 12px; this holds the *rendered* ones, because a render
  // wider than its column gets scaled down by the browser and takes its text
  // with it. A chart that will not fit is dropped rather than shrunk.
  if (budget !== undefined) {
    const width = Number(
      /<svg[^>]*\bwidth="(\d+(?:\.\d+)?)"/.exec(svg)?.[1] ?? 0,
    )
    if (width > budget)
      problems.push(
        `${at} renders ${width}px wide against a ${budget}px column — it would be scaled to fit, taking its type under the ${TYPE_FLOOR}px floor`,
      )
  }

  const literals = [
    ...(svg.match(HEX) ?? []),
    ...(svg.match(FUNCTIONAL) ?? []),
  ].map((c) => c.toLowerCase())
  const offPalette = [...new Set(literals)].filter(
    (c) => !ALLOWED.has(c) && !INKLESS.has(c),
  )
  if (offPalette.length)
    problems.push(
      `${at} paints ${offPalette.length} colour(s) outside the palette: ${offPalette
        .slice(0, 6)
        .join(", ")} — a colour the board's theme override cannot re-point`,
    )

  const small = [...svg.matchAll(FONT_SIZE)]
    .map((m) => Number(m[1]))
    .filter((n) => Number.isFinite(n) && n < TYPE_FLOOR)
  if (small.length)
    problems.push(
      `${at} sets type below the ${TYPE_FLOOR}px floor (${[...new Set(small)].join(", ")}px) — widget-standard §6`,
    )

  // The mono face is what makes text measurement exact rather than estimated
  // (see measure.ts), so a chart in another family is also a chart laid out
  // against widths it does not have.
  const families = [...svg.matchAll(FONT_FAMILY)]
    .map((m) => decodeEntities(m[1] ?? m[2] ?? "").trim())
    .filter((f) => f !== "" && !/mono/i.test(f))
  if (families.length)
    problems.push(
      `${at} sets a non-mono font-family (${[...new Set(families)][0]}) — the kit measures in mono advances`,
    )

  if (EXTERNAL.test(svg))
    problems.push(
      `${at} references something external (href, url() or <image>) — the sandbox has no network (ADR-0002)`,
    )

  return problems
}
