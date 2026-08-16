/**
 * What the run actually looked at, as countable facts.
 *
 * The point is that coverage is decomposed rather than asserted: "38 kb pages
 * audited · 9 features · 8 data · 9 integrations" tells a reader what the
 * absence of a finding is worth, where "audited the knowledge base" tells them
 * nothing. Page tier and up — it is the last thing to earn space on a tile.
 */
import { isJsonString, isRecord } from "../json.ts"
import { Icon, INLINE_GLYPH } from "../ui/icon.tsx"

/**
 * A fact, however the routine phrased it.
 *
 * Three live widgets — `corza-progress`, `corza-risk`, `ui-figma-drifts` —
 * published `{ label, value }` here and rendered a line of `[object Object]`,
 * because `facts.join(" · ")` stringifies whatever it is given and the
 * validator only checked that the array *was* an array. The object shape is a
 * reasonable guess: this field is documented as "countable facts", every other
 * labelled thing in the contract is an object, and `provenanceLink` beside it
 * is `{ href, label }`. So the kit accepts both and joins the pair the way a
 * routine writing strings would have written it by hand.
 *
 * `reviewDoc` still names it, because one shape read back is easier than two.
 */
function fact(f: string | { label?: string; value?: string }): string {
  if (isJsonString(f)) return f
  // `validateDoc` only checks that `provenance` is an array — never its
  // entries. So a null or a number reaches here, and neither has fields to
  // read: `isRecord` is what the old `f?.label` was doing.
  if (!isRecord(f)) return String(f)
  // Strings only. A routine that emitted `{ label: null }` must not print
  // "null" into the line.
  const parts = [f.label, f.value].filter(isJsonString)
  return parts.length ? parts.join(" ") : String(f)
}

export function ProvenanceLine({
  facts,
  /** Where the underlying record lives — the tile is triage, this is where
   *  the thing actually gets changed. */
  link,
}: {
  facts: (string | { label?: string; value?: string })[]
  link?: { href: string; label: string }
}) {
  if (facts.length === 0 && !link) return null
  return (
    <p className="text-ink-dim m-0 hidden font-mono text-xs tier-page:block">
      {facts.map(fact).join(" · ")}
      {link ? (
        <>
          {facts.length ? " · " : null}
          <a
            href={link.href}
            target="_blank"
            rel="noopener"
            className="hover:text-ink underline decoration-transparent underline-offset-2 hover:decoration-current"
          >
            {link.label}
            {/* Drawn, not typed: U+2197 is outside the injected font subset
                and arrived from a fallback face. See INLINE_GLYPH. */}
            <Icon
              name="arrow-up-right"
              className={`${INLINE_GLYPH} ml-1 decoration-transparent`}
            />
          </a>
        </>
      ) : null}
    </p>
  )
}
