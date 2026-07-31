import { useId } from "react"

import {
  CHIP_RADIUS,
  CHIP_VIEWBOX,
  GLYPH_VIEWBOX,
  KNOT,
  WING_GRADIENT,
  WING_L,
  WING_R,
} from "~/lib/mark"
import { cn } from "~/lib/utils"

/**
 * The Steward mark: the bow tie — the butler's uniform in three shapes,
 * formal service without the food dome.
 *
 * The geometry lives in `~/lib/mark` and nothing else defines it. Every
 * static mirror (favicon, launcher icons, wordmark lockups, the whole
 * `brand/` kit) is generated from that same module by
 * `node scripts/gen-brand.ts`, so this component and the files on disk can no
 * longer drift the way six hand-synced copies of the path data did.
 *
 * The mark wears a **fixed identity** (DESIGN.md § Mark, ADR-0052): one
 * light and one dark colorway from the gruvbox rows, keyed on the mode class
 * alone, never on the active theme — `--mark-*` is emitted by
 * `themeStylesheet()` outside every `[data-theme]` block.
 *
 * Depth is material, not decorative (terminal-calm bans gradient glass), and
 * the mark only spends it where it has earned it:
 *
 * > **The gradient is a privilege of owning the ground.**
 *
 * `display` poses the mark as the product-icon chip — it brings its own
 * top-lit tile, so each wing carries the fold gradient (bright at the flared
 * tip, deep where the cloth gathers at the knot) measured against that tile.
 * The default bare glyph sits on whatever surface chrome hands it, so it goes
 * flat and deep instead: one honest tone that clears 3:1 on every theme's
 * page and sidebar. Which is also why there is no tile behind the chrome mark
 * — a tile there either vanishes into the sidebar or punches a hole in it,
 * and glyph-only is what mark-in-chrome looks like everywhere else (GitHub,
 * Linear, Vercel).
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
      viewBox={display ? CHIP_VIEWBOX : GLYPH_VIEWBOX}
      aria-hidden
      className={cn("shrink-0", display && "logo-tile", className)}
    >
      {display && (
        <>
          <defs>
            <linearGradient
              id={wingL}
              gradientUnits="userSpaceOnUse"
              {...WING_GRADIENT.left}
            >
              <stop offset="0" stopColor="var(--mark-wing-tip)" />
              <stop offset="0.55" stopColor="var(--mark-wing-tip)" />
              <stop offset="1" stopColor="var(--mark-wing-fold)" />
            </linearGradient>
            <linearGradient
              id={wingR}
              gradientUnits="userSpaceOnUse"
              {...WING_GRADIENT.right}
            >
              <stop offset="0" stopColor="var(--mark-wing-tip)" />
              <stop offset="0.55" stopColor="var(--mark-wing-tip)" />
              <stop offset="1" stopColor="var(--mark-wing-fold)" />
            </linearGradient>
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
              <rect width="64" height="64" rx={CHIP_RADIUS} />
            </clipPath>
            <filter id={shadow} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="0.85" />
            </filter>
          </defs>

          <rect
            width="64"
            height="64"
            rx={CHIP_RADIUS}
            fill={`url(#${tile})`}
          />
          {/* Contact shadow: the tie's own silhouette, blurred and nudged
              down, clipped to the tile — so the bow sits on the surface
              instead of being painted into it. */}
          <g
            clipPath={`url(#${clip})`}
            filter={`url(#${shadow})`}
            opacity="0.24"
            transform="translate(0 1)"
          >
            <path d={WING_L} fill="#000" />
            <path d={WING_R} fill="#000" />
            <path d={KNOT} fill="#000" />
          </g>
        </>
      )}

      <path
        d={WING_L}
        fill={display ? `url(#${wingL})` : "var(--mark-wing-flat)"}
      />
      <path
        d={WING_R}
        fill={display ? `url(#${wingR})` : "var(--mark-wing-flat)"}
      />
      <path d={KNOT} fill="var(--mark-knot)" />

      {display && (
        <rect
          x="0.55"
          y="0.55"
          width="62.9"
          height="62.9"
          rx={CHIP_RADIUS - 0.55}
          fill="none"
          strokeWidth="1"
          style={{ stroke: "var(--mark-tile-border)" }}
        />
      )}
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
