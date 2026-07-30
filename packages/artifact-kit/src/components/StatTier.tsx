import { cn } from "../ui/cn.ts"

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
  tone?: "neutral" | "attn" | "warn" | "bad" | "good"
  note?: string
}) {
  return (
    // The hero treatment belongs to the glance and nowhere else. At 340x160
    // the figure IS the artifact, so it is centred and large; on a 1400px page
    // that same styling is a 1x1 design that outstayed its tier, spending the
    // height the playbook wants given to detail. From the detail tier up it
    // steps down to a left-aligned header KPI and gets out of the way.
    <div className="tier-detail:flex-row tier-detail:items-baseline tier-detail:gap-2 tier-detail:text-left flex flex-col items-center gap-0.5 text-center">
      <span
        className={cn(
          // Not a type-scale step: the glance tier's whole job is this figure,
          // so it is sized against the tile rather than the body copy.
          "tier-detail:text-2xl font-mono text-[2.75rem] leading-none font-semibold tabular-nums",
          {
            neutral: "text-ink",
            attn: "text-orange",
            warn: "text-yellow",
            bad: "text-red",
            good: "text-green",
          }[tone],
        )}
      >
        {value}
      </span>
      <span className="text-ink-dim font-mono text-xs">{label}</span>
      {/* The floor is 12px (widget-standard §6) — hierarchy is earned with
          weight and colour, never by shrinking below it. */}
      {note ? (
        <span className="text-ink-faint beyond-glance:block hidden font-mono text-xs">
          {note}
        </span>
      ) : null}
    </div>
  )
}
