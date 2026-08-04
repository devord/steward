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
        // The track and the thumb are drawn by real ::-webkit-slider-* and
        // ::-moz-range-* rules in `tiers.css`, not by utilities here, and the
        // difference is the whole bug this had.
        //
        // It used to be `h-1 bg-bg3`: a 4px-tall *input box* painted as the
        // track. But `appearance-none` only suppresses the platform track — the
        // browser still draws a thumb, ~16px of it, centred on that 4px box. A
        // thumb cannot fit in a box a quarter its height, so it overflowed 6px
        // top and bottom, and the end labels 4px below caught the overflow: at
        // the right-hand extreme, where the scrubber rests by default, the dot
        // sat on top of the last date. The control was covering its own
        // readout on first paint, on every published artifact.
        //
        // So the box is sized for the thumb (24px, which is also 2.5.8's
        // target minimum for the drag handle) and the 4px bar is painted on
        // the track pseudo-element inside it. Only `w-full` and the cursor
        // belong on the element itself.
        className="accent-orange w-full cursor-pointer"
      />
      {spec.ends ? (
        // 12px `ink-dim`, not 10px `ink-faint`: these are the axis of the
        // control, the only thing saying what the far end of the track means,
        // and both the floor (widget-standard §6) and the "no text below AA"
        // rule (ADR-0048) apply to them like any other data carrier.
        <div className="text-ink-dim flex justify-between font-mono text-xs leading-none">
          <span>{spec.ends[0]}</span>
          <span>{spec.ends[1]}</span>
        </div>
      ) : null}
    </div>
  )
}
