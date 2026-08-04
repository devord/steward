import type { ReactNode } from "react"

import { cn } from "../ui/cn.ts"
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
  id,
  label,
  count,
  note,
  action,
  className,
  children,
}: {
  /** Fragment target, when something in the artifact links here. See BlockBase. */
  id?: string
  label?: string
  count?: string
  /**
   * One quiet line under the band, for a fact that qualifies it without
   * belonging to it — `request-queue`'s "plus 15 in own backlog · 42h" under
   * the ledger it is deliberately excluded from.
   *
   * It stays visibly subordinate and takes no tone: giving it the ledger's
   * treatment would invite the reader to add it to the number above, which is
   * the error the exclusion exists to prevent.
   */
  note?: string
  /**
   * A band-level copy — the whole set as one payload, where each row also
   * offers its own. `ticket-gaps` is the case: eighteen recommendations, and
   * the reader usually wants every prompt at once rather than eighteen
   * clicks. Detail tier and up, like the per-row action, since it needs the
   * width and a glance tier is not a working surface.
   */
  action?: { payload: string; label?: string }
  /** Gate the whole band, heading included. See the prose case in render.tsx. */
  className?: string
  children: ReactNode
}) {
  return (
    <section
      {...(id ? { id } : {})}
      data-fit-section
      className={cn("flex flex-col gap-1.5", className)}
    >
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
      {note ? (
        // Its own fit section AND fit list, both on this element. The list is
        // what makes the line trimmable; the section is what keeps `owner()`
        // from walking up to the band above and collapsing the whole ledger
        // when this one line has to go. Being a single unit, it shows whole or
        // not at all — there is no "+1 more" to leave behind.
        //
        // No [data-fit-first]: it already sits below the ledger, and the pass
        // trims bottom-up, so position alone gives it up before a single row.
        <div
          data-fit-section
          data-fit-list
          className="text-ink-dim font-mono text-xs"
        >
          <span data-fit-item>{note}</span>
        </div>
      ) : null}
    </section>
  )
}
