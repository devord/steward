import { renderToStaticMarkup } from "react-dom/server"

import { Throughput, type ThroughputSpec } from "./components/Throughput.tsx"
import { type BottomLine, BottomLineBand } from "./components/BottomLine.tsx"
import {
  CouplingMatrix,
  type MatrixSpec,
} from "./components/CouplingMatrix.tsx"
import { EmptyState } from "./components/EmptyState.tsx"
import { Prose, type ProseItem } from "./components/Prose.tsx"
import { ProvenanceLine } from "./components/ProvenanceLine.tsx"
import {
  type QueueGroup,
  QueueTable,
  type QueueRow,
  type ViewerGroups,
} from "./components/QueueTable.tsx"
import { Rail } from "./components/Rail.tsx"
import { Series, type SeriesSpec } from "./components/Series.tsx"
import { type Stage, StageStrip } from "./components/StageStrip.tsx"
import { type DaySpec, TimeGrid } from "./components/TimeGrid.tsx"
import { Section } from "./components/Section.tsx"
import { StatTier } from "./components/StatTier.tsx"
import { type Verdict, VerdictBand } from "./components/VerdictBand.tsx"
import { Shell } from "./Shell.tsx"
import type { Tone } from "./ui/tone.ts"

interface BlockBase {
  /**
   * A fragment target, so something else in the artifact can send a reader
   * here — today the progress rail's figure, jumping to the ledger of what
   * that rail is short by (ADR-0061).
   *
   * Only emitted when set. An id nothing links to is markup nobody reads, and
   * deriving one from the label would mint a target that silently changes
   * whenever the label is reworded.
   */
  id?: string
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
  /**
   * Render only on the raw page and the full view, never on a tile however
   * wide — gated on the tile stamp rather than a width, like prose.
   *
   * For an auditor's band rather than a glancer's: `corza-risk`'s rule trace
   * restates, in evaluation order, facts the tile already carries as drivers
   * and as the reason line. Rendering it on the wide tile put `12d` on screen
   * four times. A band that repeats the tile is not a band the tile should
   * have.
   *
   * Prose is page-only whether or not this is set; a queue has to ask.
   */
  pageOnly?: boolean
  /** A band-level copy: the whole set as one payload. */
  action?: { payload: string; label?: string }
}

export interface QueueBlock extends BlockBase {
  kind: "queue"
  rows?: QueueRow[]
  /**
   * Labelled runs sharing one column set, for a ledger whose sections must
   * line up with each other. Takes precedence over `rows`.
   */
  groups?: QueueGroup[]
  /**
   * Opt into the board's viewer-faceted regrouping, by naming the three
   * buckets. Rows supply the relationships via `data`.
   */
  viewerGroups?: ViewerGroups
  showHeader?: boolean
  /** Yield before every other block — for a bookkeeping band above content. */
  trimFirst?: boolean
}

/**
 * A co-change field. Page-tall by default: a matrix needs at least four rows
 * to read as a field rather than as scattered squares, and it is the one band
 * with no trimmable list — a floor the fit pass cannot get under, so a tile
 * that shows it overflows in silence with rows still available to trim.
 */
export interface MatrixBlock extends BlockBase {
  kind: "matrix"
  spec: MatrixSpec
}

/**
 * The day as a time grid. Page-tall by default for the same reason prose is:
 * every slot has a job, so the grid needs the height to say so, and a tile
 * that cannot show the shape of a day is better spending its rows on the
 * priorities the day is built around.
 */
export interface DayBlock extends BlockBase {
  kind: "day"
  spec: DaySpec
}

/**
 * A progress band: one or more rails, each a horizon with a mark at where the
 * calendar says it should be. Optionally a stage strip, which answers *where*
 * rather than *how far* — the one thing that earns a row beside a rail without
 * being a second rendering of it.
 */
export interface ProgressBlock extends BlockBase {
  kind: "progress"
  rails: {
    id: string
    label: string
    percent: number
    tick?: number
    verdict?: string
    tone?: Tone
    caption?: string
    secondary?: boolean
    /** Fragment naming the band that lists what this rail is short by. */
    href?: string
  }[]
  stages?: Stage[]
}

/**
 * A chart band. Page only by default, and for the same reason prose is: a
 * four-column tile is 1200px and still not a reading surface, and tiles never
 * scroll, so a chart there either steals the ledger's rows or opens into the
 * clipped region.
 */
export interface SeriesBlock extends BlockBase {
  kind: "series"
  spec: SeriesSpec
}

/**
 * A per-person column chart over a day axis. Page only, like the other charts
 * — the plot needs width for the columns *and* height for the scale, and a
 * tile that gives it both has nothing left for the ledger.
 */
export interface ThroughputBlock extends BlockBase {
  kind: "throughput"
  spec: ThroughputSpec
}

/** Long-form bands — the dives under a briefing's headlines. Page only. */
export interface ProseBlock extends BlockBase {
  kind: "prose"
  items: ProseItem[]
}

/** A labelled band of content. */
export type Block =
  | QueueBlock
  | ProseBlock
  | SeriesBlock
  | ThroughputBlock
  | ProgressBlock
  | DayBlock
  | MatrixBlock

/** Whether a band has anything to render — an empty one is never drawn. */
function filled(b: Block): boolean {
  if (b.kind === "prose") return b.items.length > 0
  // Two points is the floor for a line. One is a dot claiming a trend.
  if (b.kind === "series") return b.spec.lines.some((l) => l.points.length > 1)
  // One person on one day is not a ranking. The chart's whole claim is
  // relative standing over time, and it needs both to make it.
  if (b.kind === "throughput")
    return (b.spec.views ?? []).some(
      (v) => (v.series?.authors?.length ?? 0) > 0 && (v.series?.n ?? 0) > 0,
    )
  if (b.kind === "progress")
    return b.rails.length > 0 || (b.stages ?? []).length > 0
  if (b.kind === "day") return b.spec.blocks.length > 0
  // Four is the floor for a field. Below it the squares do not read as one.
  if (b.kind === "matrix") return b.spec.labels.length >= 4
  return (
    (b.rows?.length ?? 0) > 0 || (b.groups ?? []).some((g) => g.rows.length > 0)
  )
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
  /**
   * The 1×1 glance. Every artifact has to say something at 340×160 — so one of
   * `stat` or `verdict` is required, and they are alternatives rather than
   * companions: two hero figures at the glance is two glances.
   */
  stat?: {
    value: number | string
    label: string
    tone?: Tone
    note?: string
  }
  /** The glance as a one-word status read instead of a figure. */
  verdict?: Verdict
  /**
   * The conclusion, above the evidence for it — one sentence, under the glance
   * and over the first band.
   *
   * Optional, and most artifacts should leave it unset: a ledger whose rows
   * already say what they mean does not need a sentence introducing them. It
   * is for the artifact written to be *read* rather than scanned, where the
   * reader is accountable for the work and did not watch it happen.
   */
  bottomLine?: BottomLine
  blocks?: Block[]
  /**
   * Countable facts about what the run looked at. Strings; the kit also
   * accepts `{ label, value }` because three live widgets shipped that and
   * rendered `[object Object]`. See ProvenanceLine.
   */
  provenance?: (string | { label?: string; value?: string })[]
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
      id={block.id}
      label={block.label}
      count={block.count}
      note={block.note}
      action={block.action}
      // The heading travels with its content. Gating only the paragraphs left
      // "Dives" standing over nothing on every tile — a row spent to say
      // nothing, which is what a collapsible band is for in the first place.
      className={
        (block.pageOnly ??
        (block.kind === "prose" ||
          block.kind === "series" ||
          block.kind === "day" ||
          block.kind === "matrix"))
          ? "hidden page-only:flex"
          : undefined
      }
    >
      {block.kind === "queue" ? (
        <QueueTable
          rows={block.rows}
          groups={block.groups}
          viewerGroups={block.viewerGroups}
          showHeader={block.showHeader}
          trimFirst={block.trimFirst}
        />
      ) : block.kind === "series" ? (
        <Series spec={block.spec} />
      ) : block.kind === "throughput" ? (
        <Throughput spec={block.spec} />
      ) : block.kind === "matrix" ? (
        <CouplingMatrix spec={block.spec} />
      ) : block.kind === "day" ? (
        <TimeGrid spec={block.spec} />
      ) : block.kind === "progress" ? (
        <div className="flex flex-col gap-3">
          {block.rails.map((r) => (
            <Rail key={r.id} {...r} />
          ))}
          {/* Height AND width. It costs a whole row, so a short tile spends
              that row better on the ledger — but the strip is a horizontal
              chain of nowrap labels with no way to shed one, so a *narrow*
              tile cannot hold it either. On height alone a 340×474 tile drew
              a four-act strip 166px wider than the frame, running the last
              act off the edge: the silent crop ADR-0019 forbids, from the
              same mistake the verdict band's gate made — grading a two-axis
              question on one axis. */}
          {block.stages?.length ? (
            <div className="tier-detail:taller:block hidden">
              <StageStrip stages={block.stages} />
            </div>
          ) : null}
        </div>
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
      {doc.verdict ? (
        <VerdictBand verdict={doc.verdict} />
      ) : doc.stat ? (
        <StatTier {...doc.stat} />
      ) : null}
      {/* The glance tier is the stat and nothing else — at 340×160 there is no
          room for a ledger under it, and a tier is a viewport rather than a
          crop. Everything below appears once the tile grows in either
          dimension. */}
      <div className="beyond-glance:flex hidden flex-col gap-3">
        {/* Above the split, not inside the main column: the conclusion is about
            the whole run, and a rail beside it would read as a caveat on it. */}
        {doc.bottomLine ? <BottomLineBand line={doc.bottomLine} /> : null}
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
