import { Badge, type BadgeTone } from "../ui/badge.tsx"
import { cn } from "../ui/cn.ts"
import { type Tone, TONE_TEXT } from "../ui/tone.ts"
import { CopyAction } from "./CopyAction.tsx"

/** Which tier a value column first appears at. */
export type ColumnTier = "always" | "compact" | "detail" | "page"

/**
 * Tier classes are looked up, never interpolated. Tailwind scans source text
 * for complete class strings, so a template literal like `tier-${t}:table-cell`
 * produces a class that exists in the markup and in no stylesheet — the column
 * silently never appears. Every variant used here has to be written out.
 */
const COLUMN_TIER: Record<ColumnTier, string> = {
  always: "table-cell",
  compact: "hidden beyond-glance:table-cell",
  detail: "hidden tier-detail:table-cell",
  page: "hidden tier-page:table-cell",
}

export interface QueueValue {
  /** Header word at the page tier, where the columns get named. */
  label: string
  value: string
  from?: ColumnTier
  tone?: Tone
  /** Right-align — the default for counts and countdowns. */
  numeric?: boolean
  /**
   * Hover text plus an sr-only phrase, for a qualifier the narrow tiers have
   * no column for. A number whose basis is invisible is an unlabelled mixture
   * of two scales; this is how the basis still travels with it.
   */
  title?: string
}

export interface QueueRow {
  id: string
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
 * `width: auto` is load-bearing. It makes surplus width land as one trailing
 * gutter instead of stretching the tracks apart, which is the mid-row hole a
 * `1fr` title column produces at the page tier.
 */
export function QueueTable({
  rows,
  /** Name the columns at the page tier, where there is room to. */
  showHeader = true,
  /**
   * Give way before every other list, whatever the reading order. For a
   * bookkeeping band that sits above the content it serves: trimming is
   * otherwise bottom-up, so the queue the widget exists for would collapse
   * entirely before one housekeeping row went.
   */
  trimFirst = false,
}: {
  rows: QueueRow[]
  showHeader?: boolean
  trimFirst?: boolean
}) {
  // Columns are a property of the TABLE, not of whichever row happens to be
  // first. Taking them from row 0 meant a later row with a missing value slid
  // its remaining cells left under the wrong headers, and a row without an
  // action skipped a cell the header had already reserved. Union the labels in
  // first-seen order and give every row a cell for every column, blank where
  // it has nothing to say — which is also what the ledger wants: "a row
  // without one leaves the cell empty — no dash, no filler."
  const columns: QueueValue[] = []
  for (const r of rows) {
    for (const v of r.values ?? []) {
      if (!columns.some((c) => c.label === v.label)) columns.push(v)
    }
  }
  const hasAction = rows.some((r) => r.action)
  // Fixed for every row, so a detail line always spans the full table.
  const columnCount = columns.length + 2 + (hasAction ? 1 : 0)
  return (
    <table
      className="w-auto border-collapse font-mono text-sm tabular-nums"
      data-fit-list
      {...(trimFirst ? { "data-fit-first": "" } : {})}
    >
      {showHeader && columns.length > 0 ? (
        <thead className="hidden tier-page:table-header-group">
          <tr className="text-ink-dim text-xs">
            <th className="pr-3 pb-1 text-left font-normal" />
            <th className="pr-3 pb-1 text-left font-normal">item</th>
            {columns.map((c) => (
              <th
                key={c.label}
                className={cn(
                  "pr-3 pb-1 font-normal whitespace-nowrap",
                  c.numeric ? "text-right" : "text-left",
                  COLUMN_TIER[c.from ?? "always"],
                )}
              >
                {c.label}
              </th>
            ))}
            {hasAction ? (
              <th className="hidden pb-1 tier-detail:table-cell" />
            ) : null}
          </tr>
        </thead>
      ) : null}
      {/* One <tbody> per logical row, not one for the whole table. A table may
          hold any number of them, and it is what makes a row and its detail
          line a single trimmable unit — the injected fit pass hides the
          element carrying [data-fit-item], and hiding a bare <tr> would strand
          its why-line behind. */}
      {rows.map((r) => (
        <RowPair
          key={r.id}
          row={r}
          columns={columns}
          hasAction={hasAction}
          columnCount={columnCount}
        />
      ))}
    </table>
  )
}

function RowPair({
  row,
  columns,
  hasAction,
  columnCount,
}: {
  row: QueueRow
  /** The table's column set, so every row lines up with the header. */
  columns: QueueValue[]
  hasAction: boolean
  columnCount: number
}) {
  return (
    <tbody data-fit-item {...(row.keep ? { "data-fit-keep": "" } : {})}>
      <tr>
        <td className="py-1 pr-2 align-baseline">
          {row.state ? (
            <Badge tone={row.state.tone}>{row.state.label}</Badge>
          ) : null}
        </td>
        {/* The one flexible column. Capped at a 52ch measure so it stops
            growing before the line becomes unreadable; everything else sizes
            to its content. */}
        <td className="text-ink max-w-[52ch] py-1 pr-3 align-baseline font-sans text-sm">
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
                "py-1 pr-3 align-baseline whitespace-nowrap",
                col.numeric ? "text-right" : "text-left",
                TONE_TEXT[v?.tone ?? "neutral"],
                COLUMN_TIER[col.from ?? "always"],
              )}
              title={v?.title}
            >
              {v?.value ?? ""}
              {v?.title ? <span className="sr-only"> ({v.title})</span> : null}
            </td>
          )
        })}
        {hasAction ? (
          <td className="hidden py-1 text-right align-baseline tier-detail:table-cell">
            {row.action ? <CopyAction {...row.action} /> : null}
          </td>
        ) : null}
      </tr>
      {row.detail ? (
        <tr className="hidden tier-detail:table-row">
          {/* colspan is what the subgrid version needed a spanning grid item
              for — the thing that broke its track sizing. */}
          <td />
          <td
            colSpan={columnCount - 1}
            className="text-ink-dim max-w-[52ch] pb-2 font-sans text-sm"
          >
            {row.detail}
          </td>
        </tr>
      ) : null}
    </tbody>
  )
}
