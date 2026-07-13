import { cn } from "~/lib/utils"

/**
 * The Steward mark: the bow tie — the butler's uniform in three shapes,
 * formal service without the food dome. The wings carry the theme's accent
 * (the tie IS the brand color); the knot is the ink block that ends the
 * wordmark — a terminal caret takes the foreground color, so the caret
 * story got stronger when the fills flipped. One geometry at every size;
 * it reads from 16px favicons to the landing hero. Mirrored as static SVG
 * in public/favicon.svg and the public/wordmark-*.svg / og.png lockups;
 * keep the geometries in sync (DESIGN.md § Mark).
 *
 * In chrome the mark is the bare glyph — accent wings, ink knot, no tile.
 * A tile behind a chrome mark either vanishes (light themes: bg on bg1) or
 * punches a darker hole in the sidebar (dark themes), and the glyph-only
 * treatment is what mark-in-chrome looks like elsewhere (GitHub, Linear,
 * Vercel). The tile survives only in `display` contexts, where the mark
 * poses as the product icon.
 */
export function Logo({
  className,
  live,
  display,
}: {
  className?: string
  /** Blink the orange knot like a terminal caret (landing only). */
  live?: boolean
  /** Hero sizes only: the framed identity tile (mush below ~32px). */
  display?: boolean
}) {
  return (
    <svg
      // The glyph's ink spans x 10–54, y ≈19–45; the bare-glyph crop frames
      // it tight (center y stays 32) so the tie fills its box instead of
      // floating in the tile's old padding.
      viewBox={display ? "0 0 64 64" : "8 17.5 48 29"}
      aria-hidden
      className={cn("shrink-0", className)}
    >
      {display && (
        <>
          <rect width="64" height="64" rx="14" className="fill-bg" />
          <rect
            x="1"
            y="1"
            width="62"
            height="62"
            rx="13"
            fill="none"
            strokeWidth="2"
            className="stroke-border"
          />
        </>
      )}
      {/* Wings tuck 2.5 under the knot (drawn last) so the flipped fills
          never show a background hairline between the shapes. */}
      <path
        d="M10 21.5 Q10 19 12.5 20 L28 28.5 L28 35.5 L12.5 44 Q10 45 10 42.5 Z"
        className="fill-primary"
      />
      <path
        d="M54 21.5 Q54 19 51.5 20 L36 28.5 L36 35.5 L51.5 44 Q54 45 54 42.5 Z"
        className="fill-primary"
      />
      {/* Blink mask: the wings tuck 2.5 under the knot, so when the knot
          fades on the caret blink its edges would show the accent wing-tips
          through the dimmed ink. A bg-filled rect under the knot hides them,
          so the fade reveals background — a dimming caret, not a hole onto
          the tie. Only needed while the knot blinks (gated on `live`). */}
      {live && (
        <rect
          x="25.5"
          y="24"
          width="13"
          height="16"
          rx="4"
          className="fill-bg"
        />
      )}
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
  /** Use the framed display tile (hero sizes only). */
  display?: boolean
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[0.55em] font-mono font-semibold tracking-tight text-foreground select-none",
        className,
      )}
    >
      {/* Optical nudge: items-center centers the mark on the text's line box,
          but "Steward" has no descenders (only S/t/d rise), so its ink centroid
          — the word's visual center of mass — sits ~0.043em below that line-box
          center. Drop the mark to meet it. Measured and size-independent: the
          half-leading items-center adds exactly cancels line-height, so this one
          value holds at every font size (text-sm through the landing's text-5xl).
          Both crops keep the glyph's center at y=32, so the nudge is shared. */}
      <Logo
        live={live}
        display={display}
        className={cn(
          // Bare glyph: sized so the wings stand roughly cap-height next to
          // the name. Display tile: the old 1.4em block.
          display ? "size-[1.4em]" : "size-[1.25em]",
          "translate-y-[0.043em]",
        )}
      />
      Steward
    </span>
  )
}
