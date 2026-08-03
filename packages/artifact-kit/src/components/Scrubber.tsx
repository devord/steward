/**
 * A position along an axis — the day a chart is showing.
 *
 * The second half of the interaction floor `ToggleGroup` opens, and it follows
 * the same rules: static markup, `data-*` for the seam, behaviour injected by
 * the board, no framework. See ToggleGroup for why the control ships `hidden`.
 *
 * A range input rather than something hand-built out of divs, because it is
 * genuinely the native control for this: keyboard stepping, Home/End, page
 * jumps and the screen-reader announcement all arrive for free and all of them
 * would otherwise have to be re-implemented and re-tested here.
 */
export interface ScrubberSpec {
  /** Names this axis; carried in the `kit:scrub` event. */
  key: string
  /** Positions, `0 … steps - 1`. */
  steps: number
  /** Where the static render sits. Defaults to the end — the latest day. */
  value?: number
  /** Accessible name — what is being scrubbed. */
  label?: string
  /** Shown under the ends of the track, e.g. the first and last dates. */
  ends?: [string, string]
}

export function Scrubber({ spec }: { spec: ScrubberSpec }) {
  const last = Math.max(0, spec.steps - 1)
  // The latest day is the one that answers "where are we", so it is both the
  // default position and what the static file freezes on.
  const value = Math.min(Math.max(0, spec.value ?? last), last)
  return (
    <div hidden data-kit-scrub={spec.key} className="flex flex-col gap-1">
      <input
        type="range"
        min={0}
        max={last}
        defaultValue={value}
        aria-label={spec.label}
        data-kit-scrub-input=""
        // `bg-bg3` is the track. `appearance-none` removes the platform widget
        // — which is what this wants, a 4px bar under the chart rather than a
        // 16px OS slider — but it takes the track with it, and nothing else
        // paints one: the kit's stylesheet carries no ::-webkit-slider-* rules.
        // That shipped as a lone dot floating between the end labels, the axis
        // it slides along invisible. The thumb survived on its own because
        // `accent-orange` still reaches it — which is exactly why the dot was
        // there and the bar was not.
        className="accent-orange bg-bg3 h-1 w-full cursor-pointer appearance-none rounded-full"
      />
      {spec.ends ? (
        <div className="text-ink-faint flex justify-between font-mono text-[10px] leading-none">
          <span>{spec.ends[0]}</span>
          <span>{spec.ends[1]}</span>
        </div>
      ) : null}
    </div>
  )
}
