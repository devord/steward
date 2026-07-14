import type { ReactNode } from "react"

import { ArrowLeft, ExternalLink } from "lucide-react"

import { isManual, routineHost, type Routine } from "@steward/schema"

import { NavShell } from "./nav-shell.tsx"
import { rowLinkCls, StateDot, StateLabel } from "./routines-view.tsx"
import { Button } from "~/components/ui/button"
import { Link } from "~/components/ui/link"
import { cn } from "~/lib/utils"
import type {
  ArtifactInfo,
  RoutineRuns,
  SidebarData,
} from "../lib/dashboard.server.ts"
import { useT, type Translate } from "../lib/i18n.tsx"
import { boardHref, routinesHref } from "../lib/repos.ts"
import { claudeRoutineUrl, widgetStatus } from "../lib/routine-status.ts"
import { deriveRuns, type RunView } from "../lib/runs.ts"
import { agoParts, durationParts } from "../lib/time.ts"
import { useStreamed } from "../lib/use-streamed.ts"

interface RepoInfo {
  full: string
  name: string
  isShared: boolean
}

/**
 * One routine, seen whole (ADR-0033): the facts the pool row folds away on
 * small screens, then its run history — the publish receipts on the
 * artifacts branch (every run's mandatory last step is one commit touching
 * `w/<slug>/index.html`, ADR-0002/0026). Session-level detail — logs,
 * failures, what the run actually did — lives on the routine's claude.ai
 * page; there is no read API for it (the trigger token is trigger-only,
 * ADR-0016), so the view links out instead of pretending to know.
 */
export function RoutineRunsView({
  repo,
  homeRepo,
  sidebar,
  login,
  displayName,
  now,
  routine,
  boards,
  artifacts,
  runs,
}: {
  repo: RepoInfo
  homeRepo: string
  /** Streamed (ADR-0030): the rail renders its skeleton until it resolves. */
  sidebar: SidebarData | Promise<SidebarData>
  login: string
  displayName: string | null
  now: number
  routine: Routine
  /** Board slugs placing this routine — [] is the pool's orphan signal. */
  boards: string[]
  /** Streamed: this routine's artifact + trigger info (state, claude.ai id). */
  artifacts: Promise<Record<string, ArtifactInfo>>
  /** Streamed: the publish receipts. Never rejects — degrades in-band. */
  runs: Promise<RoutineRuns>
}) {
  const t = useT()
  const sidebarData = useStreamed(sidebar, "sidebar")
  const artifactMap = useStreamed(
    artifacts,
    `routine-artifact:${repo.full}/${routine.slug}`,
  )
  const runsData = useStreamed(
    runs,
    `routine-runs:${repo.full}/${routine.slug}`,
  )

  const artifact = artifactMap?.[routine.slug]
  const status =
    artifactMap === null
      ? null
      : widgetStatus(routine, {
          committed: true,
          hasTrigger: artifact?.hasTrigger,
          artifact,
          pendingFiredAt: null,
          now,
        })
  const routineId = artifact?.routineId
  const runViews =
    runsData === null
      ? null
      : deriveRuns(runsData.receipts, routine.schedule ?? null, runsData.capped)
  // The routine's runner, or the repo owner for home pools — the same rule
  // the pool table applies (ADR-0025).
  const owner = routine.runner ?? repo.full.split("/")[0]

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
      actions={
        routineId != null ? (
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            className="gap-2 font-mono text-xs"
            render={
              <a
                href={claudeRoutineUrl(routineId)}
                target="_blank"
                rel="noreferrer"
              />
            }
          >
            <ExternalLink />
            <span className="max-sm:sr-only">{t("routines.openInClaude")}</span>
          </Button>
        ) : undefined
      }
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

      <header className="mb-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <StateDot status={status} />
          <h1
            className="truncate font-mono text-lg font-medium text-foreground"
            title={routine.slug}
          >
            {routine.name}
            <span className="sr-only"> — {routine.slug}</span>
          </h1>
        </div>

        {/* The pool row's columns, unfolded — on a detail page nothing needs
            to hide behind a breakpoint or a hover. Same ledger vocabulary:
            faint mono labels, mono values, dotted cross-references. */}
        <dl className="mt-4 flex flex-wrap gap-x-10 gap-y-3">
          <Fact label={t("routines.colState")}>
            <StateLabel
              status={status}
              lastRunAt={artifact?.lastRunAt ?? null}
              now={now}
            />
          </Fact>
          <Fact label={t("routines.colSchedule")}>
            {isManual(routine) ? (
              <span className="text-ink-faint">{t("routines.manualDash")}</span>
            ) : (
              routine.schedule
            )}
          </Fact>
          <Fact label={t("routines.colHost")}>
            {routineHost(routine) === "cloud" ? "cloud" : "local"}
          </Fact>
          <Fact label={t("routines.colOwner")}>
            <a
              href={`https://github.com/${owner}`}
              target="_blank"
              rel="noreferrer"
              className={rowLinkCls}
            >
              {owner}
            </a>
            {artifact?.claudeAccount != null && (
              <span className="ml-2 font-mono text-xs text-ink-faint">
                {artifact.claudeAccount}
              </span>
            )}
          </Fact>
          <Fact label={t("routines.colBoards")}>
            {boards.length === 0 ? (
              <span className="rounded border border-border-dim px-1 font-mono text-xs text-ink-faint">
                {t("routines.orphan")}
              </span>
            ) : (
              <span className="flex flex-wrap gap-x-2 gap-y-0.5">
                {boards.map((slug) => (
                  <Link
                    key={slug}
                    to={boardHref(repo.full, slug, homeRepo)}
                    className={rowLinkCls}
                  >
                    {slug}
                  </Link>
                ))}
              </span>
            )}
          </Fact>
        </dl>
      </header>

      <section>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-mono text-base font-medium text-foreground">
            {t("runs.heading")}
          </h2>
          {runsData != null && runsData.receipts.length > 0 && (
            <span className="font-mono text-xs text-ink-faint">
              {runsData.capped
                ? t("runs.capped", { n: runsData.receipts.length })
                : t("runs.count", { n: runsData.receipts.length })}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-sm text-ink-dim">{t("runs.subtitle")}</p>
        {routineId != null && <ClaudeNote routineId={routineId} />}

        <div className="mt-3">
          <RunsBody runViews={runViews} runsData={runsData} now={now} t={t} />
        </div>
      </section>
    </NavShell>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="font-mono text-xs text-ink-faint">{label}</dt>
      <dd className="mt-1 font-mono text-xs text-ink-dim">{children}</dd>
    </div>
  )
}

/** The honesty line: only successful runs leave a receipt — the rest is on
    claude.ai. The {claude} slot renders as the external link, split out of
    the template so it survives every locale's word order. */
function ClaudeNote({ routineId }: { routineId: string }) {
  const t = useT()
  const [before, after] = t("runs.claudeNote").split("{claude}")
  return (
    <p className="mt-1 text-sm text-ink-dim">
      {before}
      <a
        href={claudeRoutineUrl(routineId)}
        target="_blank"
        rel="noreferrer"
        className="font-mono underline decoration-dotted underline-offset-2 outline-none hover:text-foreground focus-visible:text-foreground"
      >
        claude.ai
      </a>
      {after}
    </p>
  )
}

function RunsBody({
  runViews,
  runsData,
  now,
  t,
}: {
  runViews: RunView[] | null
  runsData: RoutineRuns | null
  now: number
  t: Translate
}) {
  if (runViews == null || runsData == null) {
    return (
      <div role="status" className="space-y-2 py-2">
        <span className="sr-only">{t("runs.loading")}</span>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-4 animate-pulse rounded bg-bg3" />
        ))}
      </div>
    )
  }
  if (runsData.unreachable) {
    return <p className="py-2 text-sm text-ink-dim">{t("runs.unreachable")}</p>
  }
  if (runViews.length === 0) {
    return (
      <div className="rounded-lg border border-border-dim px-6 py-8 text-center">
        <p className="text-sm text-ink-dim">{t("runs.empty")}</p>
      </div>
    )
  }
  return (
    // The pool table's -mx-3 bleed: row wash breathes past the content
    // column while the edge cells pad the text back to the page rail.
    <div className="-mx-3 overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left align-bottom font-mono text-xs text-ink-faint">
            <th scope="col" className="px-3 py-1.5 font-normal">
              {t("runs.colRan")}
            </th>
            <th scope="col" className="py-1.5 pr-3 font-normal">
              {t("runs.colGap")}
            </th>
            <th
              scope="col"
              className="hidden py-1.5 pr-3 font-normal sm:table-cell"
            >
              {t("runs.colBy")}
            </th>
            <th scope="col" className="py-1.5 pr-3 font-normal">
              {t("runs.colReceipt")}
            </th>
          </tr>
        </thead>
        <tbody>
          {runViews.map((run) => (
            <RunRow key={run.sha} run={run} now={now} t={t} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RunRow({ run, now, t }: { run: RunView; now: number; t: Translate }) {
  const ago = agoParts(run.at, now)
  return (
    <tr className="border-b border-border-dim last:border-0 hover:bg-bg1/60">
      {/* When it ran — relative for the glance, the full timestamp a hover
          away (native title, the chrome's tooltip idiom). */}
      <td className="px-3 py-2 align-top font-mono text-xs text-ink">
        <time dateTime={run.at} title={run.at}>
          {ago.unit === "now"
            ? t("time.now")
            : t(`time.${ago.unit}`, { n: ago.n })}
        </time>
      </td>

      {/* The gap to the previous run — the cadence signal freshness alone
          can't give: a quiet ladder of even gaps, or a "late" that marks a
          scheduled fire that never published (2× the interval, the same
          threshold the stale badge judges by). */}
      <td className="py-2 pr-3 align-top font-mono text-xs text-ink-dim">
        {run.cadence === "first" ? (
          <span className="rounded border border-border-dim px-1 text-ink-faint">
            {t("runs.firstTag")}
          </span>
        ) : run.gapMs == null ? (
          // The capped listing's oldest row: its previous run wasn't fetched,
          // so the gap is unknown — never claimed as a first run (ADR-0033).
          <span aria-hidden className="text-ink-faint">
            —
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            {gapLabel(run.gapMs, t)}
            {run.cadence === "late" && (
              <span
                className={cn(
                  "inline-flex items-center rounded px-1.5 py-0.5 font-mono text-xs leading-none",
                  "bg-yellow/15 font-medium text-ink",
                )}
              >
                {t("runs.lateTag")}
              </span>
            )}
          </span>
        )}
      </td>

      <td className="hidden py-2 pr-3 align-top font-mono text-xs text-ink-dim sm:table-cell">
        {run.author ?? (
          <span aria-hidden className="text-ink-faint">
            —
          </span>
        )}
      </td>

      {/* The receipt itself — the commit on GitHub, where the published
          diff can be inspected (git is visible, not hidden). */}
      <td className="py-2 pr-3 align-top">
        <a
          href={run.htmlUrl}
          target="_blank"
          rel="noreferrer"
          className={rowLinkCls}
        >
          {run.sha.slice(0, 7)}
        </a>
      </td>
    </tr>
  )
}

function gapLabel(gapMs: number, t: Translate): string {
  const { unit, n } = durationParts(gapMs)
  return unit === "now" ? t("duration.now") : t(`duration.${unit}`, { n })
}
