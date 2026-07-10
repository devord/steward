import { Suspense, useCallback, useEffect, useState } from "react"
import { Await, useFetcher, useNavigate, useRevalidator } from "react-router"

import type { DashboardFile, Routine, WidgetSize } from "@bulletin/schema"
import { dashboardPath, GRID_MAX_COLS } from "@bulletin/schema"
import { Plus } from "lucide-react"

import { AddRoutineDialog } from "./add-routine-dialog.tsx"
import { DashboardHeader } from "./dashboard-header.tsx"
import { SyncPanel } from "./sync-panel.tsx"
import { WidgetCard } from "./widget-card.tsx"
import { WidgetSkeleton } from "./widget-skeleton.tsx"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { cn } from "~/lib/utils"
import { DEFAULT_DASHBOARD } from "../lib/board.ts"
import { cssVars } from "../lib/css.ts"
import type { ArtifactInfo, DashboardBase } from "../lib/dashboard.server.ts"
import { type BaseShas, useDraft } from "../lib/draft.ts"
import { useT } from "../lib/i18n.tsx"
import { collides, findFreeSlot, type Rect } from "../lib/placement.ts"
import { useGridDrag } from "../lib/use-grid-drag.ts"

/**
 * One board — personal or team (ADR-0010) — extracted from the home route
 * so every board route renders the identical grid, draft, and sync flow.
 * Which repo and layout file it edits is entirely decided by `view`.
 */
export function DashboardBoard({
  view,
  artifacts,
  login,
  now,
  personalDashboards,
  teamDashboards,
}: {
  view: DashboardBase
  /** Streams in after the structure (ADR-0002): each cell shows a skeleton
      until its artifact resolves. Keyed by routine slug. */
  artifacts: Promise<Record<string, ArtifactInfo>>
  login: string
  now: number
  personalDashboards: string[]
  /** null → no team repo configured or no access (switcher hides the group). */
  teamDashboards: string[] | null
}) {
  const t = useT()
  const revalidator = useRevalidator()

  // One draft per board: two dashboards in the same repo are separate edit
  // surfaces even though they share routines.yaml (ADR-0003/0010).
  const boardKey = `${view.dataRepo}:${view.dashboardSlug}`
  const { draft, update, clear, rebase } = useDraft(boardKey, {
    routines: view.routines,
    dashboard: view.dashboard,
    baseShas: view.baseShas,
  })
  const routines = draft?.routines ?? view.routines
  const dashboard = draft?.dashboard ?? view.dashboard
  // The board's own grid resolution and canvas — drive placement bounds, the
  // rendered column count, and the container width (all one decision).
  const columns = dashboard.grid.columns
  const wide = dashboard.grid.width === "wide"

  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [deleting, setDeleting] = useState(false)

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
          position: findFreeSlot(
            current.dashboard.widgets,
            size,
            current.dashboard.grid.columns,
          ),
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
        const size = {
          cols: Math.min(2, current.dashboard.grid.columns),
          rows: 1,
        }
        current.dashboard.widgets.push({
          routine: slug,
          position: findFreeSlot(
            current.dashboard.widgets,
            size,
            current.dashboard.grid.columns,
          ),
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
          current.dashboard.grid.columns - widget.size.cols + 1,
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
        const col = Math.min(
          widget.position.col,
          current.dashboard.grid.columns - size.cols + 1,
        )
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

  const setGrid = useCallback(
    (patch: Partial<typeof dashboard.grid>) => {
      update((current) => {
        current.dashboard.grid = { ...current.dashboard.grid, ...patch }
        return current
      })
    },
    [update],
  )

  // Never let a column count strand a placed widget: the floor is the
  // rightmost occupied column across the board.
  const minColumns = dashboard.widgets.reduce(
    (max, w) => Math.max(max, w.position.col + w.size.cols - 1),
    1,
  )

  const { drag, gridRef, startDrag, cancel } = useGridDrag({
    widgets: dashboard.widgets,
    columns,
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

  // The personal default board is the one board that must always exist —
  // it's what `/` renders.
  const deletable = !(
    view.scope === "personal" && view.dashboardSlug === DEFAULT_DASHBOARD
  )

  return (
    <div
      className={cn(
        "mx-auto px-4 pb-16 sm:px-6",
        // Canvas cap: `wide` fills a large monitor (still bounded so the
        // board stays composed, not stretched edge-to-edge); `fixed` keeps
        // the comfortable centered reading width.
        wide ? "max-w-[1800px]" : "max-w-7xl",
      )}
    >
      <DashboardHeader
        dataRepo={view.dataRepo}
        scope={view.scope}
        dashboardSlug={view.dashboardSlug}
        personalDashboards={personalDashboards}
        teamDashboards={teamDashboards}
        login={login}
        hasDraft={draft != null}
        editing={editing}
        deletable={deletable}
        onSync={() => setSyncing(true)}
        onAdd={() => setAdding(true)}
        onToggleEdit={() => setEditing((value) => !value)}
        onDelete={() => setDeleting(true)}
      />

      {editing && (
        <GridSettings
          grid={dashboard.grid}
          minColumns={minColumns}
          onChange={setGrid}
        />
      )}

      {dashboard.widgets.length === 0 ? (
        <EmptyDashboard onAdd={() => setAdding(true)} />
      ) : (
        <>
          {/* The skeleton cells are aria-hidden, so announce the artifact
              stream once for assistive tech — a persistent live region whose
              text flips from loading to loaded when the promise resolves. */}
          <p role="status" aria-live="polite" className="sr-only">
            <Suspense fallback={t("board.widgetsLoading")}>
              <Await resolve={artifacts}>
                {() => t("board.widgetsLoaded")}
              </Await>
            </Suspense>
          </p>
          <main
            ref={gridRef}
            className="dash-grid"
            style={cssVars({
              "--grid-cols": columns,
              "--row-h": `${dashboard.grid.rowHeight}px`,
            })}
          >
            {/* The frame is already placed; only the artifact bodies stream. Each
              cell holds its slot with a skeleton until its artifact lands. */}
            <Suspense
              fallback={orderedWidgets.flatMap((widget) =>
                routinesBySlug.has(widget.routine)
                  ? [<WidgetSkeleton key={widget.routine} widget={widget} />]
                  : [],
              )}
            >
              <Await resolve={artifacts}>
                {(resolved) => (
                  <>
                    {orderedWidgets.flatMap((widget) => {
                      const routine = routinesBySlug.get(widget.routine)
                      if (!routine) return []
                      return [
                        <WidgetCard
                          key={widget.routine}
                          widget={widget}
                          routine={routine}
                          artifact={resolved[widget.routine]}
                          now={now}
                          columns={columns}
                          editing={editing}
                          drag={drag?.slug === widget.routine ? drag : null}
                          onDragStart={(kind, event) =>
                            startDrag(widget.routine, kind, event)
                          }
                          onMove={(dCol, dRow) =>
                            moveWidget(widget.routine, dCol, dRow)
                          }
                          onResize={(size) =>
                            resizeWidget(widget.routine, size)
                          }
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
                  </>
                )}
              </Await>
            </Suspense>
          </main>
        </>
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
        columns={columns}
        existingSlugs={routines.routines.map((r) => r.slug)}
        onAdd={addRoutine}
        runner={view.scope === "team" ? login : undefined}
      />
      {draft && (
        <SyncPanel
          open={syncing}
          onOpenChange={setSyncing}
          scope={view.scope}
          dashboardSlug={view.dashboardSlug}
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
      {deletable && (
        <DeleteDashboardDialog
          open={deleting}
          onOpenChange={setDeleting}
          view={view}
          onDeleted={clear}
        />
      )}
    </div>
  )
}

interface DeleteResult {
  ok: boolean
  error?: string
}

function DeleteDashboardDialog({
  open,
  onOpenChange,
  view,
  onDeleted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  view: DashboardBase
  onDeleted: () => void
}) {
  const t = useT()
  const navigate = useNavigate()
  const fetcher = useFetcher<DeleteResult>()
  const busy = fetcher.state !== "idle"

  const deleted = fetcher.data?.ok === true
  useEffect(() => {
    if (!deleted) return
    onDeleted()
    void navigate(view.scope === "team" ? "/team" : "/")
  }, [deleted, onDeleted, navigate, view.scope])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("board.deleteTitle")}</DialogTitle>
          <DialogDescription>
            {t("board.deleteBody", {
              path: dashboardPath(view.dashboardSlug),
              repo: view.dataRepo,
            })}
          </DialogDescription>
        </DialogHeader>
        {fetcher.data?.ok === false && (
          <p className="text-xs text-destructive">
            {fetcher.data.error === "conflict"
              ? t("board.deleteConflict")
              : t("error.generic")}
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("dialog.cancel")}
          </Button>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() => {
              void fetcher.submit(
                JSON.stringify({
                  intent: "delete",
                  scope: view.scope,
                  slug: view.dashboardSlug,
                }),
                {
                  method: "post",
                  action: "/dashboards",
                  encType: "application/json",
                },
              )
            }}
          >
            {busy ? t("board.deleting") : t("board.deleteConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Row-unit presets surfaced as density; the schema field is free-form px,
    so a value off-preset still shows as its own `{n}px` option. */
const DENSITY_PRESETS = [
  { value: 120, label: "grid.densityCompact" },
  { value: 150, label: "grid.densityCozy" },
  { value: 190, label: "grid.densityRoomy" },
] as const

/**
 * Edit-mode board controls: columns, canvas width, and row density — the
 * three knobs that were frozen (columns/width) or schema-only (rowHeight).
 * Compact and mono to sit quietly above the grid; the keyboard hint rides
 * the same row on desktop where drag/resize apply.
 */
function GridSettings({
  grid,
  minColumns,
  onChange,
}: {
  grid: DashboardFile["grid"]
  minColumns: number
  onChange: (patch: Partial<DashboardFile["grid"]>) => void
}) {
  const t = useT()
  const columnOptions = Array.from(
    { length: GRID_MAX_COLS },
    (_, i) => i + 1,
  ).filter((n) => n >= minColumns)
  const densityKnown = DENSITY_PRESETS.some((d) => d.value === grid.rowHeight)

  return (
    <div className="-mt-2 mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[11px] text-ink-faint">
      <label className="flex items-center gap-1.5">
        {t("grid.columnsLabel")}
        <Select
          value={String(grid.columns)}
          onValueChange={(next) => {
            const n = Number(next)
            if (Number.isInteger(n)) onChange({ columns: n })
          }}
        >
          <SelectTrigger size="sm" className="h-7 gap-1 font-mono text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {columnOptions.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <label className="flex items-center gap-1.5">
        {t("grid.width")}
        <Select
          value={grid.width}
          onValueChange={(next) => {
            if (next === "fixed" || next === "wide") onChange({ width: next })
          }}
        >
          <SelectTrigger size="sm" className="h-7 gap-1 font-mono text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fixed">{t("grid.widthFixed")}</SelectItem>
            <SelectItem value="wide">{t("grid.widthWide")}</SelectItem>
          </SelectContent>
        </Select>
      </label>

      <label className="flex items-center gap-1.5">
        {t("grid.density")}
        <Select
          value={String(grid.rowHeight)}
          onValueChange={(next) => {
            const n = Number(next)
            if (Number.isInteger(n)) onChange({ rowHeight: n })
          }}
        >
          <SelectTrigger size="sm" className="h-7 gap-1 font-mono text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DENSITY_PRESETS.map((d) => (
              <SelectItem key={d.value} value={String(d.value)}>
                {t(d.label)}
              </SelectItem>
            ))}
            {!densityKnown && (
              <SelectItem value={String(grid.rowHeight)}>
                {grid.rowHeight}px
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      </label>

      <span className="ml-auto hidden text-ink-faint min-[1100px]:inline">
        {t("grid.hint")}
      </span>
    </div>
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
