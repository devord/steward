import type { ReactNode } from "react"

import { CopyAction } from "./CopyAction.tsx"

/**
 * A labelled band with a hairline rule.
 *
 * The `count` slot exists to keep facts that are *not* rows out of prose. A
 * held-back tally belongs on the label — `Recommended 3 · 12 held back` — not
 * in a sentence underneath, which is the blob the design language warns about.
 *
 * The whole section is the collapsible unit for the fit pass: trimming a list
 * to zero would otherwise leave a heading advertising content that is no
 * longer under it, which spends a row to say nothing.
 */
export function Section({
  label,
  count,
  action,
  children,
}: {
  label?: string
  count?: string
  /**
   * A band-level copy — the whole set as one payload, where each row also
   * offers its own. `ticket-gaps` is the case: eighteen recommendations, and
   * the reader usually wants every prompt at once rather than eighteen
   * clicks. Detail tier and up, like the per-row action, since it needs the
   * width and a glance tier is not a working surface.
   */
  action?: { payload: string; label?: string }
  children: ReactNode
}) {
  return (
    <section data-fit-section className="flex flex-col gap-1.5">
      {label ? (
        <div className="flex items-baseline gap-2">
          {/* 12px is the floor, not a starting point (widget-standard §6):
              no fainter, smaller uppercase eyebrow below this. */}
          <h2 className="text-ink-dim m-0 font-mono text-xs font-normal">
            {label}
            {/* No dimmer tier to reach for — ink-faint is glyph-only — so the
                separator does the delineating. */}
            {count ? <span> · {count}</span> : null}
          </h2>
          <hr className="border-border-dim m-0 flex-1 border-t" />
          {action ? (
            <span className="hidden tier-detail:inline-flex">
              <CopyAction {...action} />
            </span>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  )
}
