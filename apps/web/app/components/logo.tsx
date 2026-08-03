import { useId, type CSSProperties } from "react"

import {
  chipTransform,
  chromeGlyphBox,
  CHIP_VIEWBOX,
  GLYPH_VIEWBOX_COMPACT,
  MARK_BUTTONS,
  MARK_PATHS,
  squirclePath,
} from "~/lib/mark"
import { cn } from "~/lib/utils"

/** Sampled once: the tile outline is the same on every chip ever drawn. */
const TILE = squirclePath()

/** Sampled once: the glyph box is the same in every chrome lockup. */
const GLYPH_BOX = chromeGlyphBox()

/**
 * The Steward mark: the bow tie — the butler's collar over the shirt studs.
 *
 * The geometry lives in `~/lib/mark` and nothing else defines it; every static
 * mirror (favicon, launcher icons, wordmark lockups, the whole `brand/` kit) is
 * generated from that same module by `node scripts/gen-brand.ts`.
 *
 * It is a **real bow tie now** (ADR-0055): two folded wings, a square **knot**,
 * and two **buttons** below. The knot and the buttons are safe to draw again —
 * ADR-0053 removed them because a *coloured* knot measured 1.40:1 at 16px, but
 * the mark is a **single ink** in every framing now, so the gaps between wing,
 * knot and button are ground, not an ink-against-ink edge. The only contrast
 * boundary the mark has is still itself against its surface.
 *
 * Two framings:
 *
 * - **In chrome**, the bare glyph: neutral ink (`--mark-ink`) on whatever
 *   surface the rail or the header hands it — near-black on light, cream on
 *   dark. Mode-keyed, since it is the one framing sitting on a surface it does
 *   not own. Orange is the chip's, not the bow's, and it is bow-and-knot only —
 *   the buttons are a display-size detail the inline crop drops.
 * - **On display surfaces** (`display`), the product-icon chip: a superellipse
 *   tile in a flat ember (`--chip-tile`) with the bow **cut out of it** in
 *   cream (`--chip-bow`), inset by `chipTransform` so the tile keeps ground.
 *   One colourway in both modes — a saturated object has no reason to follow
 *   the page.
 *
 * The chip carries no border and no gradient: the flat ember clears every
 * ground it lands on by itself (ADR-0055).
 */
export function Logo({
  className,
  display,
  style,
}: {
  className?: string
  /** Hero sizes and app icons: the framed product-icon chip. */
  display?: boolean
  /** Sizing the lockup derives rather than names — see {@link Wordmark}. */
  style?: CSSProperties
}) {
  // Collision-safe id: the wordmark renders in the header, rail and account
  // bar at once, so a shared clip id would cross-wire them.
  const id = useId()

  if (!display) {
    // Chrome inline glyph: bow and knot only. At header/rail size the buttons
    // read as loose specks under the bow and pull it off the wordmark's
    // baseline, so they are a display-size detail the chrome crop drops.
    return (
      <svg
        viewBox={GLYPH_VIEWBOX_COMPACT}
        aria-hidden
        className={cn("shrink-0", className)}
        style={style}
        fill="var(--mark-ink)"
      >
        {MARK_PATHS.map((d, i) => (
          <path key={`p${i}`} d={d} />
        ))}
      </svg>
    )
  }

  const tileClip = `${id}-tc`

  return (
    <svg
      viewBox={CHIP_VIEWBOX}
      aria-hidden
      className={cn("shrink-0 logo-tile", className)}
      style={style}
    >
      <defs>
        {/* The cut cannot leave the material: anything past the tile is cream
            drawn on a cream page — invisible, so a tip reads as sliced off
            rather than overflowing. The inset in chipTransform is what stops it
            ever being needed. */}
        <clipPath id={tileClip}>
          <path d={TILE} />
        </clipPath>
      </defs>
      <path d={TILE} fill="var(--chip-tile)" />
      <g clipPath={`url(#${tileClip})`}>
        <g transform={chipTransform()} fill="var(--chip-bow)">
          {MARK_PATHS.map((d, i) => (
            <path key={`p${i}`} d={d} />
          ))}
          {MARK_BUTTONS.map((b, i) => (
            <circle key={`b${i}`} cx={b.cx} cy={b.cy} r={b.rad} />
          ))}
        </g>
      </g>
    </svg>
  )
}

/**
 * Mark + name lockup; the mark scales with the surrounding font size.
 *
 * **The chrome brand is one size, `text-base` (16px)** — carried here rather
 * than at each call site, the way `railCaptionCls` carries the caption tier, so
 * the rail, the collapsed-rail header, the account bar, the error chrome and
 * the device-code page cannot drift apart. 16px is the heading tier the widget
 * titles take: the brand is a section heading of the app, never a row in the
 * list. Callers may still pass a size (tailwind-merge lets it win).
 *
 * **The mark is sized against the word, not against that size.** Its box comes
 * from `chromeGlyphBox`, which lands the bow's ink at `GLYPH_INK_CAP` of the
 * cap band — the ratio is the lockup's, so it holds at every size a caller
 * asks for and on every surface, phone header and desktop rail alike. The one
 * brand size is a *type* rule; this is the proportion inside it.
 */
export function Wordmark({
  className,
  display,
}: {
  className?: string
  /** Use the framed display chip (hero sizes only). */
  display?: boolean
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[0.5em] font-mono text-base font-semibold tracking-tight text-foreground select-none",
        className,
      )}
    >
      {/* items-center puts the glyph's crop centre on the line-box centre. The
          chrome glyph is bow-and-knot only, cropped square-ish, so the bow sits
          centred on the cap band; the display chip keeps the buttons.

          The inline glyph is sized from `chromeGlyphBox`, not from a literal:
          what the box has to land is the bow's *ink* against the word's cap
          band (`GLYPH_INK_CAP`), and the crop the box measures is wider and
          taller than that ink by `GLYPH_AIR` on every side. */}
      <Logo
        display={display}
        className={display ? "size-[1.4em]" : undefined}
        style={display ? undefined : GLYPH_BOX}
      />
      Steward
    </span>
  )
}
