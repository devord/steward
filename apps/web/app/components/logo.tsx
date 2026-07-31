import { useId } from "react"

import {
  CHIP_TILT,
  CHIP_VIEWBOX,
  GLYPH_VIEWBOX,
  squirclePath,
  TILE_GRADIENT,
  WING_L,
  WING_R,
} from "~/lib/mark"
import { cn } from "~/lib/utils"

/** Sampled once: the tile outline is the same on every chip ever drawn. */
const TILE = squirclePath()

/**
 * The Steward mark: the bow tie — the butler's uniform, one shape.
 *
 * The geometry lives in `~/lib/mark` and nothing else defines it. Every static
 * mirror (favicon, launcher icons, wordmark lockups, the whole `brand/` kit)
 * is generated from that same module by `node scripts/gen-brand.ts`.
 *
 * **There is no knot** (ADR-0053). It was a third shape whose only job was to
 * be a different colour from the cloth it lay on, and at 16px that boundary
 * measured 1.40:1 — while every contrast test in the suite passed, because
 * they all measured ink against *ground* and none measured ink against ink.
 * The waist pinch carries the read instead.
 *
 * Two framings, and they are now genuinely different objects rather than the
 * same drawing with and without a tile:
 *
 * - **In chrome**, the bare glyph: flat ember on whatever surface the rail or
 *   the header hands it, level, sized to the text beside it. Mode-keyed, since
 *   it is the one framing sitting on a surface it does not own.
 * - **On display surfaces** (`display`), the product-icon chip: a superellipse
 *   tile drenched in the identity, with the bow **cut out of it** in paper and
 *   turned 12°, because a bow tie is worn rather than laid flat. One colourway
 *   in both modes — a saturated object has no reason to follow the page.
 *
 * The chip carries no border. It had one only because the old tile sat within
 * a hair of the page tone; at 16px that hairline was a quarter of a device
 * pixel and had never once rendered. The drenched tile clears every ground on
 * its own — see `TILE_GRADIENT` for why the diagonal is load-bearing.
 */
export function Logo({
  className,
  display,
}: {
  className?: string
  /** Hero sizes and app icons: the framed product-icon chip. */
  display?: boolean
}) {
  // Collision-safe id: the wordmark renders in the header, rail and account
  // bar at once, so a shared gradient id would cross-wire them.
  const id = useId()
  const tile = `${id}-t`

  if (!display) {
    return (
      <svg
        viewBox={GLYPH_VIEWBOX}
        aria-hidden
        className={cn("shrink-0", className)}
      >
        <path d={WING_L} fill="var(--mark-wing-flat)" />
        <path d={WING_R} fill="var(--mark-wing-flat)" />
      </svg>
    )
  }

  return (
    <svg
      viewBox={CHIP_VIEWBOX}
      aria-hidden
      className={cn("shrink-0 logo-tile", className)}
    >
      <defs>
        <linearGradient
          id={tile}
          gradientUnits="userSpaceOnUse"
          {...TILE_GRADIENT}
        >
          <stop offset="0" stopColor="var(--chip-tile-top)" />
          <stop offset="1" stopColor="var(--chip-tile-deep)" />
        </linearGradient>
      </defs>
      <path d={TILE} fill={`url(#${tile})`} />
      <g transform={`rotate(${CHIP_TILT} 32 32)`}>
        <path d={WING_L} fill="var(--chip-bow)" />
        <path d={WING_R} fill="var(--chip-bow)" />
      </g>
    </svg>
  )
}

/**
 * Mark + name lockup; the mark scales with the surrounding font size.
 *
 * **The chrome brand is one size, and it is `text-base` (16px)** — carried
 * here rather than at each call site, the way `railCaptionCls` carries the
 * caption tier. It sat at 14px in the rail, the account bar, the error chrome
 * and the device-code page, stepping to 16px only in the phone header; so the
 * identity read at the body size of the nav rows beneath it and a step under
 * the 16px widget titles beside it — the brand whispering under the content it
 * frames. 16px is the heading tier the widget titles take: the brand is a
 * section heading of the app, never a row in the list. Callers may still pass a
 * size (tailwind-merge lets it win), but no chrome surface should need to.
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
        "inline-flex items-center gap-[0.55em] font-mono text-base font-semibold tracking-tight text-foreground select-none",
        className,
      )}
    >
      {/* No optical nudge: items-center already puts the mark's center on the
          line-box center, which is where "Steward"'s cap-height midpoint and
          the surrounding chrome (header centerline, sibling icons) sit. An
          earlier 0.054em drop chased the word's ink-density centroid instead —
          it skews low because the ink mass is in the x-height band — and left
          the symmetric tie reading ~1px low in the app header, its bottom edge
          kissing the baseline (measured from pixel screenshots of the real
          Geist Mono render). Both crops keep the glyph's center at y=32. */}
      <Logo
        display={display}
        className={
          // Bare glyph: sized so the wings stand roughly cap-height next to
          // the name. Display chip: the old 1.4em block.
          display ? "size-[1.4em]" : "size-[1.25em]"
        }
      />
      Steward
    </span>
  )
}
