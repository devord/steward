import { useId } from "react"

import { cn } from "~/lib/utils"

// The one geometry, shared by the tie, its contact shadow, and the blink
// mask. Wings tuck 2.5 under the knot (drawn last) so the fills never show a
// background hairline between the shapes.
const WING_L =
  "M10 21.5 Q10 19 12.5 20 L28 28.5 L28 35.5 L12.5 44 Q10 45 10 42.5 Z"
const WING_R =
  "M54 21.5 Q54 19 51.5 20 L36 28.5 L36 35.5 L51.5 44 Q54 45 54 42.5 Z"

/**
 * The Steward mark: the bow tie — the butler's uniform in three shapes,
 * formal service without the food dome. The wings carry the theme's accent
 * (the tie IS the brand color); the knot is the ink block that ends the
 * wordmark — a terminal caret takes the foreground color, so the caret
 * story got stronger when the fills flipped. One geometry at every size;
 * it reads from 16px favicons to the landing hero. Mirrored as static SVG
 * in public/favicon.svg and the public/wordmark-*.svg / og lockups; keep
 * the geometries in sync (DESIGN.md § Mark).
 *
 * Depth is material, not decorative (terminal-calm bans gradient glass):
 * each wing carries a fold gradient — brighter at the flared tip, deeper
 * where the fabric gathers at the knot — so the tie reads as a tied object,
 * not two flat chevrons. The knot stays solid ink; folding it would blur
 * the caret story. In chrome the mark is the bare glyph (fold wings, ink
 * knot, no tile) — a tile behind a chrome mark either vanishes (light
 * themes: card on page) or punches a hole in the sidebar (dark), and bare
 * is what mark-in-chrome looks like elsewhere (GitHub, Linear, Vercel).
 *
 * `display` poses the mark as the product icon: a chip — top-lit surface
 * (card→page), a crisp full border, and the tie's own contact shadow so
 * the bow sits ON the tile. The chip is what holds contrast on any surface;
 * it survives only in display contexts.
 */
export function Logo({
  className,
  live,
  display,
}: {
  className?: string
  /** Blink the ink knot like a terminal caret (landing only). */
  live?: boolean
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
      // The glyph's ink spans x 10–54, y ≈19–45; the bare-glyph crop frames
      // it tight (center y stays 32) so the tie fills its box instead of
      // floating in the tile's old padding.
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
              <stop offset="0" stopColor="var(--card)" />
              <stop offset="1" stopColor="var(--background)" />
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
          <rect
            x="0.75"
            y="0.75"
            width="62.5"
            height="62.5"
            rx="13.25"
            fill="none"
            strokeWidth="1.5"
            className="stroke-border"
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
            <rect x="25.5" y="24" width="13" height="16" rx="4" fill="#000" />
          </g>
        </>
      )}

      <path d={WING_L} fill={`url(#${wingL})`} />
      <path d={WING_R} fill={`url(#${wingR})`} />

      {/* Blink mask: when the knot fades on the caret blink its edges would
          show the accent wing-tips through the dimmed ink. A rect matching
          what sits behind the knot (the tile gradient in display, the page
          in chrome) hides them, so the fade reveals ground, not a hole onto
          the tie. Only needed while the knot blinks (gated on `live`). */}
      {live &&
        (display ? (
          <rect
            x="25.5"
            y="24"
            width="13"
            height="16"
            rx="4"
            fill={`url(#${tile})`}
          />
        ) : (
          <rect
            x="25.5"
            y="24"
            width="13"
            height="16"
            rx="4"
            className="fill-bg"
          />
        ))}
      <rect
        x="25.5"
        y="24"
        width="13"
        height="16"
        rx="4"
        className={cn("fill-foreground", live && "logo-cursor")}
      />
    </svg>
  )
}

/** Mark + name lockup; the mark scales with the surrounding font size. */
export function Wordmark({
  className,
  live,
  display,
}: {
  className?: string
  live?: boolean
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
        live={live}
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
