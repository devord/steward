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
const DELTA: Record<"up" | "down" | "flat", { icon: IconName; word: string }> =
  {
    up: { icon: "arrow-up", word: "up" },
    down: { icon: "arrow-down", word: "down" },
    flat: { icon: "minus", word: "unchanged at" },
  }

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
   * Render the value as a glyph, with the word beside it from the page tier
   * and screen-reader-only below that.
   *
   * The word is never dropped, only hidden — a review state carried by shape
   * alone is a state a screen reader cannot report. Healthy states whisper:
   * give a passing check no tone and let only the actionable ones take one.
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
 * `width: auto` is load-bearing. It makes surplus width land as one trailing
 * gutter instead of stretching the tracks apart, which is the mid-row hole a
 * `1fr` title column produces at the page tier.
 */
export function QueueTable({
  rows,
  /** Labelled runs sharing one column set. Takes precedence over `rows`. */
  groups,
  /** Opt into the board's viewer-faceted regrouping. See ViewerGroups. */
  viewerGroups,
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
      // `self-start` is what makes `w-auto` mean anything: the band lays its
      // children out in a flex column, which stretches them, and a stretched
      // auto table hands the slack to whichever column the algorithm likes —
      // stranding the meter against the far edge with the prose it qualifies
      // half a screen away.
      className="w-auto self-start border-collapse font-mono text-sm tabular-nums"
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
        <thead className="hidden tier-page:table-header-group">
          <tr className="text-ink-dim text-xs">
            {hasLead ? (
              <th className="w-0 pr-3 pb-1 text-left font-normal" />
            ) : null}
            <th className="pr-3 pb-1 text-left font-normal">item</th>
            {columns.map((c) => (
              <th
                key={c.label}
                className={cn(
                  "w-0 pr-3 pb-1 font-normal whitespace-nowrap",
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
                  {g.label}
                  {g.count ? <span> · {g.count}</span> : null}
                </td>
              </tr>
            </tbody>
          ) : null}
          {g.rows.map((r) => (
            <RowPair
              key={r.id}
              row={r}
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
  columns,
  hasAction,
  hasLead,
  columnCount,
  meterMax,
}: {
  row: QueueRow
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
                "w-0 py-1 pr-3 align-baseline whitespace-nowrap",
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
                  <span className="hidden tier-page:inline">{v.value}</span>
                  <span className="tier-page:hidden sr-only">{v.value}</span>
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
          <td className="hidden py-1 text-right align-baseline tier-detail:table-cell">
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
            className="text-ink-dim max-w-[52ch] pb-2 font-sans text-sm"
          >
            {row.detail}
          </td>
        </tr>
      ) : null}
    </tbody>
  )
}
