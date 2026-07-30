import type { ReactNode } from "react"

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
  children,
}: {
  label?: string
  count?: string
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
        </div>
      ) : null}
      {children}
    </section>
  )
}
