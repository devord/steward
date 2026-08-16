import { Fragment } from "react"

import { Badge, type BadgeTone } from "../ui/badge.tsx"
import { cn } from "../ui/cn.ts"
import { Icon, type IconName, INLINE_GLYPH } from "../ui/icon.tsx"
import { type Tone, TONE_TEXT } from "../ui/tone.ts"
import { Avatar, type Face } from "./Avatar.tsx"
import { CopyAction } from "./CopyAction.tsx"
import { Meter } from "./Meter.tsx"
import { Sparkline } from "./Sparkline.tsx"

/** Which tier a value column first appears at. */
export type ColumnTier = "always" | "compact" | "detail" | "page"

/**
 * Tier classes are looked up, never interpolated. Tailwind scans source text
 * for complete class strings, so a template literal like `tier-${t}:table-cell`
 * produces a class that exists in the markup and in no stylesheet — the column
 * silently never appears. Every variant used here has to be written out.
 */
/**
 * Direction glyphs, drawn rather than typed.
 *
 * These were the text triangles `▲ ▼ ·` on the reasoning that they "sit inline
 * in a tabular figure" — which was the mistake: U+25B2/BC are outside the
 * latin subset the board injects, so every one of them came from a fallback
 * face with its own advance, weight and baseline. See `INLINE_GLYPH`.
 *
 * The word travels with the glyph, screen-reader-only. A shape alone cannot
 * report which way a number moved, and this column is the movement.
 */
const DELTA = {
  up: { icon: "arrow-up", word: "up" },
  down: { icon: "arrow-down", word: "down" },
  flat: { icon: "minus", word: "unchanged at" },
} satisfies Record<"up" | "down" | "flat", { icon: IconName; word: string }>

const COLUMN_TIER = {
  always: "table-cell",
  compact: "hidden beyond-glance:table-cell",
  detail: "hidden tier-detail:table-cell",
  page: "hidden tier-page:table-cell",
} satisfies Record<ColumnTier, string>

/**
 * The tier a glyph's *word* joins it at: the column's own tier, floored at
 * `detail`.
 *
 * It used to be the constant `tier-page` for every column, which is two rules
 * governing one cell — `from` decided when the column appeared, and nothing
 * decided when its word did. The gap between them is where the widget spends
 * most of its life: a 2-column tile on a wide board lands around 890px, inside
 * `detail` (701px) and short of `page` (900px), so the state column showed a
 * bare clock with ~575px of empty title column beside it. A reader cannot
 * decode `clock` = "review required" from the glyph, and the word was right
 * there in the markup, `sr-only` — the screen reader was better served than
 * the screen.
 *
 * `detail` is the floor because it is where the ledger stops being a glance:
 * detail lines and `from: "detail"` columns already appear there, so a word is
 * in company rather than alone. Below it the tile genuinely has no room —
 * "changes requested" is ~135px against a 340px frame — and the glyph is the
 * honest compression.
 *
 * The cost is paid between 701 and ~780px, where the widest titles now wrap to
 * a second line to fund the word. That is the right way round: a wrapped title
 * is still readable, an unexplained glyph is not.
 *
 * Written out per tier rather than derived, for the same reason `COLUMN_TIER`
 * is — Tailwind scans source for complete class strings, so a computed
 * `tier-${t}:inline` exists in the markup and in no stylesheet, and the word
 * silently never appears. That failure mode is exactly what this fixes, so it
 * would be a poor way to fix it.
 */
const LABEL_TIER = {
  always: {
    show: "hidden tier-detail:inline",
    hide: "tier-detail:hidden sr-only",
  },
  compact: {
    show: "hidden tier-detail:inline",
    hide: "tier-detail:hidden sr-only",
  },
  detail: {
    show: "hidden tier-detail:inline",
    hide: "tier-detail:hidden sr-only",
  },
  page: { show: "hidden tier-page:inline", hide: "tier-page:hidden sr-only" },
} satisfies Record<ColumnTier, { show: string; hide: string }>

export interface QueueValue {
  /** Header word at the page tier, where the columns get named. */
  label: string
  value: string
  from?: ColumnTier
  tone?: Tone
  /** Right-align — the default for counts and countdowns. */
  numeric?: boolean
  /**
   * Render this column as a magnitude bar of `meter` units, with `value` as
   * its printed count. The scale is the column's own largest magnitude, so
   * bars compare across rows rather than each filling its own cell.
   *
   * A column, not a block: the ledger it belongs to already unions its
   * columns and gives every row a cell, so a bar needs no separate structure.
   */
  meter?: number
  /**
   * Movement since the previous run — `12d behind ↑3d`.
   *
   * Stays ink-dim whichever way it points. A worsening delta is tempting to
   * paint red, but a tile spends its accent on one thing, and on a status
   * artifact that thing is the verdict. The arrow already carries direction,
   * and direction is not the same as badness: down on a slip is good news and
   * on a burn-up is bad, so a tone here would have to be per-column anyway.
   */
  delta?: { value: string; direction: "up" | "down" | "flat" }
  /**
   * Render the value as a glyph, with the word beside it from this column's
   * own tier (floored at `detail`, see {@link LABEL_TIER}) and
   * screen-reader-only below that.
   *
   * The word is never dropped, only hidden — a review state carried by shape
   * alone is a state a screen reader cannot report. Healthy states whisper:
   * give a passing check no tone and let only the actionable ones take one.
   *
   * Because the word is what a sighted reader gets wherever there is room for
   * it, `value` has to *be* the word: `"changes requested"`, never `"x"` or a
   * repeat of the glyph's name.
   */
  icon?: IconName
  /**
   * Render the value as a trend line, oldest to newest, with `value` as the
   * printed figure beside it. Shape under a number, never instead of one.
   */
  spark?: number[]
  /**
   * Hover text plus an sr-only phrase, for a qualifier the narrow tiers have
   * no column for. A number whose basis is invisible is an unlabelled mixture
   * of two scales; this is how the basis still travels with it.
   */
  title?: string
}

/**
 * A labelled run of rows inside one table.
 *
 * Groups exist so columns align across the whole ledger rather than per
 * section. `repo-pulse` states the requirement and the smell: "one grid on
 * `main`, sections laid in with subgrid, so every state icon and age sits on
 * the same vertical down the page. A per-list grid gives each section its own
 * column widths, which is the misaligned-state smell." One `<table>` with
 * heading rows is how a table says that natively.
 */
/**
 * Labels for the viewer-faceted regrouping the board applies at render time.
 *
 * Declaring the *labels* here and the *relationships* on each row keeps the
 * published file viewer-neutral: it says who authored and who was asked, never
 * who is reading. The board resolves "you" against the signed-in viewer, so one
 * file serves everyone the board is shared with (ADR-0039).
 */
export interface ViewerGroups {
  /** Rows whose `data-reviewers` contains the viewer. */
  reviewer: string
  /** Rows whose `data-author` is the viewer. */
  author: string
  /** Everything else. */
  rest: string
}

export interface QueueGroup {
  id: string
  label?: string
  /** Facts that are not rows. Survives even when every row below is trimmed. */
  count?: string
  /**
   * Ship this group folded.
   *
   * The heading is a disclosure on every labelled group — one vocabulary, not
   * an opt-in that would leave two kinds of group heading in the corpus. This
   * flag only picks the *initial* state, and only once the board's behaviour is
   * attached: the static markup always renders open, so a raw-opened file and
   * anything that does not run scripts show every row rather than hiding
   * content behind a control that is not there yet (ADR-0039).
   */
  collapsed?: boolean
  rows: QueueRow[]
}

export interface QueueRow {
  id: string
  /** A face for the person this row belongs to, as its leading key. */
  face?: Face
  /**
   * Inert `data-*` the board's viewer-relative enhancer reads — `author`,
   * `reviewers`. Keys are prefixed, values stringified.
   *
   * Viewer-neutral by construction: the published markup carries the
   * *relationships*, never a resolved "you". Who the viewer is gets settled at
   * render time, because one file is read by everyone the board is shared
   * with (ADR-0039).
   */
  data?: Record<string, string>
  /** Leading state chip: what kind of thing this row is. */
  state?: { label: string; tone: BadgeTone }
  /** The emphasised lead — what the reader scans down. */
  title: string
  /** Where the title points. Sandbox-safe targeting is applied here. */
  href?: string
  /** The evidence line under the title. Detail tier and up. */
  detail?: string
  values?: QueueValue[]
  /**
   * Survive the fit trim. Use sparingly and never on a queue that is already
   * sorted by badness: there the sort *is* the pinning, the calm rows sink to
   * the bottom by construction, and pinning them is how a tile ends up
   * advertising only the rows that carry no urgency.
   */
  keep?: boolean
  /**
   * A payload the row can hand to the clipboard — a ready-to-run prompt, a
   * ticket body. Appears from the detail tier up: it needs a trailing column,
   * and a narrow tile is a glance rather than a working surface.
   */
  action?: { payload: string; label?: string }
}

/**
 * The ledger/queue archetype, as a real `<table>`.
 *
 * Measured against the subgrid implementation it replaces: column widths stay
 * stable while the fit pass hides rows, at every tier. The subgrid version
 * could not manage that — Chromium's track sizing failed to re-settle once
 * rows started disappearing at runtime, and the workaround was a structural
 * rule that headings must never be grid items. A table has no such constraint:
 * alignment is the layout algorithm's job, the heading lives outside the
 * element entirely, and value columns size to content without `ch` arithmetic
 * against a font they do not use.
 *
 * The table fills its frame, and **exactly one column is flexible** — the
 * title. Every other cell is `w-0 whitespace-nowrap`, so the slack has nowhere
 * else to go and the trailing values anchor to the right edge. This is the
 * ledger discipline the app's own chrome already runs on (DESIGN.md, § ledger
 * rows), applied to the artifact side.
 *
 * It replaces a shrink-to-fit table (`w-auto self-start`) whose flexible column
 * was additionally capped at a 52ch reading measure. That combination had the
 * table stop at `lead + 52ch + values` — about 620px — whatever frame it was
 * given, so every tier from a two-column tile up ended with a dead trailing
 * band, 26% of an 880px tile and 44% of the full view. Three things made that
 * the wrong trade rather than the restrained one:
 *
 *   1. The cap is a *prose* measure (52ch resolves to ~73 rendered characters
 *      at 14px) and a ledger title is scanned, not read line after line. A
 *      title longer than that wrapped to a second line while 200-400px sat
 *      empty beside it — a wrap *and* a gutter, which is the one combination
 *      shrink-to-fit was supposed to avoid. On a tile that clips (ADR-0019)
 *      that second line is also a row of the height budget spent on nothing.
 *   2. Every band around the ledger already marks the frame's right edge —
 *      `Section`'s `flex-1` rule, the provenance line's justified foot. A
 *      ledger stopping at 55% under a rule that runs to 100% reads as
 *      misalignment, not as a margin.
 *   3. Column positions moved between runs. Shrink-to-fit sizes the title
 *      column to whichever title happens to be longest *this* run, so the age
 *      column a reader compares down the page sat at a different x every time
 *      the routine republished. These artifacts regenerate on a schedule; a
 *      layout that reflows on refresh is the opposite of glanceable.
 *
 * What the old comment feared — "the mid-row hole a `1fr` title column
 * produces" — is real and is the price: a short title now has whitespace
 * between it and its values. That is what a table is, the two columns it sits
 * between are both aligned, and it costs less than the same hole plus a
 * misaligned right edge. See widget-standard §2.
 */
export function QueueTable({
  rows,
  /** Labelled runs sharing one column set. Takes precedence over `rows`. */
  groups,
  /** Opt into the board's viewer-faceted regrouping. See ViewerGroups. */
  viewerGroups,
  /**
   * Name the columns in the full view, where there is room to.
   *
   * The gate is the board's tile stamp, not a width (see the `<thead>` below).
   */
  showHeader = true,
  /**
   * Give way before every other list, whatever the reading order. For a
   * bookkeeping band that sits above the content it serves: trimming is
   * otherwise bottom-up, so the queue the widget exists for would collapse
   * entirely before one housekeeping row went.
   */
  trimFirst = false,
}: {
  rows?: QueueRow[]
  groups?: QueueGroup[]
  viewerGroups?: ViewerGroups
  showHeader?: boolean
  trimFirst?: boolean
}) {
  // One ungrouped run is the same shape with the label left off, so everything
  // below works on `bands` and the two cases never diverge.
  const bands: QueueGroup[] = groups?.length
    ? groups.filter((g) => g.rows.length > 0)
    : [{ id: "all", rows: rows ?? [] }]
  const allRows = bands.flatMap((g) => g.rows)
  // Columns are a property of the TABLE, not of whichever row happens to be
  // first. Taking them from row 0 meant a later row with a missing value slid
  // its remaining cells left under the wrong headers, and a row without an
  // action skipped a cell the header had already reserved. Union the labels in
  // first-seen order and give every row a cell for every column, blank where
  // it has nothing to say — which is also what the ledger wants: "a row
  // without one leaves the cell empty — no dash, no filler."
  const columns: QueueValue[] = []
  for (const r of allRows) {
    for (const v of r.values ?? []) {
      if (!columns.some((c) => c.label === v.label)) columns.push(v)
    }
  }
  const hasAction = allRows.some((r) => r.action)
  // The leading key column exists only if something actually lands in it. An
  // always-reserved cell is an indent nothing occupies, and since each queue
  // block is its own table, that indent is exactly what makes two lead-less
  // ledgers on one artifact start their titles at different x — the
  // re-anchoring the group mechanism above exists to prevent.
  const hasLead = allRows.some(
    (r) => r.face !== undefined || leadLabel(r) !== undefined,
  )
  const leadCount = hasLead ? 1 : 0
  // Fixed for every row, so a detail line always spans the full table.
  const columnCount = columns.length + 1 + leadCount + (hasAction ? 1 : 0)
  // One scale per meter column, taken over the whole table. Scaling each bar
  // to its own row would render every bar full and compare nothing.
  const meterMax = new Map<string, number>()
  for (const r of allRows) {
    for (const v of r.values ?? []) {
      if (v.meter === undefined) continue
      meterMax.set(v.label, Math.max(meterMax.get(v.label) ?? 0, v.meter))
    }
  }
  return (
    <table
      // `w-full` only names where the slack goes once the title column claims
      // it. Without that one `w-full` cell below, an auto table hands the
      // surplus to whichever column the algorithm likes — stranding a meter
      // against the far edge with the prose it qualifies half a screen away.
      className="w-full border-collapse font-mono text-sm tabular-nums"
      data-fit-list
      {...(trimFirst ? { "data-fit-first": "" } : {})}
      // Inert until the board injects a viewer. A raw-opened file carries the
      // attribute and no behaviour, which is the neutral render — the floor
      // ADR-0039 specifies, not a degraded state.
      {...(viewerGroups
        ? { "data-kit-viewer-groups": JSON.stringify(viewerGroups) }
        : {})}
    >
      {showHeader && columns.length > 0 ? (
        /**
         * The full view names the columns; a tile never does.
         *
         * This was `tier-page` — a width — and a width cannot answer the
         * question being asked. `tier-page` is 900px, and a 2-column tile on a
         * `wide` board (dashboard-shell caps the canvas at 1800px) lands at
         * ~876-890px, so the header turned on or off according to whether the
         * reader had picked `wide` or `fixed` in the board's density picker.
         * Nobody reaches for a canvas-width control to name their columns. The
         * same accident ran the other way in the lightbox: the full view is
         * where the header is supposed to live, and on a viewport under 900px
         * it lost it.
         *
         * `page-only` is the stamp the board sets on `<html>` (ADR-0019), so
         * this now says what it means — headers are page generosity, the same
         * gate ADR-0027 already put that idea behind — and the answer no longer
         * moves with the viewport at either end.
         *
         * That the tile has no header is the load-bearing half. It is what
         * makes "a value carries its own unit" a rule rather than a
         * preference: with the header reachable at *some* tile width, a bare
         * `"3"` looked defensible to whoever emitted it. See `reviewDoc`,
         * which now says so out loud.
         */
        <thead className="hidden page-only:table-header-group">
          <tr className="text-ink-dim text-xs">
            {hasLead ? (
              <th className="w-0 pr-3 pb-1 text-left font-normal" />
            ) : null}
            {/* Matches the body cell: the header has to claim the slack too,
                or the column widths a `<thead>` participates in settle on the
                header's own content and the two rows disagree. That is the
                `w-full`'s job and the whole of it — the word printed here was
                `item`, which names nothing a reader cannot see, and printed
                twice in any artifact carrying two ledgers. A column name a
                screen reader still wants and the screen does not is exactly
                what `sr-only` is for. */}
            <th className="w-full pb-1 text-left font-normal">
              <span className="sr-only">item</span>
            </th>
            {columns.map((c) => (
              <th
                key={c.label}
                className={cn(
                  "w-0 pb-1 pl-3 font-normal whitespace-nowrap",
                  c.numeric ? "text-right" : "text-left",
                  COLUMN_TIER[c.from ?? "always"],
                )}
              >
                {c.label}
              </th>
            ))}
            {hasAction ? (
              <th className="hidden pb-1 pl-3 tier-detail:table-cell" />
            ) : null}
          </tr>
        </thead>
      ) : null}
      {/* One <tbody> per logical row, not one for the whole table. A table may
          hold any number of them, and it is what makes a row and its detail
          line a single trimmable unit — the injected fit pass hides the
          element carrying [data-fit-item], and hiding a bare <tr> would strand
          its why-line behind. */}
      {bands.map((g) => (
        <Fragment key={g.id}>
          {g.label ? (
            // Carries no fit attributes on purpose, so it is never trimmed.
            // A group reduced to its heading still reports how many rows are
            // under it, which is informative; hiding it would say there are
            // none. Same reasoning the kit already applies to a yield-first
            // band reduced to its label.
            <tbody>
              <tr>
                <td
                  colSpan={columnCount}
                  className="text-ink-dim pt-3 pb-1 font-mono text-xs"
                >
                  {/*
                    A span, not a button — and this is the one place the kit
                    departs from the copy action's "ship the control `hidden`"
                    rule, because the element carries the heading's own text.
                    Hiding it would hide the label; rendering a second copy
                    beside it would put the label in the document twice. So the
                    static file gets plain text with no affordance, and the
                    injected behaviour *upgrades this node in place* — adding
                    `role`, `tabindex` and `aria-expanded`, and revealing the
                    caret. Nothing is behind a dead control at any point.
                  */}
                  <span
                    data-kit-disclose={g.id}
                    {...(g.collapsed ? { "data-kit-disclose-init": "" } : {})}
                  >
                    <Icon
                      name="chevron-down"
                      className={cn(INLINE_GLYPH, "kit-disclose-caret")}
                    />
                    {g.label}
                    {g.count ? <span> · {g.count}</span> : null}
                  </span>
                </td>
              </tr>
            </tbody>
          ) : null}
          {g.rows.map((r) => (
            <RowPair
              key={r.id}
              row={r}
              // Names the group each row belongs to, which is what lets the
              // disclosure fold a run of sibling `<tbody>`s. A group's rows
              // cannot be wrapped in one element — the row-plus-detail pair is
              // already the `<tbody>`, and `<tbody>` does not nest — so the
              // relationship has to be carried on each row rather than by
              // containment.
              groupId={g.label ? g.id : undefined}
              columns={columns}
              hasAction={hasAction}
              hasLead={hasLead}
              columnCount={columnCount}
              meterMax={meterMax}
            />
          ))}
        </Fragment>
      ))}
    </table>
  )
}

/**
 * The row's chip text, or undefined when there is none to print.
 *
 * A chip is a word with a border around it; a `state` carrying no word is a
 * bordered 14px void that reads as a broken image and still pushes the title
 * off the margin. `validateDoc` rejects that emit at the field, which is where
 * a routine can act on it — this is the belt to that pair of braces, for the
 * exported component and for a caller typed loosely enough to get past it.
 */
function leadLabel(row: QueueRow): string | undefined {
  return row.state?.label?.trim() || undefined
}

function RowPair({
  row,
  groupId,
  columns,
  hasAction,
  hasLead,
  columnCount,
  meterMax,
}: {
  row: QueueRow
  /** The labelled group this row sits under, when there is one. */
  groupId?: string
  /** The table's column set, so every row lines up with the header. */
  columns: QueueValue[]
  hasAction: boolean
  /** Whether the table reserves a leading key column at all. */
  hasLead: boolean
  columnCount: number
  /** Column label → the table-wide magnitude every bar in it scales against. */
  meterMax: Map<string, number>
}) {
  const lead = leadLabel(row)
  return (
    <tbody
      data-fit-item
      {...(row.keep ? { "data-fit-keep": "" } : {})}
      {...(groupId ? { "data-kit-group-of": groupId } : {})}
      // Relationships, not a resolved viewer. The enhancer buckets on these at
      // render time; the published file names nobody.
      {...Object.fromEntries(
        Object.entries(row.data ?? {}).map(([k, v]) => [`data-${k}`, v]),
      )}
    >
      <tr>
        {hasLead ? (
          // `w-0` is what makes "sizes to its content" true. Left to itself an
          // auto table hands leftover width to every column in proportion, so
          // a chip column took 299px of a 1160px table and the prose column
          // came out narrower than both of its neighbours.
          <td className="w-0 py-1 pr-2 align-baseline whitespace-nowrap">
            {row.face ? (
              <Avatar face={row.face} />
            ) : lead ? (
              <Badge tone={row.state?.tone}>{lead}</Badge>
            ) : null}
          </td>
        ) : null}
        {/* The one flexible column, and the only cell that carries a width:
            `w-0` everywhere else is what makes "all the slack lands here"
            true. It carries no measure cap. A title is scanned once, not read
            line after line, so its ceiling is the frame — capping it at a
            reading measure is what used to wrap a long title in half while the
            width it wanted sat empty to its right. */}
        {/* The column gutter is carried on the *leading* edge of each value
            cell, not the trailing edge of its neighbour, so the table's last
            column ends flush with the frame. As trailing padding it left the
            ledger 12px short of the section rule above it and the provenance
            line below it — three right edges that should be one. */}
        <td className="text-ink w-full py-1 align-baseline font-sans text-sm">
          {row.href ? (
            // In-frame navigation is sandbox-blocked (ADR-0028), so a bare
            // href goes nowhere — every link is a real new tab or it is dead.
            <a
              href={row.href}
              target="_blank"
              rel="noopener"
              className="text-ink hover:text-orange underline decoration-transparent underline-offset-2 hover:decoration-current"
            >
              {row.title}
            </a>
          ) : (
            row.title
          )}
        </td>
        {columns.map((col) => {
          // Position comes from the table's column list; only the content
          // comes from the row. A row with nothing for this column still
          // occupies it, empty.
          const v = (row.values ?? []).find((x) => x.label === col.label)
          return (
            <td
              key={col.label}
              className={cn(
                "w-0 py-1 pl-3 align-baseline whitespace-nowrap",
                col.numeric ? "text-right" : "text-left",
                // On a meter the tone paints the bar, so the count stays ink:
                // tinting both spends one signal twice and makes a long orange
                // bar shout in two registers.
                TONE_TEXT[
                  v?.meter !== undefined ? "neutral" : (v?.tone ?? "neutral")
                ],
                COLUMN_TIER[col.from ?? "always"],
              )}
              title={v?.title}
            >
              {v?.meter !== undefined ? (
                <Meter
                  value={v.meter}
                  max={meterMax.get(col.label) ?? 0}
                  label={v.value}
                  tone={v.tone}
                />
              ) : v?.spark ? (
                <span className="inline-flex items-center gap-1.5">
                  <Sparkline points={v.spark} label={`${col.label} trend`} />
                  <span>{v.value}</span>
                </span>
              ) : v?.icon ? (
                <span className="inline-flex items-center gap-1">
                  <Icon name={v.icon} />
                  <span className={LABEL_TIER[col.from ?? "always"].show}>
                    {v.value}
                  </span>
                  <span className={LABEL_TIER[col.from ?? "always"].hide}>
                    {v.value}
                  </span>
                </span>
              ) : (
                (v?.value ?? "")
              )}
              {v?.delta ? (
                // Inline text flow, not a flex group: the delta trails the
                // figure inside one cell, and an inline-flex box takes its
                // baseline from its first child — which would lift the delta's
                // own digits off the line the figure beside them sits on.
                <span className="text-ink-dim ml-1">
                  <Icon
                    name={DELTA[v.delta.direction].icon}
                    className={INLINE_GLYPH}
                  />
                  <span className="sr-only">
                    {DELTA[v.delta.direction].word}{" "}
                  </span>
                  {v.delta.value}
                </span>
              ) : null}
              {v?.title ? <span className="sr-only"> ({v.title})</span> : null}
            </td>
          )
        })}
        {hasAction ? (
          <td className="hidden py-1 pl-3 text-right align-baseline tier-detail:table-cell">
            {row.action ? <CopyAction {...row.action} /> : null}
          </td>
        ) : null}
      </tr>
      {row.detail ? (
        <tr className="hidden tier-detail:table-row">
          {/* colspan is what the subgrid version needed a spanning grid item
              for — the thing that broke its track sizing. */}
          {hasLead ? <td /> : null}
          <td
            colSpan={columnCount - (hasLead ? 1 : 0)}
            className="text-ink-dim pb-2 font-sans text-sm"
          >
            {/* The measure lives on the text, never on the cell. This is the
                one line in the ledger that is genuinely read rather than
                scanned, so it keeps the 52ch cap — but as `max-width` on a
                `<td>` that cap was also sizing the table, which is how a
                widget with short rows and long why-lines ended up exactly as
                wide as a paragraph. A detail line is a consequence of the
                row's width, never a driver of it. */}
            <span className="block max-w-[52ch] text-pretty">{row.detail}</span>
          </td>
        </tr>
      ) : null}
    </tbody>
  )
}
