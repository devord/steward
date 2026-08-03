import { cn } from "../ui/cn.ts"
import { type Tone, TONE_TEXT } from "../ui/tone.ts"

/**
 * The 1×1 glance: one number and what it counts.
 *
 * A tier is a viewport, not a crop — at 340×160 there is room for the figure
 * and its label and nothing else, so the stat is what the artifact *is* at
 * that size, not a shrunken version of the detail view. Everything richer is
 * revealed by tier variants above it.
 */
export function StatTier({
  value,
  label,
  /** `attn` above zero, `neutral` at zero, is the usual reading. */
  tone = "neutral",
  /** Extra context for a reader who can see the number — one short line. */
  note,
}: {
  value: number | string
  label: string
  tone?: Tone
  note?: string
}) {
  return (
    // The hero treatment belongs to the glance and nowhere else. At 340x160
    // the figure IS the artifact, so it is centred and large; anywhere else
    // that same styling is a 1x1 design that outstayed its tier, spending the
    // height the playbook wants given to detail. Beyond the glance it steps
    // down to a left-aligned header KPI and gets out of the way.
    //
    // `beyond-glance`, not `tier-detail`: the step is about whether anything
    // else is on screen, and that is a width OR height question. Gated on
    // width alone, a 1x2 tile (340x312) kept the full hero — 44px centred over
    // a left-aligned ledger it had just squeezed down to one row and a
    // `+2 more`. The verdict band carried the same bug in the same place.
    //
    // Wrapping for the same reason the verdict band does: the row is three
    // pieces of caller-supplied text and nothing here can truncate.
    <div className="beyond-glance:flex-row beyond-glance:flex-wrap beyond-glance:items-baseline beyond-glance:gap-x-2 beyond-glance:text-left flex flex-col items-center gap-0.5 text-center">
      <span
        className={cn(
          // Not a type-scale step: the glance tier's whole job is this figure,
          // so it is sized against the tile rather than the body copy.
          "beyond-glance:text-2xl font-mono text-[2.75rem] leading-none font-semibold tabular-nums",
          // The stat is the glance, so neutral here is full ink rather than
          // the dimmed secondary the value columns use.
          tone === "neutral" ? "text-ink" : TONE_TEXT[tone],
        )}
      >
        {value}
      </span>
      <span className="text-ink-dim font-mono text-xs">{label}</span>
      {/* Labels sit at the 12px floor; data never does (widget-standard §6).
          And de-emphasis is spent on size and weight, never a dimmer ink —
          ink-faint is a glyph role, below AA on all but one theme. */}
      {note ? (
        <span className="text-ink-dim beyond-glance:block hidden font-mono text-xs">
          {/* Beyond the glance the stat lays out in a row, and the label and
              the note butt together into one apparent sentence — "0 to file 38
              pages audited". The glance gets its separation from the line
              break; the inline one has to say it. Same separator the section
              heading uses for the same job. */}
          <span className="beyond-glance:inline hidden">· </span>
          {note}
        </span>
      ) : null}
    </div>
  )
}
