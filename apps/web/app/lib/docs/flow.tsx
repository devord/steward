import { RotateCcw } from "lucide-react"
import type { ReactNode } from "react"

/**
 * Terminal-calm flow diagrams for docs pages — the rail idiom (one hairline
 * spine, a node per step) instead of ASCII art, so diagrams theme with the
 * palette, reflow on phones, and read in the same visual language as the
 * app's sidebar. Steps carry a lucide icon in a quiet chip; the one step a
 * diagram is really about takes the accent.
 */
export function Flow({ children }: { children: ReactNode }) {
  return <div className="not-prose my-6 flex flex-col">{children}</div>
}

/**
 * One step on the spine. `label` is the mono headline (what happens);
 * `children` the sans detail (how / where); `icon` a lucide glyph for the
 * node chip (no icon → a bare dot). `accent` lights the chip for the one
 * step a diagram is really about — at most one per Flow.
 */
export function FlowStep({
  label,
  icon,
  accent,
  last,
  children,
}: {
  label: string
  icon?: ReactNode
  accent?: boolean
  last?: boolean
  children?: ReactNode
}) {
  return (
    <div className="relative flex gap-3.5 pb-7 last:pb-0">
      {!last && (
        <span
          aria-hidden
          className="absolute top-8 bottom-1 left-[13.5px] w-px bg-fd-border"
        />
      )}
      <span
        aria-hidden
        className={`flex size-7 shrink-0 items-center justify-center rounded-md border [&_svg]:size-[15px] ${
          accent
            ? "border-fd-primary/50 bg-fd-primary/10 text-fd-primary"
            : "border-fd-border bg-fd-card text-fd-muted-foreground"
        }`}
      >
        {icon ?? (
          <span
            className={`size-[7px] rounded-full ${
              accent ? "bg-fd-primary" : "bg-fd-muted-foreground/60"
            }`}
          />
        )}
      </span>
      <div className="min-w-0">
        <div className="flex min-h-7 items-center font-mono text-[14px] font-medium text-fd-foreground">
          {label}
        </div>
        {children != null && (
          <div className="mt-0.5 max-w-[54ch] text-[14px] leading-[1.6] text-fd-muted-foreground [&_code]:px-[4px] [&_code]:py-0 [&_code]:text-[0.9em]">
            {children}
          </div>
        )}
      </div>
    </div>
  )
}

/** A closing row for cyclic flows: the arrow back to the top of the spine. */
export function FlowLoop({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3.5 pt-1">
      <span
        aria-hidden
        className="flex w-7 shrink-0 justify-center text-fd-muted-foreground"
      >
        <RotateCcw className="size-3.5" />
      </span>
      <div className="text-[13px] leading-5 text-fd-muted-foreground italic">
        {children}
      </div>
    </div>
  )
}

/**
 * A labelled phase within a multi-phase flow ("enact" vs "every run"):
 * a quiet mono caption above its steps, hairline-ruled like the app's
 * section labels.
 */
export function FlowPhase({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="mb-3">
      <div className="mb-4 flex items-baseline gap-3">
        <span className="font-mono text-[13px] text-fd-muted-foreground">
          {label}
        </span>
        <span aria-hidden className="h-px flex-1 self-center bg-fd-border" />
      </div>
      {children}
    </div>
  )
}
