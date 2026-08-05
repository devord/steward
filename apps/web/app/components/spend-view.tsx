import { useMemo } from "react"

import { ArrowLeft } from "lucide-react"

import type { Routine } from "@steward/schema"

import { CostDash, usdLabel } from "./cost.tsx"
import { NavShell } from "./nav-shell.tsx"
import { rowLinkCls } from "./routines-view.tsx"
import { Link } from "~/components/ui/link"
import { cn } from "~/lib/utils"
import type { SidebarData } from "../lib/dashboard.server.ts"
import { useT, type Translate } from "../lib/i18n.tsx"
import type { PublishLedger } from "../lib/publish-ledger.ts"
import { routineHref, routinesHref } from "../lib/repos.ts"
import { summarizeSpend, type SpendDay, type SpendGroup } from "../lib/spend.ts"
import type { DiscoveredTemplate } from "../lib/templates.ts"
import { useOptimisticSidebar } from "../lib/optimistic-boards.ts"
import { useStreamed } from "../lib/use-streamed.ts"

interface RepoInfo {
  full: string
  name: string
}

/**
 * What the repo's routines cost (ADR-0061): the publish ledger the pool's
 * average already reads, rolled up over the window and drawn.
 *
 * One series — dollars — so there is no categorical palette here and no
 * legend to carry identity; the bars are the ledgers' neutral tick at chart
 * scale, and every one of them is labelled in text beside it. The page is an
 * analysis surface, not a console: no panel borders, no toolbar, hairlines
 * and whitespace doing the grouping (DESIGN.md's anti-reference to Grafana
 * chrome is deliberate).
 */
export function SpendView({
  repo,
  sidebar,
  login,
  displayName,
  now,
  routines,
  templates,
  spend,
}: {
  repo: RepoInfo
  sidebar: SidebarData | Promise<SidebarData>
  login: string
  displayName: string | null
  now: number
  routines: Routine[]
  /** Streamed (ADR-0029): only the band roll-up reads these, so the page
      paints on the ledger and inheriting routines join their band after. */
  templates: DiscoveredTemplate[] | Promise<DiscoveredTemplate[]>
  /** Streamed: the repo's publish receipts. Never rejects. */
  spend: Promise<PublishLedger>
}) {
  const t = useT()
  const sidebarData = useOptimisticSidebar(sidebar)
  const ledger = useStreamed(spend, `spend:${repo.full}`)
  const templatesData = useStreamed(templates, `templates:${repo.full}`)
  const templateCategories = useMemo(
    () =>
      Object.fromEntries(
        (templatesData ?? []).flatMap((template) =>
          template.widget.category
            ? [[template.id, template.widget.category]]
            : [],
        ),
      ),
    [templatesData],
  )
  const summary = useMemo(
    () =>
      ledger == null
        ? null
        : summarizeSpend(ledger.entries, routines, {
            repoOwner: repo.full.split("/")[0],
            templateCategories,
            now,
          }),
    [ledger, routines, repo.full, templateCategories, now],
  )

  return (
    <NavShell
      nav={{
        activeRepo: "",
        dashboardSlug: "",
        routinesRepo: repo.full,
        sidebar: sidebarData,
        login,
        displayName,
      }}
      cap="max-w-5xl"
      context="spend"
    >
      <nav className="mb-3">
        <Link
          to={routinesHref(repo.full)}
          className="inline-flex items-center gap-1.5 font-mono text-xs text-ink-dim outline-none hover:text-foreground focus-visible:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-3.5" />
          {t("runs.back")}
        </Link>
      </nav>

      <header className="mb-8">
        <h1 className="font-mono text-lg font-medium text-foreground">
          {t("spend.title")}
        </h1>
        <p className="mt-0.5 max-w-prose text-sm text-ink-dim">
          {t("spend.subtitle")}
        </p>
      </header>

      {summary == null ? (
        <Loading t={t} />
      ) : ledger?.unreachable ? (
        <p className="py-2 text-sm text-ink-dim">{t("spend.unreachable")}</p>
      ) : summary.runs === 0 ? (
        <Empty t={t} />
      ) : (
        <>
          {/* The headline states the sum, what it covers, and what it cost per
              run — in that order, because a total nobody can scope is not a
              fact. Not a stat-card row: three figures on one line, at ledger
              size, since this is a reading surface and they are a sentence. */}
          <section className="border-b border-border pb-5">
            <p className="flex flex-wrap items-baseline gap-x-6 gap-y-1 font-mono">
              <span className="text-2xl font-medium text-foreground tabular-nums">
                ≈{usdLabel(summary.usd)}
              </span>
              <span className="text-xs text-ink-dim">
                {t("spend.runsCovered", {
                  n: summary.priced,
                  m: summary.runs,
                })}
              </span>
              {summary.mean != null && (
                <span className="text-xs text-ink-dim">
                  {t("runs.costEach", { usd: usdLabel(summary.mean) })}
                </span>
              )}
            </p>
            <p className="mt-2 max-w-prose text-xs text-ink-dim">
              {ledger?.capped
                ? t("spend.reachCapped", { n: summary.runs })
                : t("spend.reach")}{" "}
              {t("runs.costHint")}
            </p>
          </section>

          <DayStrip days={summary.days} t={t} />

          <Ranked
            heading={t("spend.byRoutine")}
            rows={summary.byRoutine}
            t={t}
            href={(key) => routineHref(repo.full, key)}
            // Silently shortening the list would read as a complete one
            // (ADR-0063). The runs stay in the headline's denominator, so
            // without this line the two would not reconcile and nothing on
            // the page would explain why.
            note={
              summary.withheld.rows > 0
                ? t("spend.withheld", {
                    n: summary.withheld.rows,
                    m: summary.withheld.runs,
                  })
                : undefined
            }
          />

          {/* Two short roll-ups side by side: neither fills a column alone,
              and reading them against each other is the point — one says who
              spends, the other says on what kind of work. */}
          <div className="mt-10 grid gap-10 sm:grid-cols-2">
            <Ranked
              heading={t("spend.byOwner")}
              rows={summary.byOwner}
              t={t}
              compact
            />
            <Ranked
              heading={t("spend.byCategory")}
              rows={summary.byCategory}
              t={t}
              compact
              emptyLabel={t("spend.noBand")}
            />
          </div>
        </>
      )}
    </NavShell>
  )
}

function Loading({ t }: { t: Translate }) {
  return (
    <div role="status" className="space-y-3 py-2">
      <span className="sr-only">{t("spend.loading")}</span>
      <div className="h-8 w-40 animate-pulse rounded bg-bg3" />
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="h-4 animate-pulse rounded bg-bg3" />
      ))}
    </div>
  )
}

function Empty({ t }: { t: Translate }) {
  return (
    <div className="rounded-lg border border-border-dim px-6 py-12 text-center">
      <p className="text-sm text-foreground">{t("spend.emptyTitle")}</p>
      <p className="mt-1 text-sm text-ink-dim">{t("spend.emptyHint")}</p>
    </div>
  )
}

/**
 * Spend per day across the window.
 *
 * A day that ran but priced nothing draws **no column** — not a zero-height
 * one. Pricing began part-way through any window reaching past ADR-0060, so a
 * flat run of empties would read as "we spent nothing that week" when the
 * truth is "nothing that week said". The axis stays continuous either way, so
 * the gap keeps its width and the cadence stays honest.
 *
 * No value labels: one number per column is the chart doing the table's job.
 * Each column carries its own figure on hover, and the whole series is
 * readable as text in the visually-hidden table below.
 */
function DayStrip({ days, t }: { days: SpendDay[]; t: Translate }) {
  const max = Math.max(0, ...days.map((day) => day.usd))
  if (!(max > 0)) return null
  const first = days[0]
  const last = days[days.length - 1]
  return (
    <section className="mt-8">
      <h2 className="font-mono text-xs text-ink-dim">{t("spend.perDay")}</h2>
      {/* 2px between columns, the spacer that keeps adjacent fills from
          reading as one block. Columns share the row's height and are
          bottom-anchored, so height alone encodes the value. */}
      {/* One hairline, at the baseline — the only rule the chart gets. It
          grounds the columns and separates them from the dates; a box or a
          gridline set would be the Grafana move DESIGN.md rejects. */}
      <div
        className="mt-2 flex h-24 items-end gap-[2px] border-b border-border-dim"
        aria-hidden
      >
        {days.map((day) => (
          <div
            key={day.day}
            // Each slot is its own bottom-anchored column, so height alone
            // encodes the value and every bar grows off one baseline.
            className="flex h-full flex-1 flex-col justify-end"
            title={dayTitle(day, t)}
          >
            {day.priced > 0 && (
              <div
                className="w-full min-h-[2px] bg-ink-faint"
                style={{ height: `${(day.usd / max) * 100}%` }}
              />
            )}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-xs text-ink-dim">
        <span>{first?.day}</span>
        <span>{last?.day}</span>
      </div>
      {/* The series as text — the chart's alternative, not a summary of it. */}
      <table className="sr-only">
        <caption>{t("spend.perDay")}</caption>
        <tbody>
          {days
            .filter((day) => day.priced > 0)
            .map((day) => (
              <tr key={day.day}>
                <th scope="row">{day.day}</th>
                <td>≈{usdLabel(day.usd)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </section>
  )
}

function dayTitle(day: SpendDay, t: Translate): string {
  if (day.priced === 0) {
    return `${day.day} — ${t("spend.dayUnpriced", { n: day.runs })}`
  }
  return `${day.day} — ≈${usdLabel(day.usd)}, ${t("spend.dayRuns", {
    n: day.priced,
  })}`
}

/**
 * A ranked roll-up: label, bar, figure, share, run count. The bar is the
 * ledgers' tick at list scale, and it is scaled to the heaviest row *in this
 * list* — each roll-up is its own question, so sharing a scale across them
 * would flatten whichever has the smaller leader.
 *
 * Rows with no priced runs sort to the bottom and carry a dash, so a routine
 * that ran forty times without reporting a cost is visible as exactly that
 * rather than as absent.
 *
 * A routine that has left `routines.yaml` keeps its row — receipts are commits
 * and the money was spent (ADR-0061) — but says so, because until it did, the
 * only tell was that the label happened to be a slug, which reads as a routine
 * someone never bothered to name. It is marked rather than filtered away: the
 * heaviest retired row here is a quarter of the window's total, so hiding it
 * by default would leave the headline and the visible rows disagreeing about
 * what the repo cost. It also stops being a link — that route 404s on a slug
 * the pool can't resolve.
 */
function Ranked({
  heading,
  rows,
  t,
  href,
  compact = false,
  emptyLabel,
  note,
}: {
  heading: string
  rows: SpendGroup[]
  t: Translate
  /** Makes each label a link — the routine roll-up crosses back to the
      routine's own page; owners and bands have no page to land on. */
  href?: (key: string) => string
  compact?: boolean
  /** What an empty key is called (the unbanded bucket). */
  emptyLabel?: string
  /** What this list leaves out, printed under it. A roll-up that drops rows
      has to say so, the same way the headline states its window. */
  note?: string
}) {
  const max = Math.max(0, ...rows.map((row) => row.usd))
  if (rows.length === 0) return null
  return (
    <section className={compact ? undefined : "mt-10"}>
      <h2 className="font-mono text-xs text-ink-dim">{heading}</h2>
      <table className="mt-2 w-full border-collapse font-mono text-xs">
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.key}
              className="border-b border-border-dim last:border-0"
            >
              <td className="w-full max-w-0 py-2 pr-3 align-middle">
                <div className="truncate text-foreground" title={row.label}>
                  {row.label === "" ? (
                    <span className="text-ink-dim">{emptyLabel ?? "—"}</span>
                  ) : href && !row.retired ? (
                    <Link
                      to={href(row.key)}
                      className={cn(rowLinkCls, "text-foreground")}
                    >
                      {row.label}
                    </Link>
                  ) : (
                    row.label
                  )}
                  {row.retired && (
                    // Dim, lowercase, trailing: a footnote on the row, not a
                    // status chip. Green/amber/red are spoken for by freshness
                    // one surface away, and "gone" is not an alarm.
                    <span className="ml-2 text-ink-dim">
                      {t("spend.retired")}
                    </span>
                  )}
                </div>
              </td>
              {/* Below `sm` the bar folds away with the run count. On a phone
                  the fixed columns starved the name to three characters, and
                  a row you can't identify is worth less than the scanning aid
                  that cost you the name. The figure and the share stay. */}
              <td
                className={cn(
                  "py-2 pr-3 align-middle",
                  !compact && "hidden sm:table-cell",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "inline-block h-1.5 bg-border-dim",
                    compact ? "w-16" : "w-32",
                  )}
                >
                  {row.usd > 0 && (
                    <span
                      className="block h-full min-w-[3px] bg-ink-faint"
                      style={{ width: `${(row.usd / max) * 100}%` }}
                    />
                  )}
                </span>
              </td>
              <td className="py-2 pr-3 text-right align-middle whitespace-nowrap text-ink tabular-nums">
                {row.priced === 0 ? <CostDash /> : `≈${usdLabel(row.usd)}`}
              </td>
              {!compact && (
                <>
                  <td className="py-2 pr-3 text-right align-middle whitespace-nowrap text-ink-dim tabular-nums">
                    {row.usd > 0 ? `${Math.round(row.share * 100)}%` : ""}
                  </td>
                  {/* The denominator the money is spent over: forty cheap runs
                      and one dear one reach the same total and are not the
                      same finding. */}
                  <td className="hidden py-2 text-right align-middle whitespace-nowrap text-ink-dim tabular-nums sm:table-cell">
                    {t("spend.runsOf", { n: row.priced, m: row.runs })}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {note && <p className="mt-2 text-xs text-ink-dim">{note}</p>}
    </section>
  )
}
