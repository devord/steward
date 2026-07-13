import { cn } from "~/lib/utils"

/**
 * The Steward mark: the bow tie — the butler's uniform in three shapes,
 * formal service without the food dome. The orange knot is the same block
 * that ends the wordmark (steward's cursor, dressed up). One geometry at
 * every size; it reads from 16px favicons to the landing hero. Mirrored as
 * static SVG in public/favicon.svg and the public/wordmark-*.svg / og.png
 * lockups; keep the geometries in sync (DESIGN.md § Mark).
 */
export function Logo({
  className,
  live,
  display,
}: {
  className?: string
  /** Blink the orange knot like a terminal caret (landing only). */
  live?: boolean
  /** Hero sizes only: adds the tile's frame stroke (mush below ~32px). */
  display?: boolean
}) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={cn("shrink-0", className)}>
      <rect width="64" height="64" rx="14" className="fill-bg" />
      {display && (
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
      )}
      <path
        d="M10 22 Q10 19.5 12.5 20.5 L26 27 L26 37 L12.5 43.5 Q10 44.5 10 42 Z"
        className="fill-muted-foreground"
      />
      <path
        d="M54 22 Q54 19.5 51.5 20.5 L38 27 L38 37 L51.5 43.5 Q54 44.5 54 42 Z"
        className="fill-muted-foreground"
      />
      <rect
        x="26.5"
        y="25"
        width="11"
        height="14"
        rx="3.5"
        className={cn("fill-primary", live && "logo-cursor")}
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
          value holds at every font size (text-sm through the landing's text-5xl). */}
      <Logo
        live={live}
        display={display}
        className="size-[1.4em] translate-y-[0.043em]"
      />
      Steward
    </span>
  )
}
