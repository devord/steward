import { cn } from "../ui/cn.ts"

/**
 * What a block is *for*, which is what a routine gets to say. Tone and weight
 * follow from it, so a day's shape reads the same across every plan.
 *
 * `deep` takes the accent because protecting deep work is the entire point of
 * planning a day this way — if anything on the grid is loud, it is the blocks
 * that are hardest to get back once lost.
 */
export type BlockType = "deep" | "meeting" | "shallow" | "personal" | "free"

const TYPE = {
  deep: "bg-orange/15 border-orange/40 text-ink",
  meeting: "bg-bg2 border-border text-ink-dim",
  shallow: "bg-bg2 border-border-dim text-ink-dim",
  personal: "bg-blue/10 border-blue/30 text-ink-dim",
  // Honest slack. A border and nothing else — it is real, and it is not work.
  free: "border-border-dim border-dashed text-ink-dim",
} satisfies Record<BlockType, string>

export interface TimeBlock {
  id: string
  /** `HH:MM`, snapped to :00 or :30. */
  start: string
  end: string
  type: BlockType
  /** The block's name on the grid — concise. */
  label: string
  /** What done looks like by the block's end. Beside the block, page tier. */
  note?: string
}

export interface DaySpec {
  /** `HH:MM` bounds of the plotted day. */
  from: string
  to: string
  /** The live line. Omitted on a plan for another day. */
  now?: string
  blocks: TimeBlock[]
}

const mins = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/** 30 minutes of day, in px. The grid's whole scale derives from this. */
const SLOT = 26

/**
 * The day as a time grid: every slot has a job, and the line says where you
 * are in it.
 *
 * **Past blocks recede, they never disappear.** A morning that is gone is
 * still the reason the afternoon looks the way it does, and a grid that drops
 * it silently re-plans the day as if it had started now.
 *
 * Blocks are positioned by their real times rather than stacked in order, so
 * a gap in the plan renders as a gap. That is the honest failure mode: an
 * unplanned hour should look unplanned, not close up.
 */
export function TimeGrid({ spec }: { spec: DaySpec }) {
  const t0 = mins(spec.from)
  const span = Math.max(30, mins(spec.to) - t0)
  const height = (span / 30) * SLOT
  const top = (hhmm: string) => ((mins(hhmm) - t0) / span) * 100
  const now = spec.now === undefined ? undefined : mins(spec.now)

  // Hour lines only. A rule every half hour is a texture, not a scale.
  const hours: number[] = []
  for (let m = Math.ceil(t0 / 60) * 60; m <= t0 + span; m += 60) hours.push(m)

  return (
    <div className="flex gap-3" style={{ height: `${height}px` }}>
      <div className="relative w-10 shrink-0">
        {hours.map((m) => (
          <span
            key={m}
            className="text-ink-dim absolute right-0 -translate-y-1/2 font-mono text-xs tabular-nums"
            style={{ top: `${((m - t0) / span) * 100}%` }}
          >
            {String(Math.floor(m / 60)).padStart(2, "0")}:00
          </span>
        ))}
      </div>

      <div className="relative flex-1">
        {hours.map((m) => (
          <span
            key={m}
            aria-hidden="true"
            className="bg-border-dim absolute inset-x-0 h-px"
            style={{ top: `${((m - t0) / span) * 100}%` }}
          />
        ))}

        {spec.blocks.map((b) => {
          const past = now !== undefined && mins(b.end) <= now
          return (
            <div
              key={b.id}
              className={cn(
                "absolute inset-x-0 overflow-hidden rounded-xs border px-1.5 py-0.5",
                TYPE[b.type],
                // Receding is opacity, not a dimmer ink: the block keeps its
                // own type colour so the day's shape still reads at a glance,
                // it simply stops competing with what is ahead.
                past && "opacity-45",
              )}
              style={{
                top: `${top(b.start)}%`,
                height: `${((mins(b.end) - mins(b.start)) / span) * 100}%`,
              }}
            >
              <span className="font-mono text-xs">{b.label}</span>
              {b.note ? (
                // The box keeps the concise label; the detail rides beside it
                // where there is width for it.
                <span className="text-ink-dim hidden font-mono text-xs tier-page:inline">
                  {" · "}
                  {b.note}
                </span>
              ) : null}
              <span className="sr-only">
                {" "}
                ({b.type}, {b.start}–{b.end})
              </span>
            </div>
          )
        })}

        {now !== undefined && now >= t0 && now <= t0 + span ? (
          <span
            className="bg-orange absolute inset-x-0 z-10 h-0.5"
            style={{ top: `${((now - t0) / span) * 100}%` }}
            role="img"
            aria-label={`Now: ${spec.now}`}
          />
        ) : null}
      </div>
    </div>
  )
}
