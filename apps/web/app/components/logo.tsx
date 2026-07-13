import { cn } from "~/lib/utils"

/**
 * The Steward mark: a mini dashboard grid whose last widget is the
 * wordmark's trailing block cursor (steward▮) — the board, still being
 * written. Mirrored as static SVG in public/favicon.svg and public/og.png;
 * keep the three geometries in sync.
 */
export function Logo({
  className,
  live,
}: {
  className?: string
  /** Blink the orange cursor block like a terminal caret (landing only). */
  live?: boolean
}) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={cn("shrink-0", className)}>
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
      <rect
        x="12"
        y="12"
        width="17"
        height="17"
        rx="4"
        className="fill-muted-foreground"
      />
      <rect
        x="12"
        y="35"
        width="17"
        height="17"
        rx="4"
        className="fill-muted-foreground"
      />
      <rect
        x="35"
        y="12"
        width="17"
        height="40"
        rx="4"
        className={cn("fill-primary", live && "logo-cursor")}
      />
    </svg>
  )
}

/** Mark + name lockup; the mark scales with the surrounding font size. */
export function Wordmark({
  className,
  live,
}: {
  className?: string
  live?: boolean
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
      <Logo live={live} className="size-[1.4em] translate-y-[0.043em]" />
      Steward
    </span>
  )
}
