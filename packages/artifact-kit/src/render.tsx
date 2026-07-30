import { renderToStaticMarkup } from "react-dom/server"

import { EmptyState } from "./components/EmptyState.tsx"
import { Prose, type ProseItem } from "./components/Prose.tsx"
import { ProvenanceLine } from "./components/ProvenanceLine.tsx"
import { QueueTable, type QueueRow } from "./components/QueueTable.tsx"
import { Section } from "./components/Section.tsx"
import { StatTier } from "./components/StatTier.tsx"
import { Shell } from "./Shell.tsx"
import type { Tone } from "./ui/tone.ts"

interface BlockBase {
  label?: string
  /** Facts that are not rows — "12 held back" — ride the label. */
  count?: string
  /** One quiet line under the band, subordinate to it. See Section. */
  note?: string
  /**
   * Put this band in the page tier's right-hand rail instead of the main
   * column. It is a statement of *rank*, not of layout — "this qualifies the
   * story, it is not the story" — and the kit decides what that looks like.
   *
   * Below the page tier every band stacks in reading order regardless, and an
   * artifact that sets it nowhere emits exactly the markup it did before.
   */
  rail?: boolean
  /** A band-level copy: the whole set as one payload. */
  action?: { payload: string; label?: string }
}

export interface QueueBlock extends BlockBase {
  kind: "queue"
  rows: QueueRow[]
  showHeader?: boolean
  /** Yield before every other block — for a bookkeeping band above content. */
  trimFirst?: boolean
}

/** Long-form bands — the dives under a briefing's headlines. Page only. */
export interface ProseBlock extends BlockBase {
  kind: "prose"
  items: ProseItem[]
}

/** A labelled band of content. */
export type Block = QueueBlock | ProseBlock

/** Whether a band has anything to render — an empty one is never drawn. */
function filled(b: Block): boolean {
  return b.kind === "queue" ? b.rows.length > 0 : b.items.length > 0
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
    tone?: Tone
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

function Band({ block, index }: { block: Block; index: number }) {
  return (
    <Section
      key={block.label ?? index}
      label={block.label}
      count={block.count}
      note={block.note}
      action={block.action}
      // The heading travels with its content. Gating only the paragraphs left
      // "Dives" standing over nothing on every tile — a row spent to say
      // nothing, which is what a collapsible band is for in the first place.
      className={block.kind === "prose" ? "hidden page-only:flex" : undefined}
    >
      {block.kind === "queue" ? (
        <QueueTable
          rows={block.rows}
          showHeader={block.showHeader}
          trimFirst={block.trimFirst}
        />
      ) : (
        <Prose items={block.items} />
      )}
    </Section>
  )
}

function Document({ doc }: { doc: ArtifactDoc }) {
  const blocks = (doc.blocks ?? []).filter(filled)
  const main = blocks.filter((b) => !b.rail)
  const rail = blocks.filter((b) => b.rail)
  const bands = (list: Block[], offset = 0) =>
    list.map((b, i) => (
      <Band key={b.label ?? offset + i} block={b} index={offset + i} />
    ))
  return (
    <>
      <StatTier {...doc.stat} />
      {/* The glance tier is the stat and nothing else — at 340×160 there is no
          room for a ledger under it, and a tier is a viewport rather than a
          crop. Everything below appears once the tile grows in either
          dimension. */}
      <div className="beyond-glance:flex hidden flex-col gap-3">
        {blocks.length ? (
          // Both columns have to have something. Gating on the rail alone left
          // an empty 3fr track beside the content whenever every main band came
          // back empty — which is not a corner case but `repo-intel`'s quiet
          // week, where no new signal surfaced and the carried-forward
          // questions are the whole briefing. With nothing to sit beside, the
          // rail is just the content, and content renders as one stack.
          rail.length && main.length ? (
            // Two columns at the page tier, one stack below it. A wide frame
            // running five bands down a narrow ribbon on the left is the
            // failure this exists to prevent — a shipped run spent 35% of a
            // 2560px frame that way.
            //
            // The wrapper is emitted ONLY when a band asks for the rail, so an
            // artifact published before this existed carries none of these
            // classes and cannot be relaid out by the injected stylesheet. A
            // design *fix* travels through kit.css; a restructure travels
            // through markup, and this is a restructure.
            <div className="flex flex-col gap-3 tier-page:grid tier-page:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] tier-page:items-start tier-page:gap-6">
              <div className="flex flex-col gap-3">{bands(main)}</div>
              <div className="flex flex-col gap-3">
                {bands(rail, main.length)}
              </div>
            </div>
          ) : (
            bands(main.length ? main : rail)
          )
        ) : doc.empty ? (
          <EmptyState {...doc.empty} />
        ) : null}
        {/* Spans the foot under both columns — it describes the whole run. */}
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
