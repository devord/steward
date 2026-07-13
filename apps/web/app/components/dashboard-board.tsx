import type { ReactNode } from "react"
import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import {
  Await,
  useFetcher,
  useNavigate,
  useRevalidator,
  useSearchParams,
} from "react-router"

import type { DashboardFile, Routine, WidgetSize } from "@steward/schema"
import { dashboardPath, GRID_MAX_COLS } from "@steward/schema"
import { Pencil, Plus, Trash2 } from "lucide-react"

import { AddRoutineDialog } from "./add-routine-dialog.tsx"
import { DashboardShell } from "./dashboard-shell.tsx"
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
import { cssVars } from "../lib/css.ts"
import type {
  ArtifactInfo,
  DashboardBase,
  SidebarData,
} from "../lib/dashboard.server.ts"
import { removeRoutine, type SyncKind, useDraft } from "../lib/draft.ts"
import { useT } from "../lib/i18n.tsx"
import type { DiscoveredTemplate } from "../lib/templates.ts"
import { useStreamed } from "../lib/use-streamed.ts"
import { usePendingRuns } from "../lib/pending-runs.ts"
import { collides, findFreeSlot, type Rect } from "../lib/placement.ts"
import { useGridDrag } from "../lib/use-grid-drag.ts"
import { usePollRevalidate } from "../lib/use-poll-revalidate.ts"

/**
 * One board — in any discovered data repo (ADR-0023) — extracted from the
 * home route so every board route renders the identical grid, draft, and
 * sync flow. Which repo and layout file it edits is entirely decided by
 * `view`.
 */
export function DashboardBoard({
  view,
  artifacts,
  templates,
  login,
  displayName,
  now,
  sidebar,
}: {
  view: DashboardBase
  /** Streams in after the structure (ADR-0002): each cell shows a skeleton
      until its artifact resolves. Keyed by routine slug. */
  artifacts: Promise<Record<string, ArtifactInfo>>
  /** The add-routine picker's templates, streamed (ADR-0030): only the
      dialog reads them, so the board never waits on the discovery reads. */
  templates: DiscoveredTemplate[] | Promise<DiscoveredTemplate[]>
  login: string
  displayName?: string | null
  now: number
  /** Every discovered repo with its boards — the rail's groups. Streamed
      (ADR-0030): the rail renders its skeleton until the first resolve. */
  sidebar: SidebarData | Promise<SidebarData>
}) {
  const t = useT()
  // Chrome data resolves out of band, holding the last value across board
  // switches and poll revalidations (fresh promises every time) so the rail
  // and picker never flash back to loading.
  const sidebarData = useStreamed(sidebar, "sidebar")
  const templatesData = useStreamed(templates, `templates:${view.dataRepo}`)
  const revalidator = useRevalidator()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // One draft per board: two dashboards in the same repo are separate edit
  // surfaces even though they share routines.yaml (ADR-0003/0010).
  const boardKey = `${view.dataRepo}:${view.dashboardSlug}`
  const { draft, base, update, clear, rebase, applyCommit, patchBaseShas } =
    useDraft(boardKey, {
      routines: view.routines,
      dashboard: view.dashboard,
      baseShas: view.baseShas,
      baseFiles: view.baseFiles,
    })
  // `base` is the loader config reconciled with our last commit — use it, not
  // the raw loader view, so a lagging post-commit read can't resurrect stale
  // config (ADR-0003).
  const routines = draft?.routines ?? base.routines
  const dashboard = draft?.dashboard ?? base.dashboard
  // The board's own grid resolution and canvas — drive placement bounds, the
  // rendered column count, and the container width (all one decision).
  const columns = dashboard.grid.columns
  const wide = dashboard.grid.width === "wide"

  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null)
  const [syncing, setSyncing] = useState(false)
  // The board the rail's per-board menu is deleting — any board, not only the
  // one in view; null closes the confirm dialog.
  const [deleteTarget, setDeleteTarget] = useState<{
    repo: string
    slug: string
  } | null>(null)
  const [deletingRoutine, setDeletingRoutine] = useState<string | null>(null)

  // Client-tracked in-flight runs (ADR-0016: no server-side run state) and
  // live refresh so a published artifact appears without a manual reload.
  const { pending, markFired, resolveAgainst, anyPending } = usePendingRuns(
    view.dataRepo,
  )
  usePollRevalidate({ fast: anyPending })

  // Hold the last resolved artifacts: a poll's revalidation returns a fresh
  // `artifacts` promise, and rendering it through <Await> would re-suspend the
  // whole grid into skeletons. Instead swap the resolved map in place.
  const [resolved, setResolved] = useState<Record<string, ArtifactInfo> | null>(
    null,
  )
  useEffect(() => {
    let alive = true
    artifacts.then(
      (a) => {
        if (alive) setResolved(a)
      },
      // A rejected stream (the server aborts promises still pending at
      // streamTimeout) keeps the last resolved artifacts on screen; the next
      // poll retries with a fresh promise. Without this handler a slow
      // GitHub moment during a background poll crashed the whole board.
      () => {},
    )
    return () => {
      alive = false
    }
  }, [artifacts])
  useEffect(() => {
    if (resolved) resolveAgainst(resolved)
  }, [resolved, resolveAgainst])

  // A routine is "committed" once it's in the server config (not just the
  // draft) — drives the tile's draft vs. awaiting states.
  const committedSlugs = useMemo(
    () => new Set(base.routines.routines.map((r) => r.slug)),
    [base.routines],
  )

  // The first-load degrade when the artifact stream dies (server abort at
  // streamTimeout, a dropped connection): every cell renders its honest
  // "unreachable" state instead of the crash page — same per-widget state a
  // GitHub 5xx produces in loadArtifacts, recovered by the next poll.
  const allUnreachable = useMemo(() => {
    const map: Record<string, ArtifactInfo> = {}
    for (const routine of routines.routines) {
      map[routine.slug] = {
        html: null,
        sha: null,
        lastRunAt: null,
        unreachable: true,
      }
    }
    return map
  }, [routines])

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

  // The pool view's "Add to board" handoff (ADR-0025): it navigates here with
  // `?place=<slug>`, and the board — which owns placement — drops the routine
  // at a free slot in its own draft and opens edit mode on it. Only a real,
  // still-unplaced pool routine qualifies; the param is stripped either way so
  // a reload or back-nav can't re-place. Keyed on the slug, so one place per
  // request; placeRoutine reads live draft state through `update`, not the
  // closure, so a stale identity can't misplace it.
  const placeParam = searchParams.get("place")
  useEffect(() => {
    if (!placeParam) return
    const exists = routines.routines.some((r) => r.slug === placeParam)
    const alreadyPlaced = dashboard.widgets.some(
      (w) => w.routine === placeParam,
    )
    if (exists && !alreadyPlaced) {
      placeRoutine(placeParam)
      setEditing(true)
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete("place")
        return next
      },
      { replace: true, preventScrollReset: true },
    )
    // Run once per distinct place request — routines/dashboard are read for the
    // guard only, and placeRoutine mutates live state internally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeParam])

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

  // Delete the routine outright — from routines.yaml and any widget that
  // referenced it. Distinct from removeWidget (which only unplaces it from
  // this board's grid, leaving the routine and its slug in the repo).
  const deleteRoutine = useCallback(
    (slug: string) => {
      update((current) => removeRoutine(current, slug))
    },
    [update],
  )

  // Replace a routine's config in place (slug is fixed, so it still matches
  // the widget that references it). Routines are repo-shared, so this changes
  // it on every dashboard that places it — same reach as deleteRoutine.
  const updateRoutine = useCallback(
    (next: Routine) => {
      update((current) => {
        const i = current.routines.routines.findIndex(
          (r) => r.slug === next.slug,
        )
        if (i >= 0) current.routines.routines[i] = next
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

  // "Keep my version": adopt the base the loader currently sees (so the next
  // commit force-overwrites it, never a silent one) and revalidate to refresh
  // the diff against it. The old loop came from the cache-key split serving a
  // different SHA on revalidation; with the loader and /sync now sharing one
  // ETag entry, the reread is consistent and this converges in one pass — a
  // genuinely newer SHA re-flags the conflict, which is correct, not a loop.
  const handleRebase = useCallback(() => {
    rebase(base.baseShas)
    void revalidator.revalidate()
  }, [rebase, base.baseShas, revalidator])

  const handleSynced = useCallback(
    (newShas: Partial<Record<SyncKind, string>>) => {
      applyCommit(newShas)
      setSyncing(false)
      void revalidator.revalidate()
    },
    [applyCommit, revalidator],
  )

  // Routines added in the draft but not yet on the server — the Sync panel
  // hands off their enactment steps after a commit.
  const addedRoutines = draft
    ? draft.routines.routines.filter((r) => !committedSlugs.has(r.slug))
    : []

  const renderCards = (data: Record<string, ArtifactInfo>) => (
    <>
      {orderedWidgets.flatMap((widget) => {
        const routine = routinesBySlug.get(widget.routine)
        if (!routine) return []
        return [
          <WidgetCard
            key={widget.routine}
            widget={widget}
            routine={routine}
            artifact={data[widget.routine]}
            now={now}
            columns={columns}
            shared={view.isShared}
            dataRepo={view.dataRepo}
            login={login}
            committed={committedSlugs.has(widget.routine)}
            pendingFiredAt={pending[widget.routine]?.firedAt ?? null}
            onFired={() =>
              markFired(widget.routine, data[widget.routine]?.sha ?? null)
            }
            editing={editing}
            onEdit={() => setEditingRoutine(routine)}
            onToggleEnabled={() =>
              updateRoutine({ ...routine, enabled: !routine.enabled })
            }
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
        /* Snap-target ghost. Full-grid only: its explicit gridColumn/gridRow
           mean nothing on the narrow auto-flow grids, where a resize
           previews on the card itself instead. */
        <div
          aria-hidden
          className={cn(
            "pointer-events-none z-10 hidden rounded-lg border border-dashed min-[1100px]:block",
            drag.valid
              ? "border-primary bg-primary/5"
              : "border-red/70 bg-red/10",
          )}
          style={{
            gridColumn: `${drag.candidate.col} / span ${drag.candidate.cols}`,
            gridRow: `${drag.candidate.row} / span ${drag.candidate.rows}`,
          }}
        />
      )}
    </>
  )

  return (
    <>
      <DashboardShell
        dataRepo={view.dataRepo}
        dashboardSlug={view.dashboardSlug}
        sidebar={sidebarData}
        login={login}
        displayName={displayName}
        hasDraft={draft != null}
        editing={editing}
        // Canvas cap: `wide` fills a large monitor (still bounded so the board
        // stays composed, not stretched edge-to-edge); `fixed` keeps the
        // comfortable centered reading width.
        wide={wide}
        onSync={() => setSyncing(true)}
        onAdd={() => setAdding(true)}
        onToggleEdit={() => setEditing((value) => !value)}
        onDeleteBoard={(repo, slug) => setDeleteTarget({ repo, slug })}
      >
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
                <Await
                  resolve={artifacts}
                  errorElement={t("board.widgetsUnreachable")}
                >
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
              {/* First load streams: the frame is placed and each cell holds its
              slot with a skeleton until the artifacts resolve. Once resolved,
              render from state so a poll's revalidation swaps bodies in place
              rather than re-suspending back to skeletons. */}
              {resolved === null ? (
                <Suspense
                  fallback={orderedWidgets.flatMap((widget) =>
                    routinesBySlug.has(widget.routine)
                      ? [
                          <WidgetSkeleton
                            key={widget.routine}
                            widget={widget}
                          />,
                        ]
                      : [],
                  )}
                >
                  <Await
                    resolve={artifacts}
                    // A dead stream on first load degrades to unreachable
                    // cells (never the root error page); the poll's next
                    // revalidation hands this branch a fresh promise.
                    errorElement={renderCards(allUnreachable)}
                  >
                    {(awaited) => renderCards(awaited)}
                  </Await>
                </Suspense>
              ) : (
                renderCards(resolved)
              )}
            </main>
          </>
        )}

        {unplaced.length > 0 && editing && (
          <section className="mt-6">
            <h2 className="mb-1 font-mono text-xs text-ink-dim">
              {t("offgrid.title")}
            </h2>
            <p className="mb-2 text-xs text-ink-dim">
              <FileLine text={t("offgrid.hint")} file="routines.yaml" />
            </p>
            <div className="flex flex-wrap gap-2">
              {unplaced.map((routine) => (
                <div
                  key={routine.slug}
                  className="flex items-center rounded-lg border"
                >
                  <Button
                    size="sm"
                    variant="ghost"
                    className="rounded-r-none"
                    onClick={() => placeRoutine(routine.slug)}
                  >
                    <Plus data-icon="inline-start" />
                    {routine.name}
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={t("offgrid.edit", { name: routine.name })}
                    title={t("offgrid.edit", { name: routine.name })}
                    className="size-6 rounded-none text-ink-dim hover:bg-bg3 hover:text-foreground"
                    onClick={() => setEditingRoutine(routine)}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={t("offgrid.delete", { name: routine.name })}
                    title={t("offgrid.delete", { name: routine.name })}
                    className="mr-0.5 size-6 rounded-l-none text-ink-dim hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setDeletingRoutine(routine.slug)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* View mode: a quiet pointer that repo-shared routines exist but
            aren't placed here — the only cue, since the parking lot itself is
            edit-only. Silent when everything's placed. ink-dim, not
            ink-faint: this is an interactive control, so it carries
            body-text contrast even though it rests quiet. */}
        {unplaced.length > 0 && !editing && dashboard.widgets.length > 0 && (
          <p className="mt-6 font-mono text-xs text-ink-dim">
            <button
              type="button"
              className="underline decoration-dotted underline-offset-2 outline-none hover:text-foreground focus-visible:text-foreground"
              onClick={() => setEditing(true)}
            >
              {t("offgrid.viewHint", { n: unplaced.length })}
            </button>
          </p>
        )}
      </DashboardShell>

      <AddRoutineDialog
        open={adding || editingRoutine != null}
        onOpenChange={(open) => {
          if (!open) {
            setAdding(false)
            setEditingRoutine(null)
          }
        }}
        templates={templatesData ?? []}
        columns={columns}
        existingSlugs={routines.routines.map((r) => r.slug)}
        onAdd={addRoutine}
        editRoutine={editingRoutine}
        onEdit={updateRoutine}
        runner={view.isShared ? login : undefined}
      />
      {draft && (
        <SyncPanel
          open={syncing}
          onOpenChange={setSyncing}
          dashboardSlug={view.dashboardSlug}
          dataRepo={view.dataRepo}
          draft={draft}
          baseFiles={base.baseFiles}
          serverShas={base.baseShas}
          rebasing={revalidator.state !== "idle"}
          addedRoutines={addedRoutines}
          onSynced={handleSynced}
          onDiscard={() => {
            clear()
            setSyncing(false)
          }}
          onRebase={handleRebase}
          onConflictCommitted={patchBaseShas}
        />
      )}
      <DeleteRoutineDialog
        slug={deletingRoutine}
        routines={routines.routines}
        onClose={() => setDeletingRoutine(null)}
        onConfirm={deleteRoutine}
      />
      <DeleteDashboardDialog
        target={deleteTarget}
        activeView={view}
        onClose={() => setDeleteTarget(null)}
        onDeleted={(deletedActive) => {
          setDeleteTarget(null)
          // Deleting the board you're on has nowhere to stay — leave for
          // home. Deleting any other board keeps you put; a revalidate
          // drops it from the rail.
          if (deletedActive) {
            clear()
            void navigate("/")
          } else {
            void revalidator.revalidate()
          }
        }}
      />
    </>
  )
}

interface DeleteResult {
  ok: boolean
  error?: string
}

/**
 * Confirm deleting a board — any board the rail offers, not just the one in
 * view. `target` names it (repo+slug); null keeps the dialog closed. The
 * fetcher is keyed by target so a prior delete's success can't linger and
 * auto-fire when the next board's dialog opens (deleting a non-active board
 * keeps us mounted, unlike the old navigate-away-only flow). The caller decides
 * what a success means — navigate away for the active board, revalidate for any
 * other — via {@link onDeleted}.
 */
function DeleteDashboardDialog({
  target,
  activeView,
  onClose,
  onDeleted,
}: {
  target: { repo: string; slug: string } | null
  /** The board in view — so a success can tell "deleted the one I'm on". */
  activeView: DashboardBase
  onClose: () => void
  onDeleted: (deletedActive: boolean) => void
}) {
  const t = useT()
  const fetcher = useFetcher<DeleteResult>({
    key: target ? `board-delete:${target.repo}:${target.slug}` : "board-delete",
  })
  const busy = fetcher.state !== "idle"

  const deletingActive =
    target != null &&
    target.repo === activeView.dataRepo &&
    target.slug === activeView.dashboardSlug

  const deleted = fetcher.data?.ok === true
  useEffect(() => {
    if (deleted) onDeleted(deletingActive)
  }, [deleted, deletingActive, onDeleted])

  return (
    <Dialog open={target != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("board.deleteTitle")}</DialogTitle>
          <DialogDescription>
            {t("board.deleteBody", {
              // Closed (target null) the dialog still renders; guard the path
              // so `dashboardPath` is never handed an empty, non-kebab slug it
              // would reject — the body is only ever read while a target is set.
              path: target ? dashboardPath(target.slug) : "",
              repo: target?.repo ?? "",
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
          <Button variant="ghost" onClick={onClose}>
            {t("dialog.cancel")}
          </Button>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() => {
              if (!target) return
              void fetcher.submit(
                JSON.stringify({
                  intent: "delete",
                  repo: target.repo,
                  slug: target.slug,
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

/**
 * Confirm deleting a routine outright. It's a draft edit (nothing leaves the
 * repo until the next sync), but routines are shared repo-wide — deleting
 * removes the routine from every dashboard, so the copy says so plainly.
 */
function DeleteRoutineDialog({
  slug,
  routines,
  onClose,
  onConfirm,
}: {
  slug: string | null
  routines: Routine[]
  onClose: () => void
  onConfirm: (slug: string) => void
}) {
  const t = useT()
  const routine = routines.find((r) => r.slug === slug)
  const name = routine?.name ?? slug ?? ""
  return (
    <Dialog open={slug != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("routine.deleteTitle", { name })}</DialogTitle>
          <DialogDescription>{t("routine.deleteBody")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t("dialog.cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (slug) onConfirm(slug)
              onClose()
            }}
          >
            {t("routine.deleteConfirm")}
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
 * One labeled grid knob. The label rides *inside* the field border so the
 * pair reads as a single control, not a caption floating beside a chip:
 * dim label, a hairline, then the bright value that opens the menu.
 */
function GridKnob({
  label,
  value,
  onValueChange,
  children,
}: {
  label: ReactNode
  value: string
  onValueChange: (value: string | null) => void
  children: ReactNode
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <label className="inline-flex h-7 items-center gap-2 rounded-sm border border-input pl-2.5 text-ink-dim transition-colors hover:border-ink-dim/40 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 pointer-coarse:h-9 dark:bg-bg2">
        {label}
        <SelectTrigger
          size="sm"
          className="h-full rounded-none border-y-0 border-r-0 bg-transparent pr-2 pl-2 text-xs text-ink shadow-none focus-visible:border-l-input focus-visible:ring-0 pointer-coarse:data-[size=sm]:h-full dark:bg-transparent dark:hover:bg-transparent"
        >
          <SelectValue />
        </SelectTrigger>
      </label>
      <SelectContent>{children}</SelectContent>
    </Select>
  )
}

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
    <div className="-mt-2 mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-xs text-ink-dim">
      <GridKnob
        label={t("grid.columnsLabel")}
        value={String(grid.columns)}
        onValueChange={(next) => {
          const n = Number(next)
          if (Number.isInteger(n)) onChange({ columns: n })
        }}
      >
        {columnOptions.map((n) => (
          <SelectItem key={n} value={String(n)}>
            {n}
          </SelectItem>
        ))}
      </GridKnob>

      <GridKnob
        label={t("grid.width")}
        value={grid.width}
        onValueChange={(next) => {
          if (next === "fixed" || next === "wide") onChange({ width: next })
        }}
      >
        <SelectItem value="fixed">{t("grid.widthFixed")}</SelectItem>
        <SelectItem value="wide">{t("grid.widthWide")}</SelectItem>
      </GridKnob>

      <GridKnob
        label={t("grid.density")}
        value={String(grid.rowHeight)}
        onValueChange={(next) => {
          const n = Number(next)
          if (Number.isInteger(n)) onChange({ rowHeight: n })
        }}
      >
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
      </GridKnob>

      <span className="ml-auto hidden items-center gap-4 min-[1100px]:flex">
        {(
          [
            ["grid.moveKey", "grid.moveLabel"],
            ["grid.resizeKey", "grid.resizeLabel"],
            ["grid.removeKey", "grid.removeLabel"],
          ] as const
        ).map(([keyToken, label]) => (
          <span key={label} className="inline-flex items-center gap-1.5">
            <kbd className="rounded-sm border border-border-dim bg-bg2 px-1 font-mono text-ink-dim">
              {t(keyToken)}
            </kbd>
            <span className="text-ink-faint">{t(label)}</span>
          </span>
        ))}
      </span>
    </div>
  )
}

/**
 * A translated sentence with its `{file}` slot rendered as a mono <code>
 * element — the locale controls the words around the file name (the same
 * shape as setup's BranchLine).
 */
function FileLine({ text, file }: { text: string; file: string }) {
  const [before = "", after = ""] = text.split("{file}")
  return (
    <>
      {before}
      <code className="font-mono">{file}</code>
      {after}
    </>
  )
}

function EmptyDashboard({ onAdd }: { onAdd: () => void }) {
  const t = useT()
  return (
    <main className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-24 text-center">
      <p className="font-mono text-sm text-ink-dim">{t("empty.fact")}</p>
      <p className="max-w-lg text-balance text-sm text-muted-foreground">
        {t("empty.hint")}
      </p>
      <Button className="mt-3" onClick={onAdd}>
        <Plus data-icon="inline-start" />
        {t("empty.cta")}
      </Button>
    </main>
  )
}
