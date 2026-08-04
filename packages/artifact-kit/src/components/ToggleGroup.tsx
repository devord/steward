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
      // No frame. It used to carry one — `border-border-dim` around the set,
      // with the pressed option filled `bg-bg3` — and those are the *same
      // value* in the canonical row (#45403d each), so the line that was
      // supposed to say "these two are one choice" read as the same material
      // as the fill that says "this one is on". A band running three of these
      // side by side then had six chips in a row whose grouping was carried by
      // an 8px gap against a 12px one, and the whole strip read as six
      // unrelated buttons.
      //
      // The palette has no token for a control boundary either: chrome spends
      // `border-strong` on fill-less controls, and the artifact tokens stop at
      // `border`, which sits at 2.25:1 on `bg1` — under 1.4.11's floor for the
      // one line identifying a control. So the grouping is proximity and the
      // state is a fill, both of which clear their bars without a hairline
      // pretending to.
      className="inline-flex items-center gap-0.5"
    >
      {spec.options.map((o) => (
        <button
          key={o.value}
          type="button"
          data-kit-toggle-option={o.value}
          // The pressed one is the current view — a state a screen reader has
          // to be told, and the *only* place the current view is recorded.
          aria-pressed={o.value === current}
          // Painted from `aria-pressed`, not from a branch on `current`, so
          // there is one definition of which option looks active. A branch here
          // baked the highlight into the markup: the runtime flipped
          // `aria-pressed` and rebuilt the chart correctly while the box stayed
          // on the option the server happened to render, which reads as a
          // toggle that did nothing. Every option ships with identical classes;
          // moving the attribute is what moves the box.
          // `min-h-6` rather than vertical padding: 24px is WCAG 2.5.8's
          // target minimum, and the options touch, so the spacing exception
          // that lets a small target pass does not apply here. It shipped at
          // 16px, which is a target you miss on a trackpad and cannot hit at
          // all with a thumb. The label stays at the 12px artifact floor — the
          // box grows around it rather than the type growing with it.
          className={cn(
            "inline-flex min-h-6 items-center rounded-sm px-2",
            "font-mono text-xs leading-none",
            "text-ink-dim hover:bg-bg2 hover:text-ink",
            "aria-pressed:bg-bg3 aria-pressed:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
