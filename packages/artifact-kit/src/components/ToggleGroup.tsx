import { cn } from "../ui/cn.ts"

/**
 * A set of mutually exclusive views, one of them current.
 *
 * The first of ADR-0050's interaction floor to ship. Like the copy action it
 * needs no framework: the markup is static, the behaviour is injected by the
 * board, and the two meet at a data attribute. Alpine stays unshipped until a
 * routine genuinely writes `x-data` — a toggle is not that routine.
 *
 * **Ships `hidden`, revealed by the injected behaviour.** A raw-opened file
 * has nothing attached, and a control that looks live and does nothing is
 * worse than no control — the same degrade-to-honest rule CopyAction follows
 * and ADR-0039 sets for person-relative content. What the static file shows is
 * `value`: one honest view of the data, not a broken switch above it.
 *
 * The selection reaches the rest of the artifact two ways, so the simple case
 * needs no routine code at all:
 *
 * 1. **`data-kit-toggle-<key>` on `<html>`**, which CSS can select on — enough
 *    on its own to show one panel and hide its siblings.
 * 2. **a `kit:toggle` event**, for a chart that has to recompute rather than
 *    re-reveal. That is the seam repo-stats' column geometry hangs off.
 */
export interface ToggleOption {
  value: string
  label: string
}

export interface ToggleGroupSpec {
  /**
   * Names this axis. Stamped as `data-kit-toggle-<key>` and carried in the
   * event, so one artifact can hold several independent toggles — repo-stats
   * runs three (grouping, cumulation, window).
   */
  key: string
  options: ToggleOption[]
  /** The view the static render shows. Defaults to the first option. */
  value?: string
  /** Accessible name for the set — what the options are choosing between. */
  label?: string
}

export function ToggleGroup({ spec }: { spec: ToggleGroupSpec }) {
  const current = spec.value ?? spec.options[0]?.value
  return (
    <div
      hidden
      role="group"
      aria-label={spec.label}
      data-kit-toggle={spec.key}
      data-kit-toggle-value={current}
      className="border-border-dim inline-flex items-center gap-0 rounded-sm border p-0.5"
    >
      {spec.options.map((o) => (
        <button
          key={o.value}
          type="button"
          data-kit-toggle-option={o.value}
          // The pressed one is the current view, which is a state a screen
          // reader has to be told: the styling below says it in colour only.
          aria-pressed={o.value === current}
          className={cn(
            "rounded-xs px-1.5 py-0.5 font-mono text-xs leading-none",
            o.value === current
              ? "bg-bg3 text-ink"
              : "text-ink-dim hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
