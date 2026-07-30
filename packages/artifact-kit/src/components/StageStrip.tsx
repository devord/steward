import { cn } from "../ui/cn.ts"

/**
 * Where a plan is in its acts: dot → label → connector, left to right.
 *
 * It answers **where**, which neither a rail nor a meter does — those answer
 * *how far*. That is the whole reason it earns a row beside them rather than
 * being a third rendering of the same completion.
 *
 * Shape carries the vocabulary, not colour: a done act is filled, the current
 * one is ringed, a future one is hollow. The current act takes the strip's one
 * accent, and it is the only accent outside the leading rail.
 */
export type StageState = "done" | "now" | "next"

export interface Stage {
  id: string
  label: string
  state: StageState
}

export function StageStrip({ stages }: { stages: Stage[] }) {
  return (
    <ol className="m-0 flex list-none items-center gap-0 p-0">
      {stages.map((s, i) => (
        <li
          key={s.id}
          className="flex flex-1 items-center gap-2 last:flex-none"
        >
          <span className="flex shrink-0 items-center gap-1.5">
            <span
              aria-hidden="true"
              className={cn(
                "size-2 shrink-0 rounded-full",
                s.state === "done" && "bg-ink-dim",
                // Ringed rather than filled: the current act is in progress,
                // and a full disc would read as finished.
                s.state === "now" && "ring-orange bg-transparent ring-2",
                s.state === "next" && "border-border bg-transparent border",
              )}
            />
            <span
              className={cn(
                "font-mono text-xs whitespace-nowrap",
                s.state === "now" ? "text-ink" : "text-ink-dim",
              )}
            >
              {s.label}
              {/* The state in words, because a filled dot is not a thing a
                  screen reader can report. */}
              <span className="sr-only"> ({s.state})</span>
            </span>
          </span>
          {i < stages.length - 1 ? (
            <span
              aria-hidden="true"
              className="bg-border-dim h-px min-w-4 flex-1"
            />
          ) : null}
        </li>
      ))}
    </ol>
  )
}
