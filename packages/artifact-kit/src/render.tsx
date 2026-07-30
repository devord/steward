import { renderToStaticMarkup } from "react-dom/server"

import { EmptyState } from "./components/EmptyState.tsx"
import { ProvenanceLine } from "./components/ProvenanceLine.tsx"
import { QueueTable, type QueueRow } from "./components/QueueTable.tsx"
import { Section } from "./components/Section.tsx"
import { StatTier } from "./components/StatTier.tsx"
import { Shell } from "./Shell.tsx"

/** A labelled band of content. One variant today; the union is the seam. */
export type Block = {
  kind: "queue"
  label?: string
  /** Facts that are not rows — "12 held back" — ride the label. */
  count?: string
  rows: QueueRow[]
  showHeader?: boolean
  /** Yield before every other block — for a bookkeeping band above content. */
  trimFirst?: boolean
}

/**
 * What a routine emits. Everything here is *content*: no markup, no classes,
 * no breakpoints, no fit rules. That split is the whole point — a routine
 * template describes what to say, and the kit decides how it looks at each
 * tier, so a design fix is a kit change rather than 4,520 lines of prose
 * re-derived per run.
 */
export interface ArtifactDoc {
  slug: string
  /** Document heading; rendered screen-reader-only. Defaults to the slug. */
  title?: string
  /** ISO-8601 UTC. */
  generatedAt: string
  /** The 1×1 glance. Required: every artifact has to say something at 340×160. */
  stat: {
    value: number | string
    label: string
    tone?: "neutral" | "attn" | "warn" | "bad" | "good"
    note?: string
  }
  blocks?: Block[]
  provenance?: string[]
  /** Where the underlying record lives — the sheet, the board, the register. */
  provenanceLink?: { href: string; label: string }
  /** Inert JSON the artifact carries for its own next run. See Shell. */
  state?: { id: string; data: unknown }[]
  /** ADR-0043 briefing — richer than the render, closing with `## Ask me about`. */
  context?: string
  /**
   * Shown instead of the blocks when there is nothing to list. Having nothing
   * to report is an outcome, not a failure, and it still gets designed.
   */
  empty?: { headline: string; detail?: string }
}

function Document({ doc }: { doc: ArtifactDoc }) {
  const blocks = doc.blocks ?? []
  const hasRows = blocks.some((b) => b.rows.length > 0)
  return (
    <>
      <StatTier {...doc.stat} />
      {/* The glance tier is the stat and nothing else — at 340×160 there is no
          room for a ledger under it, and a tier is a viewport rather than a
          crop. Everything below appears once the tile grows in either
          dimension. */}
      <div className="beyond-glance:flex hidden flex-col gap-3">
        {hasRows ? (
          blocks
            .filter((b) => b.rows.length > 0)
            .map((b, i) => (
              <Section key={b.label ?? i} label={b.label} count={b.count}>
                <QueueTable
                  rows={b.rows}
                  showHeader={b.showHeader}
                  trimFirst={b.trimFirst}
                />
              </Section>
            ))
        ) : doc.empty ? (
          <EmptyState {...doc.empty} />
        ) : null}
        {doc.provenance || doc.provenanceLink ? (
          <ProvenanceLine
            facts={doc.provenance ?? []}
            link={doc.provenanceLink}
          />
        ) : null}
      </div>
    </>
  )
}

/**
 * Render one artifact to a complete, self-contained HTML file.
 *
 * `css` is the compiled kit stylesheet, passed in rather than imported so the
 * build controls exactly which bytes get inlined.
 */
export function renderArtifact(doc: ArtifactDoc, css: string): string {
  return `<!doctype html>${renderToStaticMarkup(
    <Shell
      slug={doc.slug}
      title={doc.title}
      generatedAt={doc.generatedAt}
      css={css}
      context={doc.context}
      state={doc.state}
    >
      <Document doc={doc} />
    </Shell>,
  )}`
}
