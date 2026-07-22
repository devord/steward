import { useId } from "react"

import { cn } from "~/lib/utils"

// The one geometry, shared by the tie, its contact shadow, and every static
// mirror (favicon, launcher icons, wordmark lockups — keep in sync,
// DESIGN.md § Mark). Butterfly cut: each wing's long edges bow gently
// outward where the fabric puffs, the outer corners round off, and the
// outer edge folds back in a shallow notch toward the knot — the silhouette
// of a tied bow, not two chevrons. Wings tuck ~2 under the knot (drawn
// last) so the fills never show a background hairline between the shapes.
const WING_L =
  "M28 28.2 C21.8 25 15.8 22 13 20.9 Q10 19.6 10 22.8 L10 25.4 C10.3 28.2 12.2 30.6 14.7 32 C12.2 33.4 10.3 35.8 10 38.6 L10 41.2 Q10 44.4 13 43.1 C15.8 42 21.8 39 28 35.8 Z"
const WING_R =
  "M36 28.2 C42.2 25 48.2 22 51 20.9 Q54 19.6 54 22.8 L54 25.4 C53.7 28.2 51.8 30.6 49.3 32 C51.8 33.4 53.7 35.8 54 38.6 L54 41.2 Q54 44.4 51 43.1 C48.2 42 42.2 39 36 35.8 Z"
// The knot cinches: its vertical sides bow inward where the wrap gathers
// the fabric, instead of the old plain rounded rectangle.
const KNOT =
  "M28.7 24 L35.3 24 Q38.5 24 38.35 27.2 C37.6 29.3 37.6 34.7 38.35 36.8 Q38.5 40 35.3 40 L28.7 40 Q25.5 40 25.65 36.8 C26.4 34.7 26.4 29.3 25.65 27.2 Q25.5 24 28.7 24 Z"
// Fold creases radiating from under the knot toward each wing's outer
// corners — the gathered-fabric detail. Display sizes only: at chrome
// sizes (~20px) they are sub-pixel noise.
const CREASES = [
  "M26.5 29.3 C22.5 27.6 18.5 26 15.5 24.8",
  "M26.5 34.7 C22.5 36.4 18.5 38 15.5 39.2",
  "M37.5 29.3 C41.5 27.6 45.5 26 48.5 24.8",
  "M37.5 34.7 C41.5 36.4 45.5 38 48.5 39.2",
]

/**
 * The Steward mark: the bow tie — the butler's uniform in three shapes,
 * formal service without the food dome. The mark wears a **fixed
 * identity** (DESIGN.md § Mark): one light and one dark colorway from the
 * Flexoki rows, keyed on the mode class alone, never on the active theme —
 * the `--mark-*` vars are emitted by themeStylesheet() outside every
 * `[data-theme]` block. The knot is the ink block that ends the wordmark.
 * One geometry at every size; it reads from 16px favicons to the landing
 * hero, and the static mirrors in public/ and scripts/ must keep it in
 * sync.
 *
 * Depth is material, not decorative (terminal-calm bans gradient glass):
 * each wing carries a fold gradient — brighter at the flared tip, deeper
 * where the fabric gathers at the knot — so the tie reads as a tied
 * object. The knot stays solid ink. In chrome the mark is the bare glyph
 * (fold wings, ink knot, no tile), which is what mark-in-chrome looks like
 * elsewhere (GitHub, Linear, Vercel).
 *
 * `display` poses the mark as the product icon: a chip — top-lit tile, a
 * bevel highlight, a crisp full border, the tie's own contact shadow, and
 * the fold creases. The chip is what holds contrast on any surface; it
 * survives only in display contexts (hero sizes; it mushes below ~32px).
 */
export function Logo({
  className,
  display,
}: {
  className?: string
  /** Hero sizes only: the framed product-icon chip (mush below ~32px). */
  display?: boolean
}) {
  // Collision-safe ids: the wordmark renders in the header, rail, and
  // account bar at once, so shared gradient/filter ids would cross-wire.
  const id = useId()
  const wingL = `${id}-wl`
  const wingR = `${id}-wr`
  const tile = `${id}-tile`
  const shadow = `${id}-cs`
  const clip = `${id}-cc`

  return (
    <svg
      // The glyph's ink spans x 10–54, y ≈19.6–43.4; the bare-glyph crop
      // frames it tight (center y stays 32) so the tie fills its box
      // instead of floating in the tile's old padding.
      viewBox={display ? "0 0 64 64" : "8 17.5 48 29"}
      aria-hidden
      className={cn("shrink-0", display && "logo-tile", className)}
    >
      <defs>
        <linearGradient
          id={wingL}
          gradientUnits="userSpaceOnUse"
          x1="10"
          y1="30"
          x2="28"
          y2="34"
        >
          <stop offset="0" stopColor="var(--mark-wing-tip)" />
          <stop offset="0.55" stopColor="var(--mark-wing-tip)" />
          <stop offset="1" stopColor="var(--mark-wing-fold)" />
        </linearGradient>
        <linearGradient
          id={wingR}
          gradientUnits="userSpaceOnUse"
          x1="54"
          y1="30"
          x2="36"
          y2="34"
        >
          <stop offset="0" stopColor="var(--mark-wing-tip)" />
          <stop offset="0.55" stopColor="var(--mark-wing-tip)" />
          <stop offset="1" stopColor="var(--mark-wing-fold)" />
        </linearGradient>
        {display && (
          <>
            <linearGradient
              id={tile}
              gradientUnits="userSpaceOnUse"
              x1="32"
              y1="0"
              x2="32"
              y2="64"
            >
              <stop offset="0" stopColor="var(--mark-tile-top)" />
              <stop offset="1" stopColor="var(--mark-tile-bottom)" />
            </linearGradient>
            <clipPath id={clip}>
              <rect width="64" height="64" rx="14" />
            </clipPath>
            <filter id={shadow} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="1" />
            </filter>
          </>
        )}
      </defs>

      {display && (
        <>
          <rect width="64" height="64" rx="14" fill={`url(#${tile})`} />
          {/* Bevel: the chip's top-lit edge highlight. */}
          <path
            d="M14 2 H50"
            fill="none"
            strokeWidth="1.4"
            strokeLinecap="round"
            style={{ stroke: "var(--mark-tile-bevel)" }}
          />
          <rect
            x="0.75"
            y="0.75"
            width="62.5"
            height="62.5"
            rx="13.25"
            fill="none"
            strokeWidth="1.5"
            style={{ stroke: "var(--mark-tile-border)" }}
          />
          {/* Contact shadow: the tie's own silhouette, blurred and nudged
              down, clipped to the tile — the bow sits on the surface. */}
          <g
            clipPath={`url(#${clip})`}
            filter={`url(#${shadow})`}
            opacity="0.3"
            transform="translate(0 1.3)"
          >
            <path d={WING_L} fill="#000" />
            <path d={WING_R} fill="#000" />
            <path d={KNOT} fill="#000" />
          </g>
        </>
      )}

      <path d={WING_L} fill={`url(#${wingL})`} />
      <path d={WING_R} fill={`url(#${wingR})`} />
      {display &&
        CREASES.map((d) => (
          <path
            key={d}
            d={d}
            fill="none"
            stroke="#000"
            strokeOpacity="0.14"
            strokeWidth="1"
            strokeLinecap="round"
          />
        ))}
      <path d={KNOT} fill="var(--mark-knot)" />
    </svg>
  )
}

/** Mark + name lockup; the mark scales with the surrounding font size. */
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
        "inline-flex items-center gap-[0.55em] font-mono font-semibold tracking-tight text-foreground select-none",
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
