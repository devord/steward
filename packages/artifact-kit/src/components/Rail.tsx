import { cn } from "../ui/cn.ts"
import { type Tone, TONE_FILL, TONE_TEXT } from "../ui/tone.ts"

/**
 * A full-width progress rail: how far along one horizon is, with a mark at
 * where the calendar says it should be.
 *
 * **The tick is the verdict drawn.** Fill past it reads ahead, short of it
 * reads behind — so a reader gets the judgement from the geometry before
 * reading a word. It overshoots the track top and bottom so it reads as a mark
 * on a scale rather than the fill's own edge, and carries a halo in the page
 * surface so a tick sitting inside the fill stays legible.
 *
 * **Never the only encoding.** The rail takes `role="img"` and an aria-label
 * carrying both figures and the verdict, and the caption states the verdict in
 * words besides. A mark on a bar is not a thing a screen reader can report.
 */
export function Rail({
  /** `Closing on`, `To launch 2026-09-30` — the horizon this measures. */
  label,
  /** 0–100. */
  percent,
  /** Where the calendar says the fill should have reached. */
  tick,
  /** The word the tick is drawing — `on track`, `12d behind`. */
  verdict,
  /** The tick and the readiness figure take this; the fill never does. */
  tone = "neutral",
  /** One quiet line under the rail — the pace stat, the composition. */
  caption,
  /** A quieter second horizon: thinner track, ink fill instead of accent. */
  secondary = false,
}: {
  label: string
  percent: number
  tick?: number
  verdict?: string
  tone?: Tone
  caption?: string
  secondary?: boolean
}) {
  const pct = Math.max(0, Math.min(100, percent))
  const at = tick === undefined ? undefined : Math.max(0, Math.min(100, tick))
  return (
    // Its own fit section and list, so a short tile sheds a whole rail rather
    // than cropping one mid-track. Trimming is bottom-up and the secondary
    // horizon is emitted last, so the leading rail is the one that survives —
    // ordering does the pinning, as everywhere else in the kit.
    <div data-fit-section data-fit-list>
      {/* One unit for the whole rail. Marking only the label row would shed a
          heading and leave a headless track behind — the same "half of it is
          worse than none" rule the verdict band's reason line follows. */}
      <div data-fit-item className="flex flex-col gap-1">
        <div className="flex items-baseline gap-2">
          <span className="text-ink-dim font-mono text-xs">{label}</span>
          <span
            className={cn(
              "ml-auto font-mono text-sm font-semibold tabular-nums",
              TONE_TEXT[tone],
            )}
          >
            {Math.round(pct)}%
          </span>
        </div>
        <div
          role="img"
          aria-label={`${label}: ${Math.round(pct)}% complete${
            at === undefined ? "" : `, ${Math.round(at)}% elapsed`
          }${verdict ? `, ${verdict}` : ""}`}
          className={cn(
            "bg-bg3 relative w-full rounded-xs",
            secondary ? "h-[3px]" : "h-2",
          )}
        >
          <span
            className={cn(
              "block h-full rounded-xs",
              // The fill stays neutral-accent whatever the verdict. Tinting it
              // too would make the whole rail change colour on a judgement the
              // tick is already making, and spend the tile's accent twice.
              secondary ? "bg-ink-dim" : "bg-orange",
            )}
            style={{ width: `${pct}%` }}
          />
          {at === undefined ? null : (
            <span
              aria-hidden="true"
              // Overshoots the track so it reads as a mark on a scale, with a
              // surface-coloured halo so it survives sitting inside the fill.
              className={cn(
                "absolute -top-1 -bottom-1 w-0.5 rounded-xs ring-1",
                "tile:ring-bg page-only:ring-bg1",
                TONE_FILL[tone],
              )}
              style={{ left: `calc(${at}% - 1px)` }}
            />
          )}
        </div>
        {caption ? (
          <p className="text-ink-dim m-0 font-mono text-xs">{caption}</p>
        ) : null}
      </div>
    </div>
  )
}
