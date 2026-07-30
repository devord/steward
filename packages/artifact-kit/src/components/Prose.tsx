export interface ProseItem {
  id: string
  /** The lead the reader scans for — a dive's headline. */
  title?: string
  /** Where the title points. Sandbox-safe targeting is applied here. */
  href?: string
  /** One or two paragraphs. Blank lines separate them. */
  body: string
  /** The quiet line under the prose — evidence, dates, attribution. */
  meta?: string
}

/**
 * Long-form bands: the briefing's dives, where a ledger row's headline opens
 * into the reasoning behind it.
 *
 * **Page only**, and gated on the tile stamp rather than a width. A four-column
 * tile is 1200px and still not a reading surface — ADR-0027 gates page
 * generosity on `data-steward-tile` for exactly this, and `repo-intel` asks for
 * dives at "full view / raw page", not at the widest tile.
 *
 * That gate also keeps prose clear of the fit pass, which only runs on a tile:
 * paragraphs are not trimmable units, and a dive cut to "+1 more" would be a
 * truncated argument rather than a shorter list.
 *
 * The gate lives on the *band* (see `Band` in render.tsx), not here. Hiding
 * only the paragraphs left the section heading behind on every tile —
 * "Dives" advertising content that was not under it, which is the exact row
 * spent to say nothing that `Section` exists to avoid.
 */
export function Prose({ items }: { items: ProseItem[] }) {
  return (
    <div className="flex flex-col gap-4">
      {items.map((item) => (
        <article key={item.id} className="flex flex-col gap-1">
          {item.title ? (
            <h3 className="text-ink m-0 font-sans text-sm font-semibold">
              {item.href ? (
                // In-frame navigation is sandbox-blocked (ADR-0028), so a bare
                // href goes nowhere — every link is a real new tab or it is dead.
                <a
                  href={item.href}
                  target="_blank"
                  rel="noopener"
                  className="text-ink hover:text-orange underline decoration-transparent underline-offset-2 hover:decoration-current"
                >
                  {item.title}
                </a>
              ) : (
                item.title
              )}
            </h3>
          ) : null}
          {/* Capped at the same 52ch measure the ledger's flexible column
              uses, so a wide frame gives the page more columns rather than
              longer lines. */}
          {item.body.split(/\n\s*\n/).map((para, i) => (
            <p
              key={i}
              className="text-ink-dim m-0 max-w-[52ch] font-sans text-sm"
            >
              {para}
            </p>
          ))}
          {item.meta ? (
            <p className="text-ink-dim m-0 font-mono text-xs">{item.meta}</p>
          ) : null}
        </article>
      ))}
    </div>
  )
}
