import type { ReactNode } from "react"
import {
  Suspense,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react"
import {
  Await,
  useFetcher,
  useNavigate,
  useRevalidator,
  useSearchParams,
} from "react-router"

import type { DashboardFile, Routine, WidgetSize } from "@steward/schema"
import { dashboardPath, GRID_MAX_COLS, SECTION_NAME_MAX } from "@steward/schema"
import { Pencil, Plus, Trash2 } from "lucide-react"

import { AddRoutineDialog } from "./add-routine-dialog.tsx"
import { DashboardShell } from "./dashboard-shell.tsx"
import { KeymapSheet } from "./keymap-sheet.tsx"
import { SyncPanel } from "./sync-panel.tsx"
import { WidgetCard } from "./widget-card.tsx"
import { WidgetSkeleton } from "./widget-skeleton.tsx"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
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
import {
  type LayoutItem,
  ResponsiveGridLayout,
  useContainerWidth,
  verticalCompactor,
} from "react-grid-layout"
import "react-grid-layout/css/styles.css"

import { cn } from "~/lib/utils"
import type {
  ArtifactInfo,
  DashboardBase,
  Placements,
  SidebarData,
} from "../lib/dashboard.server.ts"
import {
  boardDraftKey,
  removeRoutine,
  type SyncKind,
  useDraft,
} from "../lib/draft.ts"
import { useT } from "../lib/i18n.tsx"
import { OPEN_LAYER_SELECTOR, useKeymap } from "../lib/keymap.ts"
import { boardHref, routinesHref } from "../lib/repos.ts"
import { sectionBoards } from "../lib/sidebar-sections.ts"
import type { DiscoveredTemplate } from "../lib/templates.ts"
import {
  markBoardDeleted,
  useOptimisticSidebar,
} from "../lib/optimistic-boards.ts"
import { useStreamed } from "../lib/use-streamed.ts"
import { usePendingRuns } from "../lib/pending-runs.ts"
import { findFreeSlot, type Rect } from "../lib/placement.ts"
import { layoutItemToRect, widgetsToLayout } from "../lib/rgl-layout.ts"
import { usePollRevalidate } from "../lib/use-poll-revalidate.ts"

/**
 * Vertical compaction (ADR-0041): dropping a widget onto or between others
 * slides the neighbors aside AND lets a displaced widget float back up once the
 * space frees — the reflow you expect from a dashboard grid. The no-compaction
 * alternative pushed neighbors down and never recovered them (each drag shoved
 * them further), so it read as a bug; vertical compaction is the library's
 * default for exactly this reason.
 */
const COMPACTOR = verticalCompactor

/** Grid breakpoints, keyed to viewport width to match the widget-standard's
    cell sizes (desktop → the board's own columns; tablet → 2; phone → 1).
    Editing (drag/resize) is desktop-only, as it was before ADR-0041. */
const RGL_BREAKPOINTS = { lg: 1100, md: 700, sm: 0 } as const
const GRID_MARGIN: readonly [number, number] = [12, 12]

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
  placements,
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
  /** Which boards place each routine, repo-wide — the parking lot's orphan
      test (ADR-0042), streamed (ADR-0030). null = *unknown* (still streaming,
      or the read degraded), not *nothing placed*: the parking lot stays
      hidden rather than call a sibling board's routine homeless. */
  placements: Placements | null | Promise<Placements | null>
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
  const sidebarData = useOptimisticSidebar(sidebar)
  const templatesData = useStreamed(templates, `templates:${view.dataRepo}`)
  const placementsData = useStreamed(placements, `placements:${view.dataRepo}`)
  // Read-only access to this board's repo (ADR-0023): the active repo's push
  // permission rides the streamed sidebar (SidebarRepo.viewerCanPush) — chrome
  // data, off the paint path (ADR-0030), the same source repo-group-header
  // already reads. Only an explicit `false` gates the UI; unknown (null, or the
  // rail not yet resolved) keeps full editing, with the Sync-time "denied" as
  // the backstop (ADR-0003) — we never lock out a permission we couldn't read.
  const readOnly =
    sidebarData?.repos.find((r) => r.repo === view.dataRepo)?.viewerCanPush ===
    false
  const revalidator = useRevalidator()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // One draft per board: two dashboards in the same repo are separate edit
  // surfaces even though they share routines.yaml (ADR-0003/0010).
  const boardKey = boardDraftKey(view.dataRepo, view.dashboardSlug)
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
  const [keymapOpen, setKeymapOpen] = useState(false)
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null)
  const [syncing, setSyncing] = useState(false)
  // The board the rail's per-board menu is deleting — any board, not only the
  // one in view; null closes the confirm dialog.
  const [deleteTarget, setDeleteTarget] = useState<{
    repo: string
    slug: string
  } | null>(null)
  // The board the rail's menu is editing — its current section rides along so
  // the dialog prefills, plus the repo's existing section names to suggest;
  // null closes it.
  const [renameTarget, setRenameTarget] = useState<{
    repo: string
    slug: string
    section: string | null
    sections: string[]
  } | null>(null)
  // The section the rail's section-header menu is renaming or dissolving — a
  // section isn't a board, so these key by repo + the section's current name
  // (ADR-0039); null closes each dialog.
  const [renameSectionTarget, setRenameSectionTarget] = useState<{
    repo: string
    section: string
  } | null>(null)
  const [deleteSectionTarget, setDeleteSectionTarget] = useState<{
    repo: string
    section: string
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
  // First-load stream death (server abort at streamTimeout, dropped
  // connection): flip every cell to its honest "unreachable" state instead of
  // hanging on skeletons. Reset per fresh promise; a poll failure after data
  // already resolved keeps the last good render (see gridData below).
  const [streamFailed, setStreamFailed] = useState(false)
  useEffect(() => {
    let alive = true
    setStreamFailed(false)
    artifacts.then(
      (a) => {
        if (alive) {
          setResolved(a)
          setStreamFailed(false)
        }
      },
      // A rejected stream (the server aborts promises still pending at
      // streamTimeout) keeps the last resolved artifacts on screen; the next
      // poll retries with a fresh promise. On first load (nothing resolved
      // yet) streamFailed flips the cells to unreachable. Without this handler
      // the rejection crashed the whole board.
      () => {
        if (alive) setStreamFailed(true)
      },
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
  // "Not on the grid" means *orphan* — in the pool, on no board in the repo
  // (ADR-0042) — not merely "absent from this board". A repo's pool is shared
  // across its boards (ADR-0025), so the looser test paraded every sibling
  // board's routines here, each beside a button offering to delete it from
  // the repo out from under the board that renders it.
  //
  // This board's own truth comes from the *draft* (`placed`), not the map:
  // unplacing a widget leaves the routine in the pool by design, and it must
  // land here immediately rather than after a sync. Other boards come from the
  // committed map, and an unknown map hides the section entirely.
  const unplaced =
    placementsData == null
      ? []
      : routines.routines.filter(
          (r) =>
            !placed.has(r.slug) &&
            !(placementsData[r.slug] ?? []).some(
              (board) => board !== view.dashboardSlug,
            ),
        )
  // Below the 4-column breakpoint widgets stack in source order, so render
  // them in visual (row, col) order — the phone/tablet stack then reads
  // top-left to bottom-right like the full board.
  const orderedWidgets = [...dashboard.widgets].sort(
    (a, b) =>
      a.position.row - b.position.row || a.position.col - b.position.col,
  )
  // Only widgets whose routine still exists become grid cells; the RGL layout
  // and the rendered children must be the same set, keyed by slug. Each cell
  // carries its routine so the render never re-looks-it-up (and never asserts
  // non-null).
  const placedCells = orderedWidgets.flatMap((widget) => {
    const routine = routinesBySlug.get(widget.routine)
    return routine ? [{ widget, routine }] : []
  })
  // The `lg` layout, memoized on a value signature (not the array identity,
  // which is fresh every render) so a background poll's re-render can't hand
  // RGL a new `layouts` object mid-drag and snap the lifted card. Narrow
  // breakpoints are derived by RGL from this one and never persisted (ADR-0041).
  const layoutSignature = placedCells
    .map(
      ({ widget: w }) =>
        `${w.routine}:${w.position.col},${w.position.row},${w.size.cols},${w.size.rows}`,
    )
    .join("|")
  const layouts = useMemo(
    () => ({
      lg: widgetsToLayout(
        placedCells.map((c) => c.widget),
        columns,
      ),
    }),
    // placedCells is rebuilt each render; layoutSignature captures its value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layoutSignature, columns],
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
    // A read-only viewer can't place a routine (the layout edit could never
    // sync) — strip the param and stay out of edit mode.
    if (exists && !alreadyPlaced && !readOnly) {
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

  // RGL hands back the whole layout once a drag or resize settles; fold each
  // item back into the draft as 1-indexed position/size. Guarded so a settle
  // that changed nothing (a click, or a drag that snapped home) never forks a
  // draft — `update` always writes to localStorage, so the no-op check lives
  // here, as it did for the old drop-unchanged path.
  const commitLayout = useCallback(
    (layout: readonly LayoutItem[]) => {
      const rects = new Map<string, Rect>()
      let changed = false
      for (const item of layout) {
        const widget = dashboard.widgets.find((w) => w.routine === item.i)
        if (!widget) continue
        const rect = layoutItemToRect(item, columns)
        rects.set(item.i, rect)
        if (
          widget.position.col !== rect.col ||
          widget.position.row !== rect.row ||
          widget.size.cols !== rect.cols ||
          widget.size.rows !== rect.rows
        )
          changed = true
      }
      if (!changed) return
      update((current) => {
        for (const widget of current.dashboard.widgets) {
          const rect = rects.get(widget.routine)
          if (rect) {
            widget.position = { col: rect.col, row: rect.row }
            widget.size = { cols: rect.cols, rows: rect.rows }
          }
        }
        return current
      })
    },
    [update, dashboard.widgets, columns],
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

  // Container width drives RGL's pixel geometry (via a ResizeObserver, so it
  // already reflects the fixed/wide canvas cap the shell applies); the
  // viewport-keyed breakpoint picks the column count and gates editing to the
  // desktop grid — drag/resize stayed desktop-only across ADR-0041.
  // `measureBeforeMount` holds the first paint until the real width is known,
  // so the grid never renders at a guessed width and then snaps to the measured
  // one — that snap read as a flicker on every mount/board-switch.
  const { width, containerRef, mounted } = useContainerWidth({
    measureBeforeMount: true,
  })
  const breakpoint = useViewportBreakpoint()
  // Never arm drag/resize for a read-only viewer — a belt-and-suspenders guard
  // over the entry-point gating (editing can't be entered when read-only).
  const gridEditing = editing && breakpoint === "lg" && !readOnly

  // Esc leaves edit mode — the app-wide "close this layer" key (every dialog
  // honors it; edit mode is the one modal-ish state that didn't). Exiting is
  // always safe: layout edits land in the draft on drag/resize stop, so Esc is
  // exactly the Done button. Layers win the key: skip when a dialog, menu, or
  // select popup is open (it takes the first Esc; the next one reaches us) or
  // when something already claimed the event.
  useEffect(() => {
    if (!editing) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return
      if (document.querySelector(OPEN_LAYER_SELECTOR)) return
      setEditing(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [editing])

  // The single-key layer (lazygit manners; guards live in useKeymap). The
  // 1–9 targets are the boards flattened in exactly the rail's render order
  // (repos as listed; within each, sectionBoards' partition) — the key
  // vocabulary and the visible map never disagree. Boards past the ninth
  // stay pointer-only; the rail remains the full map.
  const homeRepo =
    sidebarData?.repos.find((repo) => repo.isHome)?.repo ?? view.dataRepo
  const boardTargets = useMemo(() => {
    if (sidebarData == null) return []
    return sidebarData.repos.flatMap((repoGroup) =>
      sectionBoards(repoGroup.dashboards, repoGroup.sections).flatMap(
        (section) =>
          section.boards.map((board) =>
            boardHref(repoGroup.repo, board.slug, homeRepo),
          ),
      ),
    )
  }, [sidebarData, homeRepo])
  useKeymap({
    ...Object.fromEntries(
      boardTargets
        .slice(0, 9)
        .map((href, i) => [String(i + 1), () => void navigate(href)]),
    ),
    // The edit verbs (e/a/s) are inert for a read-only viewer — the same gate
    // the disabled toolbar controls carry, kept off the keyboard too.
    e: readOnly ? undefined : () => setEditing((value) => !value),
    a: readOnly ? undefined : () => setAdding(true),
    s: draft != null && !readOnly ? () => setSyncing(true) : undefined,
    r: () => void navigate(routinesHref(view.dataRepo)),
    "?": () => setKeymapOpen(true),
  })

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

  // The artifact map to render: last-resolved wins; a first-load stream death
  // shows every cell unreachable; still-pending is null → skeleton bodies.
  const gridData = resolved ?? (streamFailed ? allUnreachable : null)

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
        readOnly={readOnly}
        // Canvas cap: `wide` fills a large monitor (still bounded so the board
        // stays composed, not stretched edge-to-edge); `fixed` keeps the
        // comfortable centered reading width.
        wide={wide}
        // The shell disables these controls when read-only; the handlers stay
        // no-ops there too so an errant keyboard/focus path can't enter editing.
        onSync={() => !readOnly && setSyncing(true)}
        onAdd={() => !readOnly && setAdding(true)}
        onToggleEdit={() => !readOnly && setEditing((value) => !value)}
        onDeleteBoard={(repo, slug) => setDeleteTarget({ repo, slug })}
        onRenameBoard={(repo, slug) => {
          // Pull the board's current section and the repo's known sections
          // (its authored order first, then any a board names off-list) so the
          // dialog can prefill and offer them as suggestions.
          const repoGroup = sidebarData?.repos.find((r) => r.repo === repo)
          const known = repoGroup
            ? [
                ...repoGroup.sections,
                ...repoGroup.dashboards
                  .map((b) => b.section)
                  .filter((s): s is string => s != null),
              ]
            : []
          setRenameTarget({
            repo,
            slug,
            section:
              repoGroup?.dashboards.find((b) => b.slug === slug)?.section ??
              null,
            sections: [...new Set(known)],
          })
        }}
        onRenameSection={(repo, section) =>
          setRenameSectionTarget({ repo, section })
        }
        onDeleteSection={(repo, section) =>
          setDeleteSectionTarget({ repo, section })
        }
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
            <main ref={containerRef}>
              {/* One grid instance for the board's life: RGL positions each
                cell by transform, and the body swaps skeleton → card in place
                as the artifact stream resolves (a poll's revalidation never
                re-suspends the whole grid). Rendered only once the container
                is measured so the first paint lands at the right width. */}
              {mounted && (
                <ResponsiveGridLayout
                  className={cn("dash-grid", gridEditing && "is-editing")}
                  width={width}
                  breakpoint={breakpoint}
                  breakpoints={RGL_BREAKPOINTS}
                  cols={{ lg: columns, md: 2, sm: 1 }}
                  layouts={layouts}
                  rowHeight={dashboard.grid.rowHeight}
                  margin={GRID_MARGIN}
                  containerPadding={[0, 0]}
                  compactor={COMPACTOR}
                  dragConfig={{
                    enabled: gridEditing,
                    handle: ".widget-drag-handle",
                    cancel: "button, a, [data-no-drag]",
                    threshold: 4,
                  }}
                  resizeConfig={{ enabled: gridEditing, handles: ["se"] }}
                  onDragStop={(layout) => commitLayout(layout)}
                  onResizeStop={(layout) => commitLayout(layout)}
                >
                  {placedCells.map(({ widget, routine }) => {
                    return (
                      <div key={widget.routine} className="widget-cell">
                        {gridData ? (
                          <WidgetCard
                            widget={widget}
                            routine={routine}
                            artifact={gridData[widget.routine]}
                            now={now}
                            shared={view.isShared}
                            dataRepo={view.dataRepo}
                            login={login}
                            committed={committedSlugs.has(widget.routine)}
                            pendingFiredAt={
                              pending[widget.routine]?.firedAt ?? null
                            }
                            onFired={() =>
                              markFired(
                                widget.routine,
                                gridData[widget.routine]?.sha ?? null,
                              )
                            }
                            onSync={() => setSyncing(true)}
                            editing={editing}
                            onEdit={() => setEditingRoutine(routine)}
                            onToggleEnabled={() =>
                              updateRoutine({
                                ...routine,
                                enabled: !routine.enabled,
                              })
                            }
                            onRemove={() => removeWidget(widget.routine)}
                          />
                        ) : (
                          <WidgetSkeleton widget={widget} />
                        )}
                      </div>
                    )
                  })}
                </ResponsiveGridLayout>
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
        {unplaced.length > 0 &&
          !editing &&
          !readOnly &&
          dashboard.widgets.length > 0 && (
            // Prose, so sans (the per-string rule); the whole line is the
            // affordance — clicking it enters edit mode with the pool open.
            // Withheld for a read-only viewer: it opens edit mode, which they
            // can't use — nothing to nudge toward.
            <p className="mt-6 text-xs text-ink-dim">
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

      <KeymapSheet open={keymapOpen} onOpenChange={setKeymapOpen} />

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
      <RenameDashboardDialog
        target={renameTarget}
        onClose={() => setRenameTarget(null)}
        onRenamed={() => {
          setRenameTarget(null)
          // The loader revalidation refreshes the rail (its SWR entry was
          // dropped server-side) so the board shows under its new section.
          void revalidator.revalidate()
        }}
      />
      <DeleteDashboardDialog
        target={deleteTarget}
        activeView={view}
        onClose={() => setDeleteTarget(null)}
        onDeleted={(deletedActive) => {
          // Hide it from the rail now: the revalidation below can still read
          // the pre-delete listing back from GitHub (see optimistic-boards).
          if (deleteTarget)
            markBoardDeleted(deleteTarget.repo, deleteTarget.slug)
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
      <RenameSectionDialog
        target={renameSectionTarget}
        onClose={() => setRenameSectionTarget(null)}
        onRenamed={() => {
          setRenameSectionTarget(null)
          // The rail groups by section — revalidate so the renamed heading
          // (and any merged boards) lands on the next paint.
          void revalidator.revalidate()
        }}
      />
      <DeleteSectionDialog
        target={deleteSectionTarget}
        onClose={() => setDeleteSectionTarget(null)}
        onDeleted={() => {
          setDeleteSectionTarget(null)
          void revalidator.revalidate()
        }}
      />
    </>
  )
}

/**
 * The grid's active breakpoint, keyed to viewport width (not container width)
 * so the column count and the desktop-only editing gate match the
 * widget-standard's cell breakpoints exactly, the way the old CSS `@media`
 * rules did. Defaults to `lg` for the server/first paint (the board is
 * desktop-primary) and settles on mount.
 */
function useViewportBreakpoint(): "lg" | "md" | "sm" {
  const [bp, setBp] = useState<"lg" | "md" | "sm">("lg")
  useEffect(() => {
    const lg = window.matchMedia("(min-width: 1100px)")
    const md = window.matchMedia("(min-width: 700px)")
    const compute = () => setBp(lg.matches ? "lg" : md.matches ? "md" : "sm")
    compute()
    lg.addEventListener("change", compute)
    md.addEventListener("change", compute)
    return () => {
      lg.removeEventListener("change", compute)
      md.removeEventListener("change", compute)
    }
  }, [])
  return bp
}

interface DeleteResult {
  ok: boolean
  error?: string
}

/**
 * Edit a board's section — any board the rail offers. The slug (the layout
 * file's name and the URL) is immutable; this edits only the `section` field,
 * committed directly like the rest of the board lifecycle (ADR-0010/0039). An
 * empty section returns the board to the repo's unlabeled lead section. The
 * section input is free text with the repo's existing sections offered as
 * suggestions (a native datalist — pick one to file the board there, or type a
 * new name to start a section). The fetcher is keyed by target so a prior
 * edit's success can't auto-close the next board's dialog.
 */
function RenameDashboardDialog({
  target,
  onClose,
  onRenamed,
}: {
  target: {
    repo: string
    slug: string
    section: string | null
    sections: string[]
  } | null
  onClose: () => void
  onRenamed: () => void
}) {
  const t = useT()
  const listId = useId()
  const fetcher = useFetcher<DeleteResult>({
    key: target ? `board-rename:${target.repo}:${target.slug}` : "board-rename",
  })
  const busy = fetcher.state !== "idle"
  const [section, setSection] = useState("")

  // Prefill from the row's current section each time a new target is set —
  // keyed on the target's identity so a re-render's fresh object can't clobber
  // what the user is typing (adjust-state-during-render pattern).
  const targetKey = target ? `${target.repo}:${target.slug}` : null
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null)
  if (target && targetKey !== prefilledFor) {
    setPrefilledFor(targetKey)
    setSection(target.section ?? "")
  }
  // Closing disarms, so reopening the same board prefills afresh instead of
  // resurrecting an abandoned edit.
  if (!target && prefilledFor !== null) setPrefilledFor(null)

  const renamed = fetcher.data?.ok === true
  useEffect(() => {
    if (renamed) onRenamed()
  }, [renamed, onRenamed])

  function submit() {
    if (!target || busy) return
    void fetcher.submit(
      JSON.stringify({
        intent: "edit",
        repo: target.repo,
        slug: target.slug,
        section: section.trim(),
      }),
      { method: "post", action: "/dashboards", encType: "application/json" },
    )
  }

  return (
    <Dialog open={target != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("board.editTitle")}</DialogTitle>
          <DialogDescription>
            {t("board.editBody", { slug: target?.slug ?? "" })}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="board-edit-section">
              {t("board.sectionLabel")}
            </Label>
            <Input
              id="board-edit-section"
              autoFocus
              value={section}
              list={target && target.sections.length > 0 ? listId : undefined}
              maxLength={SECTION_NAME_MAX}
              onChange={(event) => setSection(event.target.value)}
              placeholder={t("board.sectionPlaceholder")}
              onKeyDown={(event) => {
                if (event.key === "Enter") submit()
              }}
            />
            {target && target.sections.length > 0 && (
              <datalist id={listId}>
                {target.sections.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            )}
            <p className="text-xs text-ink-dim">{t("board.sectionHint")}</p>
          </div>
        </div>
        {fetcher.data?.ok === false && (
          <p className="text-xs text-destructive">
            {fetcher.data.error === "conflict"
              ? t("board.renameConflict")
              : t("error.generic")}
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t("dialog.cancel")}
          </Button>
          <Button disabled={busy} onClick={submit}>
            {busy ? t("board.renaming") : t("board.renameConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
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
 * Rename a section (ADR-0039) — the rail's section-header menu. A section isn't
 * a record, just a free-text label shared across boards, so this rewrites the
 * `section` field of every board filed under the old name (and the repo's
 * `sections` order) in one commit, server-side. `target` names the section
 * (repo + its current name); null keeps the dialog closed. Renaming onto a name
 * that already exists merges the two — it's just a string. Prefills the current
 * name, keyed on the target so a re-render can't clobber typing, and the fetcher
 * is keyed by target so a prior rename's success can't auto-close the next.
 */
function RenameSectionDialog({
  target,
  onClose,
  onRenamed,
}: {
  target: { repo: string; section: string } | null
  onClose: () => void
  onRenamed: () => void
}) {
  const t = useT()
  const fetcher = useFetcher<DeleteResult>({
    key: target
      ? `section-rename:${target.repo}:${target.section}`
      : "section-rename",
  })
  const busy = fetcher.state !== "idle"
  const [name, setName] = useState("")

  // Prefill from the section's current name each time a new target is set,
  // keyed on identity so a re-render's fresh object can't clobber the edit.
  const targetKey = target ? `${target.repo}:${target.section}` : null
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null)
  if (target && targetKey !== prefilledFor) {
    setPrefilledFor(targetKey)
    setName(target.section)
  }
  if (!target && prefilledFor !== null) setPrefilledFor(null)

  const renamed = fetcher.data?.ok === true
  useEffect(() => {
    if (renamed) onRenamed()
  }, [renamed, onRenamed])

  const trimmed = name.trim()
  // Nothing to commit for a blank or unchanged name — keep the button inert.
  const inert = trimmed === "" || (target != null && trimmed === target.section)

  function submit() {
    if (!target || busy || inert) return
    void fetcher.submit(
      JSON.stringify({
        intent: "renameSection",
        repo: target.repo,
        from: target.section,
        to: trimmed,
      }),
      { method: "post", action: "/dashboards", encType: "application/json" },
    )
  }

  return (
    <Dialog open={target != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("section.renameTitle")}</DialogTitle>
          <DialogDescription>
            {t("section.renameBody", { section: target?.section ?? "" })}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="section-rename-name">{t("section.nameLabel")}</Label>
          <Input
            id="section-rename-name"
            autoFocus
            value={name}
            maxLength={SECTION_NAME_MAX}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("section.namePlaceholder")}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit()
            }}
          />
          <p className="text-xs text-ink-dim">{t("section.renameHint")}</p>
        </div>
        {fetcher.data?.ok === false && (
          <p className="text-xs text-destructive">
            {fetcher.data.error === "conflict"
              ? t("section.conflict")
              : t("error.generic")}
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t("dialog.cancel")}
          </Button>
          <Button disabled={busy || inert} onClick={submit}>
            {busy ? t("section.renaming") : t("section.renameConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Confirm dissolving a section (ADR-0039). Its boards fall back to the repo's
 * unlabeled lead section — nothing is deleted — so the copy says so plainly.
 * `target` names it (repo + section); null keeps it closed. The fetcher is
 * keyed by target so a prior delete's success can't linger and auto-fire.
 */
function DeleteSectionDialog({
  target,
  onClose,
  onDeleted,
}: {
  target: { repo: string; section: string } | null
  onClose: () => void
  onDeleted: () => void
}) {
  const t = useT()
  const fetcher = useFetcher<DeleteResult>({
    key: target
      ? `section-delete:${target.repo}:${target.section}`
      : "section-delete",
  })
  const busy = fetcher.state !== "idle"

  const deleted = fetcher.data?.ok === true
  useEffect(() => {
    if (deleted) onDeleted()
  }, [deleted, onDeleted])

  return (
    <Dialog open={target != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("section.deleteTitle")}</DialogTitle>
          <DialogDescription>
            {t("section.deleteBody", { section: target?.section ?? "" })}
          </DialogDescription>
        </DialogHeader>
        {fetcher.data?.ok === false && (
          <p className="text-xs text-destructive">
            {fetcher.data.error === "conflict"
              ? t("section.conflict")
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
                  intent: "deleteSection",
                  repo: target.repo,
                  section: target.section,
                }),
                {
                  method: "post",
                  action: "/dashboards",
                  encType: "application/json",
                },
              )
            }}
          >
            {busy ? t("section.deleting") : t("section.deleteConfirm")}
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
  renderValue,
  children,
}: {
  label: ReactNode
  value: string
  onValueChange: (value: string | null) => void
  /** Maps the raw value to its display label in the closed trigger — Base
      UI renders the value verbatim otherwise, leaking sentinels like
      `fixed` or a bare `150` while the open menu speaks the translated
      phrase. Omit when the value is its own label (column counts). */
  renderValue?: (value: string) => ReactNode
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
          <SelectValue>
            {renderValue &&
              ((current) =>
                typeof current === "string" ? renderValue(current) : null)}
          </SelectValue>
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
    // Hidden below lg with the drag/resize gate (gridEditing): these knobs
    // tune the desktop grid, and on a 1-col phone stack they read as
    // controls for a layout that isn't on screen. Edit mode below lg is
    // content ops — remove, enable, edit — via the tile bars.
    <div className="-mt-2 mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-xs text-ink-dim max-lg:hidden">
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
        renderValue={(current) =>
          t(current === "wide" ? "grid.widthWide" : "grid.widthFixed")
        }
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
        renderValue={(current) => {
          const preset = DENSITY_PRESETS.find(
            (d) => String(d.value) === current,
          )
          return preset ? t(preset.label) : `${current}px`
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
