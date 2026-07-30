import { cn } from "../ui/cn.ts"
import type { Tone } from "../ui/tone.ts"

/**
 * Bar fills, by tone.
 *
 * `neutral` is `ink-faint`, and this is the one place that role is correct
 * rather than a third text tier: a bar is a *glyph*. The 3.20:1 floor that
 * bars ink-faint from text does not apply to a solid block whose meaning is
 * its length, and an inert magnitude has to stay quieter than the row's state
 * chip or the tile spends its accent budget on the least actionable column.
 */
const METER_FILL: Record<Tone, string> = {
  neutral: "bg-ink-faint",
  attn: "bg-orange",
  warn: "bg-yellow",
  bad: "bg-red",
  good: "bg-green",
  info: "bg-blue",
}

/**
 * A magnitude bar — the ledger's "how much", against a scale shared by every
 * row in its column.
 *
 * The shared scale is the whole point. Bars normalised per row all render full
 * and compare nothing; bars against one column max sort the rows by length on
 * sight, which is what lets a reader skip the numbers entirely.
 *
 * **Tone is for when the magnitude *is* the finding.** A drift count earns
 * orange because there is no competing accent on that row. Commit volume does
 * not: it is an inert quantity next to a confidence pill that owns the tile's
 * one accent, so it stays `neutral` and reads as texture.
 */
export function Meter({
  /** This row's magnitude, on the column's scale. */
  value,
  /** The column's largest magnitude. Zero or absent means every bar is empty. */
  max,
  /** The rendered count — the reader's exact figure, beside the shape. */
  label,
  tone = "neutral",
}: {
  value: number
  max: number
  label: string
  tone?: Tone
}) {
  // A zero max is a real state (a section where nothing happened), not a bug —
  // every bar reads empty and the counts still say zero.
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <span className="inline-flex w-24 items-center gap-1.5 tier-detail:w-40 tier-page:w-56">
      {/* The track takes the leftover width so the counts land in one column.
          Taken literally, "the count at the bar's end" puts a ragged number at
          the fill's tip — which collides with the bar at 100% and strands a
          three-digit count mid-cell at 10%. The bar already carries the
          comparison; the count only has to stay scannable. */}
      <span className="bg-bg2 flex-1 rounded-xs" aria-hidden="true">
        <span
          className={cn("block h-1.5 rounded-xs", METER_FILL[tone])}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="shrink-0">{label}</span>
    </span>
  )
}
