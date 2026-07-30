/**
 * What the run actually looked at, as countable facts.
 *
 * The point is that coverage is decomposed rather than asserted: "38 kb pages
 * audited · 9 features · 8 data · 9 integrations" tells a reader what the
 * absence of a finding is worth, where "audited the knowledge base" tells them
 * nothing. Page tier and up — it is the last thing to earn space on a tile.
 */
export function ProvenanceLine({
  facts,
  /** Where the underlying record lives — the tile is triage, this is where
   *  the thing actually gets changed. */
  link,
}: {
  facts: string[]
  link?: { href: string; label: string }
}) {
  if (facts.length === 0 && !link) return null
  return (
    <p className="text-ink-dim m-0 hidden font-mono text-xs tier-page:block">
      {facts.join(" · ")}
      {link ? (
        <>
          {facts.length ? " · " : null}
          <a
            href={link.href}
            target="_blank"
            rel="noopener"
            className="hover:text-ink underline decoration-transparent underline-offset-2 hover:decoration-current"
          >
            {link.label} ↗
          </a>
        </>
      ) : null}
    </p>
  )
}
