import { useCallback, useEffect, useState } from "react"
import { data, Form, Link, redirect, useRevalidator } from "react-router"

import type { Routine, WidgetSize } from "@bulletin/schema"
import { GRID_MAX_COLS } from "@bulletin/schema"
import { Check, LayoutGrid, Plus, Settings } from "lucide-react"

import type { Route } from "./+types/home"
import { AddRoutineDialog } from "../components/add-routine-dialog.tsx"
import { AppHeader } from "../components/app-header.tsx"
import { Wordmark } from "../components/logo.tsx"
import { SyncPanel } from "../components/sync-panel.tsx"
import { WidgetCard } from "../components/widget-card.tsx"
import { Button, buttonVariants } from "~/components/ui/button"
import { Separator } from "~/components/ui/separator"
import { cn } from "~/lib/utils"
import { cssVars } from "../lib/css.ts"
import { useT } from "../lib/i18n.tsx"
import {
  dataRepoExists,
  loadDashboard,
  resolveDataRepo,
} from "../lib/dashboard.server.ts"
import { type BaseShas, useDraft } from "../lib/draft.ts"
import { GitHubError } from "../lib/github.server.ts"
import { collides, findFreeSlot, type Rect } from "../lib/placement.ts"
import { getAuth } from "../lib/session.server.ts"
import { useGridDrag } from "../lib/use-grid-drag.ts"

export function meta({ loaderData }: Route.MetaArgs) {
  const description = "A dashboard of living widgets, kept fresh by routines."
  return [
    { title: "Bulletin" },
    { name: "description", content: description },
    { property: "og:title", content: "Bulletin" },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "Bulletin" },
    // Scrapers need an absolute image URL; when the loader errored there is
    // no origin to build one from, so omit the image rather than emit a
    // relative URL scrapers would resolve against their own domain.
    ...(loaderData
      ? [
          { property: "og:image", content: `${loaderData.origin}/og.png` },
          { property: "og:image:width", content: "1200" },
          { property: "og:image:height", content: "630" },
          { name: "twitter:card", content: "summary_large_image" },
        ]
      : []),
  ]
}

export async function loader({ request }: Route.LoaderArgs) {
  const origin = new URL(request.url).origin
  const auth = await getAuth(request)
  if (!auth) return { kind: "anonymous" as const, origin }

  const dataRepo = resolveDataRepo(auth.login, auth.dataRepo)
  if (!(await dataRepoExists(auth.token, dataRepo))) throw redirect("/setup")

  let view
  try {
    view = await loadDashboard(auth.token, dataRepo)
  } catch (error) {
    // Config couldn't load at all (GitHub outage): a clear message beats
    // an anonymous error page. Artifact-level failures degrade per-widget
    // inside loadDashboard and never reach here.
    if (error instanceof GitHubError) {
      throw data(
        "GitHub's API is having trouble right now, so your config couldn't load. The dashboard will be back on the next refresh once GitHub recovers.",
        { status: 503 },
      )
    }
    throw error
  }
  return {
    kind: "dashboard" as const,
    origin,
    login: auth.login,
    now: Date.now(),
    view,
  }
}

export default function Home({ loaderData }: Route.ComponentProps) {
  if (loaderData.kind === "anonymous") return <Landing />
  return <Dashboard data={loaderData} />
}

function Dashboard({
  data,
}: {
  data: Extract<Route.ComponentProps["loaderData"], { kind: "dashboard" }>
}) {
  const { login, now, view } = data
  const t = useT()
  const revalidator = useRevalidator()

  const { draft, update, clear, rebase } = useDraft(view.dataRepo, {
    routines: view.routines,
    dashboard: view.dashboard,
    baseShas: view.baseShas,
  })
  const routines = draft?.routines ?? view.routines
  const dashboard = draft?.dashboard ?? view.dashboard

  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const routinesBySlug = new Map(routines.routines.map((r) => [r.slug, r]))
  const placed = new Set(dashboard.widgets.map((w) => w.routine))
  const unplaced = routines.routines.filter((r) => !placed.has(r.slug))
  // Below the 4-column breakpoint widgets stack in source order, so render
  // them in visual (row, col) order — the phone/tablet stack then reads
  // top-left to bottom-right like the full board.
  const orderedWidgets = [...dashboard.widgets].sort(
    (a, b) =>
      a.position.row - b.position.row || a.position.col - b.position.col,
  )

  const addRoutine = useCallback(
    (routine: Routine, size: WidgetSize) => {
      update((current) => {
        current.routines.routines.push(routine)
        current.dashboard.widgets.push({
          routine: routine.slug,
          position: findFreeSlot(current.dashboard.widgets, size),
          size,
        })
        return current
      })
    },
    [update],
  )

  const placeRoutine = useCallback(
    (slug: string) => {
      update((current) => {
        const size = { cols: 2, rows: 1 }
        current.dashboard.widgets.push({
          routine: slug,
          position: findFreeSlot(current.dashboard.widgets, size),
          size,
        })
        return current
      })
    },
    [update],
  )

  const moveWidget = useCallback(
    (slug: string, dCol: number, dRow: number) => {
      update((current) => {
        const widget = current.dashboard.widgets.find((w) => w.routine === slug)
        if (!widget) return current
        const col = Math.min(
          Math.max(1, widget.position.col + dCol),
          GRID_MAX_COLS - widget.size.cols + 1,
        )
        const row = Math.max(1, widget.position.row + dRow)
        const candidate = { col, row, ...widget.size }
        // Moving onto another widget is a no-op — predictable beats clever.
        if (!collides(current.dashboard.widgets, candidate, slug)) {
          widget.position = { col, row }
        }
        return current
      })
    },
    [update],
  )

  const placeWidget = useCallback(
    (slug: string, rect: Rect) => {
      update((current) => {
        const widget = current.dashboard.widgets.find((w) => w.routine === slug)
        if (widget) {
          widget.position = { col: rect.col, row: rect.row }
          widget.size = { cols: rect.cols, rows: rect.rows }
        }
        return current
      })
    },
    [update],
  )

  const resizeWidget = useCallback(
    (slug: string, size: WidgetSize) => {
      update((current) => {
        const widget = current.dashboard.widgets.find((w) => w.routine === slug)
        if (!widget) return current
        const col = Math.min(widget.position.col, GRID_MAX_COLS - size.cols + 1)
        const candidate = { col, row: widget.position.row, ...size }
        if (!collides(current.dashboard.widgets, candidate, slug)) {
          widget.size = size
          widget.position = { ...widget.position, col }
        }
        return current
      })
    },
    [update],
  )

  const removeWidget = useCallback(
    (slug: string) => {
      update((current) => {
        current.dashboard.widgets = current.dashboard.widgets.filter(
          (w) => w.routine !== slug,
        )
        return current
      })
    },
    [update],
  )

  const { drag, gridRef, startDrag, cancel } = useGridDrag({
    widgets: dashboard.widgets,
    rowHeight: dashboard.grid.rowHeight,
    onCommit: placeWidget,
  })

  // Leaving edit mode mid-drag must not leave a floating card behind.
  useEffect(() => {
    if (!editing) cancel()
  }, [editing, cancel])

  const handleRebase = useCallback(
    (fresh: BaseShas) => {
      rebase(fresh)
      // Pull the fresh base files so the diff re-renders against them.
      void revalidator.revalidate()
    },
    [rebase, revalidator],
  )

  const handleSynced = useCallback(() => {
    clear()
    setSyncing(false)
    void revalidator.revalidate()
  }, [clear, revalidator])

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
      <AppHeader className="gap-x-2">
        <Wordmark className="text-sm" />
        <span
          aria-hidden
          className="hidden font-mono text-xs text-ink-faint md:inline"
        >
          ·
        </span>
        <a
          href={`https://github.com/${view.dataRepo}`}
          target="_blank"
          rel="noreferrer"
          className="hidden font-mono text-xs text-ink-faint transition-colors hover:text-foreground md:inline"
        >
          {view.dataRepo}
        </a>

        {/* Two clusters, one divider: board actions | account. Spacing is
            tighter within a cluster (gap-1) than between them (gap-3), so
            the grouping reads without extra ornament. */}
        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-1">
            {draft && (
              <HeaderAction
                variant="outline"
                className="gap-2 font-mono text-xs"
                label={t("header.unsynced")}
                icon={
                  <span
                    aria-hidden
                    className="size-1.5 rounded-full bg-yellow"
                  />
                }
                onClick={() => setSyncing(true)}
              />
            )}
            <HeaderAction
              variant="ghost"
              className="text-ink-dim hover:text-foreground"
              label={t("header.addRoutine")}
              icon={<Plus />}
              onClick={() => setAdding(true)}
            />
            <HeaderAction
              variant={editing ? "secondary" : "ghost"}
              className={
                editing ? undefined : "text-ink-dim hover:text-foreground"
              }
              aria-pressed={editing}
              label={editing ? t("header.done") : t("header.editLayout")}
              icon={<LayoutGrid />}
              onClick={() => setEditing((value) => !value)}
            />
          </div>

          <Separator orientation="vertical" className="h-4!" />

          <div className="flex items-center gap-1">
            <Link
              to="/settings"
              aria-label={t("header.settings")}
              title={t("header.settings")}
              className={cn(
                buttonVariants({ size: "icon-sm", variant: "ghost" }),
                "text-ink-dim hover:text-foreground",
              )}
            >
              <Settings className="size-3.5" />
            </Link>
            <span className="hidden px-1 font-mono text-xs text-ink-faint md:inline">
              {login}
            </span>
            <Form method="post" action="/auth/logout">
              <Button
                size="sm"
                variant="ghost"
                type="submit"
                className="text-ink-faint hover:text-foreground"
              >
                {t("header.signOut")}
              </Button>
            </Form>
          </div>
        </div>
      </AppHeader>

      {editing && (
        <p className="-mt-2 mb-3 hidden font-mono text-[11px] text-ink-faint min-[1100px]:block">
          drag to move · corner to resize · del to remove
        </p>
      )}

      {dashboard.widgets.length === 0 ? (
        <EmptyDashboard onAdd={() => setAdding(true)} />
      ) : (
        <main
          ref={gridRef}
          className="dash-grid"
          style={cssVars({ "--row-h": `${dashboard.grid.rowHeight}px` })}
        >
          {orderedWidgets.flatMap((widget) => {
            const routine = routinesBySlug.get(widget.routine)
            if (!routine) return []
            return [
              <WidgetCard
                key={widget.routine}
                widget={widget}
                routine={routine}
                artifact={view.artifacts[widget.routine]}
                now={now}
                editing={editing}
                drag={drag?.slug === widget.routine ? drag : null}
                onDragStart={(kind, event) =>
                  startDrag(widget.routine, kind, event)
                }
                onMove={(dCol, dRow) => moveWidget(widget.routine, dCol, dRow)}
                onResize={(size) => resizeWidget(widget.routine, size)}
                onRemove={() => removeWidget(widget.routine)}
              />,
            ]
          })}
          {drag && (
            <div
              aria-hidden
              className={cn(
                "pointer-events-none z-10 rounded-lg border border-dashed",
                drag.valid
                  ? "border-orange-deep bg-orange/5"
                  : "border-red/70 bg-red/10",
              )}
              style={{
                gridColumn: `${drag.candidate.col} / span ${drag.candidate.cols}`,
                gridRow: `${drag.candidate.row} / span ${drag.candidate.rows}`,
              }}
            />
          )}
        </main>
      )}

      {unplaced.length > 0 && editing && (
        <section className="mt-6">
          <h2 className="mb-2 font-mono text-xs text-ink-faint">
            {t("offgrid.title")}
          </h2>
          <div className="flex flex-wrap gap-2">
            {unplaced.map((routine) => (
              <Button
                key={routine.slug}
                size="sm"
                variant="outline"
                onClick={() => placeRoutine(routine.slug)}
              >
                <Plus data-icon="inline-start" />
                {routine.name}
              </Button>
            ))}
          </div>
        </section>
      )}

      <AddRoutineDialog
        open={adding}
        onOpenChange={setAdding}
        catalog={view.catalog}
        existingSlugs={routines.routines.map((r) => r.slug)}
        onAdd={addRoutine}
      />
      {draft && (
        <SyncPanel
          open={syncing}
          onOpenChange={setSyncing}
          draft={draft}
          baseFiles={view.baseFiles}
          serverShas={view.baseShas}
          onSynced={handleSynced}
          onDiscard={() => {
            clear()
            setSyncing(false)
          }}
          onRebase={handleRebase}
        />
      )}
    </div>
  )
}

/**
 * A header button that collapses to its icon on phones: the label goes
 * sr-only and the button squares off, so the action row holds one line
 * on a 360px viewport. The label is still the accessible name.
 */
function HeaderAction({
  icon,
  label,
  className,
  ...props
}: React.ComponentProps<typeof Button> & {
  icon: React.ReactNode
  label: string
}) {
  return (
    <Button
      size="sm"
      className={cn("max-sm:aspect-square max-sm:px-0", className)}
      {...props}
    >
      {icon}
      <span className="max-sm:sr-only">{label}</span>
    </Button>
  )
}

function Landing() {
  const t = useT()
  return (
    <main className="landing-bg min-h-dvh">
      <div className="mx-auto flex min-h-dvh max-w-6xl flex-col justify-center gap-12 px-4 py-16 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-16">
        {/* Left: the pitch and the one action. */}
        <div className="max-w-md">
          <h1>
            <Wordmark live className="text-4xl sm:text-5xl" />
          </h1>
          <p className="mt-7 text-lg leading-snug text-pretty text-foreground">
            {t("landing.tagline")}
          </p>
          <p className="mt-2 font-mono text-sm text-ink-dim">
            {t("landing.sub")}
          </p>

          <a
            href="/auth/login"
            className={cn(buttonVariants({ size: "lg" }), "mt-8 gap-2")}
          >
            <GithubMark className="size-4" />
            {t("landing.signIn")}
          </a>
          <p className="mt-4 max-w-xs text-xs leading-relaxed text-ink-faint">
            {t("landing.privacy")}
          </p>

          {/* The mechanism in four tokens — the same pipeline the OG card
              carries. Git words stay untranslated (DESIGN.md). */}
          <p className="mt-10 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-ink-faint">
            <PipeStep>cron</PipeStep>
            <PipeArrow />
            <PipeStep>skill</PipeStep>
            <PipeArrow />
            <PipeStep>git push</PipeStep>
            <PipeArrow />
            <PipeStep>widget</PipeStep>
          </p>
        </div>

        {/* Right: the product itself — a small living board. Decorative, so
            it's hidden from assistive tech; the pitch carries the meaning. */}
        <DemoBoard />
      </div>
    </main>
  )
}

function PipeStep({ children }: { children: React.ReactNode }) {
  return <span className="text-ink-dim">{children}</span>
}

function PipeArrow() {
  return (
    <span aria-hidden className="text-primary/70">
      ▸
    </span>
  )
}

/** The GitHub mark, currentColor so it inherits the button's ink. */
function GithubMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      fill="currentColor"
      className={className}
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  )
}

// --- Landing demo board -----------------------------------------------------
// A faux dashboard rendered in the real widget chrome (card + freshness
// footer), so the landing shows the product instead of describing it. Content
// is illustrative; colors are tokens only. Widget artifacts here are plain
// markup, not iframes — this never touches a real routine.

function DemoBoard() {
  const t = useT()
  return (
    <div className="flex w-full max-w-md items-start gap-3 max-lg:mx-auto">
      {/* Left column: one tall widget. */}
      <DemoWidget name="daily plan" ago="ran 2h ago" className="flex-1">
        <p className="mb-3 flex items-center justify-between font-mono text-[11px] text-ink-dim">
          today
          <span className="text-ink-faint">jul 09</span>
        </p>
        <ul className="space-y-2.5 text-xs">
          <Task done>ship M1 acceptance</Task>
          <Task done>review sync PR</Task>
          <Task>draft ADR-0010</Task>
          <Task>triage the inbox</Task>
          <Task>merge appearance branch</Task>
          <Task>reply to design thread</Task>
        </ul>
        <div className="mt-4 flex items-center gap-2 font-mono text-[11px] text-ink-faint">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg3">
            <span
              className="block h-full rounded-full bg-green"
              style={{ width: "33%" }}
            />
          </span>
          2/6
        </div>
      </DemoWidget>

      {/* Right column: two stacked widgets, ~matching the tall one. */}
      <div className="flex flex-1 flex-col gap-3">
        <DemoWidget name="repo pulse" ago="ran 14m ago">
          <p className="mb-2.5 font-mono text-[11px] text-ink-dim">open PRs</p>
          <div className="space-y-2">
            <PulseRow label="bulletin" fill="68%" n={4} />
            <PulseRow label="chat" fill="40%" n={2} />
            <PulseRow label="kb" fill="18%" n={1} />
          </div>
        </DemoWidget>

        <DemoWidget
          name="changelog"
          ago="ran 4d ago"
          stale
          staleLabel={t("widget.stale")}
        >
          <p className="mb-2.5 font-mono text-[11px] text-ink-dim">this week</p>
          <div className="space-y-2">
            <SkeletonLine w="w-full" />
            <SkeletonLine w="w-4/5" />
            <SkeletonLine w="w-11/12" />
            <SkeletonLine w="w-2/3" />
          </div>
        </DemoWidget>
      </div>
    </div>
  )
}

function DemoWidget({
  name,
  ago,
  stale = false,
  staleLabel,
  className,
  children,
}: {
  name: string
  ago: string
  stale?: boolean
  staleLabel?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border bg-card",
        className,
      )}
    >
      <div className="min-h-0 flex-1 p-3">{children}</div>
      <footer className="flex items-center justify-between gap-2 border-t border-border-dim px-2 py-[3px] text-[11px]">
        <span className="truncate text-ink-dim">{name}</span>
        <span className="flex shrink-0 items-center gap-1.5 font-mono text-ink-faint">
          {stale && (
            <span className="rounded bg-yellow/15 px-1 text-[10px] text-yellow">
              {staleLabel}
            </span>
          )}
          {ago}
        </span>
      </footer>
    </div>
  )
}

function Task({
  done = false,
  children,
}: {
  done?: boolean
  children: React.ReactNode
}) {
  return (
    <li className="flex items-center gap-2">
      {done ? (
        <Check className="size-3 shrink-0 text-green" />
      ) : (
        <span className="size-3 shrink-0 rounded-full border border-border" />
      )}
      <span className={done ? "text-ink-faint line-through" : "text-ink-dim"}>
        {children}
      </span>
    </li>
  )
}

function PulseRow({
  label,
  fill,
  n,
}: {
  label: string
  fill: string
  n: number
}) {
  return (
    <div className="flex items-center gap-2 font-mono text-[11px]">
      <span className="w-16 shrink-0 truncate text-ink-dim">{label}</span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg3">
        <span
          className="block h-full rounded-full bg-aqua"
          style={{ width: fill }}
        />
      </span>
      <span className="w-3 shrink-0 text-right text-ink-faint">{n}</span>
    </div>
  )
}

function SkeletonLine({ w }: { w: string }) {
  return <span className={cn("block h-2 rounded-full bg-bg3", w)} />
}

function EmptyDashboard({ onAdd }: { onAdd: () => void }) {
  const t = useT()
  return (
    <main className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed py-24 text-center">
      <p className="font-mono text-xs text-ink-faint">{t("empty.fact")}</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        {t("empty.hint")}
      </p>
      <Button className="mt-3" onClick={onAdd}>
        <Plus data-icon="inline-start" />
        {t("empty.cta")}
      </Button>
    </main>
  )
}
