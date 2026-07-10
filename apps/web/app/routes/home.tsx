import { useCallback, useEffect, useState } from "react"
import { data, Form, Link, redirect, useRevalidator } from "react-router"

import type { Routine, WidgetSize } from "@bulletin/schema"
import { GRID_MAX_COLS } from "@bulletin/schema"
import { LayoutGrid, Plus, Settings } from "lucide-react"

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
    <main className="landing-bg grid min-h-dvh place-items-center px-4 sm:px-6">
      <div className="w-full max-w-md pb-16">
        <h1>
          <Wordmark className="text-4xl" />
        </h1>
        <p className="mt-6 text-[15px] leading-relaxed text-balance">
          {t("landing.tagline")}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">{t("landing.sub")}</p>
        <a
          href="/auth/login"
          className={cn(buttonVariants({ size: "lg" }), "mt-7")}
        >
          {t("landing.signIn")}
        </a>
        <p className="mt-4 text-xs leading-relaxed text-ink-faint">
          {t("landing.privacy")}
        </p>
      </div>
    </main>
  )
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
