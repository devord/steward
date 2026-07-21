import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { useFetcher, useNavigate, useRevalidator } from "react-router"

import {
  CalendarPlus,
  ExternalLink,
  LayoutGrid,
  MoreHorizontal,
  Pencil,
  Play,
  Power,
  Trash2,
} from "lucide-react"

import {
  dashboardFileSchema,
  isManual,
  routineHost,
  type Routine,
} from "@steward/schema"

import { AddRoutineDialog } from "./add-routine-dialog.tsx"
import { KeymapSheet } from "./keymap-sheet.tsx"
import { NavShell } from "./nav-shell.tsx"
import { ReadOnlyBadge } from "./read-only-badge.tsx"
import { SyncPanel } from "./sync-panel.tsx"
import { RunLocallyDialog } from "./widget-card.tsx"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { Link } from "~/components/ui/link"
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "~/components/ui/popover"
import { cn } from "~/lib/utils"
import type { ArtifactInfo, SidebarData } from "../lib/dashboard.server.ts"
import {
  poolDraftKey,
  removeRoutine,
  type ServerConfig,
  useDraft,
} from "../lib/draft.ts"
import { useT, type Translate } from "../lib/i18n.tsx"
import { usePendingRuns, type PendingRun } from "../lib/pending-runs.ts"
import { useKeymap } from "../lib/keymap.ts"
import { boardHref, routineHref } from "../lib/repos.ts"
import { schedulePhraseKey } from "../lib/schedules.ts"
import { sectionBoards } from "../lib/sidebar-sections.ts"
import { usePollRevalidate } from "../lib/use-poll-revalidate.ts"
import {
  claudeRoutineUrl,
  widgetStatus,
  type WidgetStatus,
} from "../lib/routine-status.ts"
import type { DiscoveredTemplate } from "../lib/templates.ts"
import { agoParts } from "../lib/time.ts"
import { useOptimisticSidebar } from "../lib/optimistic-boards.ts"
import { useStreamed } from "../lib/use-streamed.ts"
import type { RunResult } from "../routes/run.ts"

/** A routine pool draft edits routines.yaml alone; there's no board in scope,
    so the dashboard side of the shared draft shape (draft.ts) stays empty and
    is never committed (SyncPanel skips it without a slug). */
const EMPTY_DASHBOARD = dashboardFileSchema.parse({ grid: {}, widgets: [] })

interface RepoInfo {
  full: string
  name: string
  isShared: boolean
}

/** The subtitle idiom for git-facing links: git is visible, not hidden. */
const SUBTITLE_LINK =
  "font-mono underline decoration-dotted underline-offset-2 outline-none hover:text-foreground focus-visible:text-foreground"

interface Pool {
  routines: { routines: Routine[] }
  baseSha: string | null
  baseFile: string | null
  boardsByRoutine: Record<string, string[]>
  dashboards: string[]
}

/**
 * A data repo's routine pool (ADR-0025): the whole routines.yaml pool as one
 * ledger, its live/stale/manual/disabled state per row, and — the thing no
 * board shows — which routines sit on no board at all. The one repo-wide
 * writable surface for routines.yaml (placement stays with the boards), so its
 * edits ride a repo-scoped draft (draft.ts) through the same Sync panel.
 */
export function RoutinesView({
  repo,
  homeRepo,
  sidebar,
  templates,
  login,
  displayName,
  now,
  pool,
  artifacts,
}: {
  repo: RepoInfo
  homeRepo: string
  /** Streamed (ADR-0030): the rail renders its skeleton until it resolves. */
  sidebar: SidebarData | Promise<SidebarData>
  /** Streamed too — read by the add/edit dialog's picker and the templates
      ledger below the table (ADR-0029), never the paint. */
  templates: DiscoveredTemplate[] | Promise<DiscoveredTemplate[]>
  login: string
  displayName: string | null
  now: number
  pool: Pool
  artifacts: Promise<Record<string, ArtifactInfo>>
}) {
  const t = useT()
  const navigate = useNavigate()
  // Chrome data resolves out of band, holding the last value across
  // revalidations (fresh promises every time) so the rail and picker never
  // flash back to loading.
  const sidebarData = useOptimisticSidebar(sidebar)
  const templatesData = useStreamed(templates, `templates:${repo.full}`)
  // Read-only access to this pool's repo (ADR-0023): the active repo's push
  // permission rides the streamed sidebar (SidebarRepo.viewerCanPush) — chrome
  // data, off the paint path (ADR-0030), the same source repo-group-header
  // reads. Only an explicit `false` gates the mutating actions; unknown (null,
  // or the rail not yet resolved) keeps them, with the Sync-time "denied" as
  // the backstop (ADR-0003) — we never lock out a permission we couldn't read.
  const viewerCanPush =
    sidebarData?.repos.find((r) => r.repo === repo.full)?.viewerCanPush ?? null
  const readOnly = viewerCanPush === false

  // A repo-scoped draft key — `__routines__` can't collide with a board slug
  // (real slugs are kebab-case), so the pool's draft never crosses a board's.
  const draftKey = poolDraftKey(repo.full)
  const serverConfig = useMemo<ServerConfig>(
    () => ({
      routines: pool.routines,
      dashboard: EMPTY_DASHBOARD,
      baseShas: { routines: pool.baseSha, dashboard: null },
      baseFiles: { routines: pool.baseFile, dashboard: null },
    }),
    [pool.routines, pool.baseSha, pool.baseFile],
  )
  const { draft, base, update, clear, rebase, applyCommit, patchBaseShas } =
    useDraft(draftKey, serverConfig)
  const revalidator = useRevalidator()

  const [syncing, setSyncing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [keymapOpen, setKeymapOpen] = useState(false)
  // Set by the templates ledger's "new routine from template" — opens the
  // add dialog with that template pre-picked (still fully editable).
  const [addingTemplate, setAddingTemplate] = useState<string | null>(null)
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null)
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null)
  // Client-tracked in-flight runs (ADR-0016: no server-side run state), the
  // same durable localStorage marks the rail (rail-status.ts) and the board's
  // widget tiles read — so the pool badge, the rail dot, and the tiles can't
  // disagree about what's running. Marks survive reloads and cross tabs, and
  // clear once the published artifact's SHA changes or the fire times out.
  const { pending, markFired, resolveAgainst, anyPending } = usePendingRuns(
    repo.full,
  )
  // While a run is in flight, poll so the published artifact lands the badge
  // back on "Ran just now" without a manual reload (matches the board).
  usePollRevalidate({ fast: anyPending })

  // The same single-key layer the board carries, minus the board-only verbs
  // (`e`, `r`): 1–9 still switch boards in rail order, so the pool is one
  // keystroke from any board it feeds.
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
    // The create/sync verbs are inert for a read-only viewer — same gate as
    // the disabled toolbar controls, kept off the keyboard too.
    a: readOnly ? undefined : () => setAdding(true),
    s: draft != null && !readOnly ? () => setSyncing(true) : undefined,
    "?": () => setKeymapOpen(true),
  })

  // Artifacts stream in after the table paints (ADR-0002): resolve once into
  // state so the state column fills in place, keeping row menus mounted (no
  // Suspense remount mid-interaction). null until resolved → skeleton state.
  const [resolvedArtifacts, setResolvedArtifacts] = useState<Record<
    string,
    ArtifactInfo
  > | null>(null)
  useEffect(() => {
    let live = true
    artifacts.then(
      (value) => live && setResolvedArtifacts(value),
      // A dead stream leaves every row "unknown", never crashes the page.
      () => live && setResolvedArtifacts({}),
    )
    return () => {
      live = false
    }
  }, [artifacts])
  // A landed publish (its blob SHA now differs from the fire-time SHA) clears
  // the run mark, dropping the badge and the rail dot together.
  useEffect(() => {
    if (resolvedArtifacts) resolveAgainst(resolvedArtifacts)
  }, [resolvedArtifacts, resolveAgainst])

  const effective = draft?.routines ?? base.routines
  const committedSlugs = useMemo(
    () => new Set(base.routines.routines.map((r) => r.slug)),
    [base.routines],
  )
  // Committing added routines isn't enough to run them — the Sync panel shows
  // their enactment steps (ADR-0016), same as the board.
  const addedRoutines = draft
    ? draft.routines.routines.filter((r) => !committedSlugs.has(r.slug))
    : []

  const setEnabled = useCallback(
    (slug: string, enabled: boolean) => {
      update((current) => {
        const routine = current.routines.routines.find((r) => r.slug === slug)
        if (routine) routine.enabled = enabled
        return current
      })
    },
    [update],
  )

  const addRoutine = useCallback(
    (routine: Routine) => {
      // Add to the pool only — no board, no widget. A new pool routine is an
      // orphan until placed (Add to board), which the row then offers.
      update((current) => {
        current.routines.routines.push(routine)
        return current
      })
    },
    [update],
  )

  const editRoutine = useCallback(
    (next: Routine) => {
      update((current) => {
        const index = current.routines.routines.findIndex(
          (r) => r.slug === next.slug,
        )
        if (index >= 0) current.routines.routines[index] = next
        return current
      })
    },
    [update],
  )

  const deleteRoutine = useCallback(
    (slug: string) => update((current) => removeRoutine(current, slug)),
    [update],
  )

  // Hand off to the target board in edit mode with the routine queued to place
  // (dashboard-board reads `?place`), so placement lands in the board's own
  // draft and grid editor — the pool view never rebuilds slot/collision logic.
  const placeOnBoard = useCallback(
    (slug: string, boardSlug: string) => {
      const href = boardHref(repo.full, boardSlug, homeRepo)
      const url = `${href}${href.includes("?") ? "&" : "?"}place=${encodeURIComponent(slug)}`
      void navigate(url)
    },
    [navigate, repo.full, homeRepo],
  )

  // The subtitle's {repo} slot renders as a link to the repo itself (git is
  // visible, not hidden) — split out of the translated template so the link
  // survives every locale's word order.
  const [subtitleBefore, subtitleAfter] = t("routines.subtitle").split("{repo}")

  return (
    <>
      <NavShell
        nav={{
          activeRepo: "",
          dashboardSlug: "",
          routinesRepo: repo.full,
          sidebar: sidebarData,
          login,
          displayName,
        }}
        cap="max-w-7xl"
        // The pool view's identity in the header, mirroring the board slug.
        context="routines"
        actions={
          <>
            {/* The read-only note leads the cluster: it's why the controls
                beside it are disabled. Silent unless the viewer can't push. */}
            {readOnly && <ReadOnlyBadge />}
            {draft != null && (
              // The ledger's own state-chip idiom (StateLabel): yellow as a
              // low-alpha wash + hairline, label in full ink for AA.
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 border-yellow/45 bg-yellow/10 font-mono text-xs text-ink hover:bg-yellow/15 disabled:cursor-not-allowed dark:hover:bg-yellow/15 max-sm:relative max-sm:min-h-9 max-sm:min-w-9 max-sm:px-0 max-sm:after:absolute max-sm:after:-inset-1"
                disabled={readOnly}
                title={readOnly ? t("readonly.hint") : undefined}
                onClick={() => setSyncing(true)}
              >
                <span aria-hidden className="size-1.5 rounded-full bg-yellow" />
                <span className="max-sm:sr-only">{t("header.unsynced")}</span>
              </Button>
            )}
            {/* The create verb takes the solid accent, as its empty-state twin
                below already does — the toolbar's one accent moment. Below
                `sm` the label collapses, so the accent survives as glyph ink
                on a ghost square, never a lone solid block (dashboard-shell's
                ToolbarAction sets the same floors and phone treatment). */}
            <Button
              size="sm"
              className="gap-2 disabled:cursor-not-allowed max-sm:relative max-sm:min-h-9 max-sm:min-w-9 max-sm:bg-transparent max-sm:px-0 max-sm:text-primary max-sm:after:absolute max-sm:after:-inset-1 max-sm:hover:bg-primary/10 max-sm:hover:text-primary dark:max-sm:hover:bg-primary/10"
              disabled={readOnly}
              title={readOnly ? t("readonly.hint") : undefined}
              onClick={() => setAdding(true)}
            >
              <CalendarPlus />
              <span className="max-sm:sr-only">{t("routines.new")}</span>
            </Button>
          </>
        }
      >
        <header className="mb-4">
          <h1 className="font-mono text-lg font-medium text-foreground">
            {t("routines.title")}
          </h1>
          {/* Prose keeps a readable measure — on a wide canvas an uncapped
              subtitle ran ~149 characters per line. */}
          <p className="mt-0.5 max-w-prose text-sm text-ink-dim">
            {subtitleBefore}
            <a
              href={`https://github.com/${repo.full}`}
              target="_blank"
              rel="noreferrer"
              className={SUBTITLE_LINK}
            >
              {repo.name}
            </a>
            {subtitleAfter}
          </p>
        </header>

        {effective.routines.length === 0 ? (
          <EmptyState onAdd={() => setAdding(true)} readOnly={readOnly} />
        ) : (
          <RoutinesTable
            routines={effective.routines}
            artifacts={resolvedArtifacts}
            boardsByRoutine={pool.boardsByRoutine}
            dashboards={pool.dashboards}
            committedSlugs={committedSlugs}
            pending={pending}
            repo={repo}
            homeRepo={homeRepo}
            viewerCanPush={viewerCanPush}
            now={now}
            onEdit={setEditingRoutine}
            onSetEnabled={setEnabled}
            onDelete={setDeletingSlug}
            onPlace={placeOnBoard}
            onFired={(slug) =>
              markFired(slug, resolvedArtifacts?.[slug]?.sha ?? null)
            }
          />
        )}

        {/* Streams in below the pool table (ADR-0030): the section renders
            nothing until the discovery reads resolve, then holds steady
            across revalidations (useStreamed). */}
        <TemplatesSection
          templates={templatesData ?? []}
          routines={effective.routines}
          repo={repo}
          readOnly={readOnly}
          onUse={setAddingTemplate}
        />
      </NavShell>

      <AddRoutineDialog
        open={adding || addingTemplate != null || editingRoutine != null}
        onOpenChange={(open) => {
          if (!open) {
            setAdding(false)
            setAddingTemplate(null)
            setEditingRoutine(null)
          }
        }}
        initialTemplate={addingTemplate}
        templates={templatesData ?? []}
        // No board to size for — placement (and its sizing) happens later, on a
        // board. The dialog still asks; the answer is dropped until placement.
        columns={4}
        existingSlugs={effective.routines.map((r) => r.slug)}
        onAdd={addRoutine}
        editRoutine={editingRoutine}
        onEdit={editRoutine}
        runner={repo.isShared ? login : undefined}
        account={
          editingRoutine
            ? (resolvedArtifacts?.[editingRoutine.slug]?.claudeAccount ?? null)
            : null
        }
      />

      {draft != null && (
        <SyncPanel
          open={syncing}
          onOpenChange={setSyncing}
          dataRepo={repo.full}
          draft={draft}
          baseFiles={base.baseFiles}
          serverShas={base.baseShas}
          addedRoutines={addedRoutines}
          rebasing={revalidator.state !== "idle"}
          onSynced={(newShas) => {
            // Carry the committed base forward (so a lagging re-read isn't
            // mistaken for a moved base) and revalidate to pull the fresh
            // routines.yaml — same handshake the board uses (ADR-0003).
            applyCommit(newShas)
            setSyncing(false)
            void revalidator.revalidate()
          }}
          onDiscard={() => {
            clear()
            setSyncing(false)
          }}
          onRebase={() => {
            rebase(base.baseShas)
            void revalidator.revalidate()
          }}
          onConflictCommitted={patchBaseShas}
        />
      )}

      <DeleteRoutineDialog
        slug={deletingSlug}
        routines={effective.routines}
        onClose={() => setDeletingSlug(null)}
        onConfirm={deleteRoutine}
      />

      <KeymapSheet open={keymapOpen} onOpenChange={setKeymapOpen} />
    </>
  )
}

/**
 * The pool table (ADR-0025) — a terminal-calm ledger, not a SaaS console: a
 * real table, hairline rows, mono identifiers, one leading state node per row.
 * Presentational; every mutation is a callback so RoutinesView keeps the draft.
 * Below `md` the schedule/host/owner columns fold away (their info lives in the
 * row menu and the boards cell); name + state stay, the glance target.
 */
export function RoutinesTable({
  routines,
  artifacts,
  boardsByRoutine,
  dashboards,
  committedSlugs,
  pending,
  repo,
  homeRepo,
  viewerCanPush = null,
  now,
  onEdit,
  onSetEnabled,
  onDelete,
  onPlace,
  onFired,
}: {
  routines: Routine[]
  /** null while the artifact stream is in flight → skeleton state. */
  artifacts: Record<string, ArtifactInfo> | null
  boardsByRoutine: Record<string, string[]>
  dashboards: string[]
  committedSlugs: Set<string>
  /** In-flight run marks, keyed by slug (pending-runs.ts) — a routine here
      renders "Running" until its publish lands. */
  pending: Record<string, PendingRun>
  repo: RepoInfo
  homeRepo: string
  /** The viewer's push permission on this repo (ADR-0023). `false` → read-only:
      the row's mutating actions (edit, toggle, delete, place, run) disable.
      `true`/`null` (unknown) → full editing; only an explicit `false` gates. */
  viewerCanPush?: boolean | null
  now: number
  onEdit: (routine: Routine) => void
  onSetEnabled: (slug: string, enabled: boolean) => void
  onDelete: (slug: string) => void
  onPlace: (slug: string, boardSlug: string) => void
  onFired: (slug: string) => void
}) {
  const t = useT()
  const repoOwner = repo.full.split("/")[0]
  const readOnly = viewerCanPush === false

  return (
    // The table bleeds 12px past the content column (NavShell's -mx idiom)
    // while the edge cells pad it back — text keeps the page's left rail, and
    // the row wash gets breathing room around the leading state dot and the
    // trailing ⋯ instead of cutting flush against them.
    <div className="-mx-3 overflow-x-auto">
      {/* One 13px line box for every cell (`text-xs` on the table, no per-cell
          size overrides): a ledger row is one line, and cells only align across
          columns if they share a line-height — a 13px link inside a 15px line
          box sits a few pixels low, which read as drifting columns. The name
          column is the single flexible one (`w-full max-w-0` + `truncate`): it
          absorbs all slack so the data columns shrink-wrap to their content
          instead of being squeezed into two- and three-line wraps, and it
          ellipsises rather than widening the table. */}
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-border text-left align-bottom font-mono whitespace-nowrap text-ink-faint">
            <th scope="col" className="w-full px-3 py-1.5 font-normal">
              {t("routines.colName")}
            </th>
            <th scope="col" className="py-1.5 pr-3 font-normal">
              {t("routines.colState")}
            </th>
            <th
              scope="col"
              className="hidden py-1.5 pr-3 font-normal md:table-cell"
            >
              {t("routines.colSchedule")}
            </th>
            <th
              scope="col"
              className="hidden py-1.5 pr-3 font-normal md:table-cell"
            >
              {t("routines.colHost")}
            </th>
            <th
              scope="col"
              className="hidden py-1.5 pr-3 font-normal md:table-cell"
            >
              {t("routines.colOwner")}
            </th>
            <th
              scope="col"
              className="hidden py-1.5 pr-3 font-normal sm:table-cell"
            >
              {t("routines.colBoards")}
            </th>
            <th scope="col" className="w-16 py-1.5 pr-3">
              <span className="sr-only">{t("routines.colActions")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {routines.map((routine) => {
            const artifact = artifacts?.[routine.slug]
            const status = widgetStatus(routine, {
              committed: committedSlugs.has(routine.slug),
              hasTrigger: artifact?.hasTrigger,
              artifact,
              pendingFiredAt: pending[routine.slug]?.firedAt ?? null,
              now,
            })
            const owner = routine.runner ?? repoOwner
            return (
              <RoutineRow
                key={routine.slug}
                routine={routine}
                status={artifacts === null ? null : status}
                lastRunAt={artifact?.lastRunAt ?? null}
                routineId={artifact?.routineId}
                owner={owner}
                account={artifact?.claudeAccount ?? null}
                committed={committedSlugs.has(routine.slug)}
                boards={boardsByRoutine[routine.slug] ?? []}
                dashboards={dashboards}
                repo={repo}
                homeRepo={homeRepo}
                readOnly={readOnly}
                now={now}
                onEdit={() => onEdit(routine)}
                onToggle={() => onSetEnabled(routine.slug, !routine.enabled)}
                onDelete={() => onDelete(routine.slug)}
                onPlace={(boardSlug) => onPlace(routine.slug, boardSlug)}
                onFired={() => onFired(routine.slug)}
              />
            )
          })}
        </tbody>
      </table>
      {/* The other half of the story the boards can't tell: what runs, seen
          whole. Quietly stated, since most rows are healthy. */}
      <p className="sr-only" role="status">
        {t("routines.count", { n: routines.length })}
      </p>
    </div>
  )
}

/** The row-action idiom both ledgers share: hover-revealed, quiet until the
    row has attention, always there for keyboard and coarse pointers. */
const rowActionCls =
  "size-6 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 hover:bg-bg3 hover:text-foreground focus-visible:opacity-100 pointer-coarse:opacity-100"

/** The dotted-underline cross-reference the ledgers and the routine detail
    view (ADR-0033) share (boards, used-by, receipts). Every one of these is an
    identifier — a slug, a login, a SHA — so it never breaks across lines, which
    is why a cell holding a list of them collapses rather than wraps
    (`CrossRefCell`). */
export const rowLinkCls =
  "font-mono text-xs whitespace-nowrap text-ink-dim underline decoration-dotted underline-offset-2 outline-none hover:text-foreground focus-visible:text-foreground"

/**
 * A schedule, spoken before spelled: a preset cron reads as its picker phrase
 * ("Every 4 hours" — prose, so sans), the raw expression riding as the native
 * title tooltip (the slug idiom) plus an sr-only echo. An off-preset cron has
 * no phrase to wear and stays verbatim mono — the honest machine string.
 */
export function ScheduleText({ schedule }: { schedule: string }) {
  const t = useT()
  const key = schedulePhraseKey(schedule)
  if (key == null) return <>{schedule}</>
  return (
    <span className="font-sans" title={schedule}>
      {t(key)}
      <span className="sr-only"> — {schedule}</span>
    </span>
  )
}

function RoutineRow({
  routine,
  status,
  lastRunAt,
  routineId,
  owner,
  account,
  committed,
  boards,
  dashboards,
  repo,
  homeRepo,
  readOnly,
  now,
  onEdit,
  onToggle,
  onDelete,
  onPlace,
  onFired,
}: {
  routine: Routine
  /** null → artifact stream in flight (skeleton). */
  status: WidgetStatus | null
  lastRunAt: string | null
  routineId: string | undefined
  owner: string
  /** Claude account email from the trigger file (ADR-0029) — the axis the
      GitHub login can't carry: one runner, several Claude accounts. */
  account: string | null
  /** On the server (synced), not just in the local draft — placement needs it,
      since the board loader only sees committed routines.yaml. */
  committed: boolean
  boards: string[]
  dashboards: string[]
  repo: RepoInfo
  homeRepo: string
  /** Read-only repo (viewerCanPush === false): the row's mutating actions
      disable, and the run affordances (which end in a push) go inert. */
  readOnly: boolean
  now: number
  onEdit: () => void
  onToggle: () => void
  onDelete: () => void
  onPlace: (boardSlug: string) => void
  onFired: () => void
}) {
  const t = useT()
  const cloud = routineHost(routine) === "cloud"
  // Row size is the ledger's 13px; the name earns its prominence from full
  // `foreground` ink and medium weight against the row's `ink-dim` peers, plus
  // the state dot leading it — not from a size step that widens every row.
  const nameCls = "truncate font-mono font-medium text-foreground"
  const name = (
    <>
      {routine.name}
      <span className="sr-only"> — {routine.slug}</span>
    </>
  )

  return (
    // The id anchors the templates ledger's used-by links — one page, one
    // graph, so a cross-reference should land on the row it names.
    <tr
      id={`routine-${routine.slug}`}
      className="group border-b border-border-dim last:border-0 hover:bg-bg1/60"
    >
      {/* Name — the leading state node beside the mono name, the two-second
          glance target. The slug usually just repeats the kebab-cased name,
          so it rides as a hover tooltip (native title, the chrome's tooltip
          idiom) plus an sr-only echo — not a second line doubling every row's
          height. It stays a first-class string elsewhere (Used by, menus).
          A committed routine's name links to its detail view — facts + run
          history (ADR-0033); a draft-only routine has no server-side page
          to land on, so its name stays inert until synced. */}
      <td className="w-full max-w-0 px-3 py-2 align-top">
        <div className="flex min-w-0 items-center gap-2">
          <StateDot status={status} />
          {committed ? (
            <Link
              to={routineHref(repo.full, routine.slug)}
              className={cn(
                nameCls,
                "underline-offset-2 outline-none hover:underline focus-visible:underline",
              )}
              title={routine.slug}
            >
              {name}
            </Link>
          ) : (
            <div className={nameCls} title={routine.slug}>
              {name}
            </div>
          )}
        </div>
      </td>

      {/* State and schedule are short, fixed phrases — "Ran 1h ago", "Every 4
          hours". Left to wrap they became the tallest thing in the row for no
          information gained, so they hold one line and the name column gives
          up the width. */}
      <td className="py-2 pr-3 align-top whitespace-nowrap">
        <StateLabel status={status} lastRunAt={lastRunAt} now={now} />
      </td>

      <td className="hidden py-2 pr-3 align-top font-mono whitespace-nowrap text-ink-dim md:table-cell">
        {isManual(routine) ? (
          <span className="text-ink-faint">{t("routines.manualDash")}</span>
        ) : routine.schedule != null ? (
          <ScheduleText schedule={routine.schedule} />
        ) : null}
      </td>

      <td className="hidden py-2 pr-3 align-top font-mono whitespace-nowrap text-ink-dim md:table-cell">
        {cloud ? "cloud" : "local"}
      </td>

      <td className="hidden py-2 pr-3 align-top whitespace-nowrap md:table-cell">
        {/* The owning Claude account (ADR-0029) rides the login as the native
            title tooltip plus an sr-only echo — the slug idiom. An email is
            rarely the scan target and it's the ledger's only PII, so the cell
            stays one line; the routine detail view spells it out in full. */}
        <a
          href={`https://github.com/${owner}`}
          target="_blank"
          rel="noreferrer"
          className={rowLinkCls}
          title={account ?? undefined}
        >
          {owner}
          {account != null && <span className="sr-only"> — {account}</span>}
        </a>
      </td>

      <td className="hidden py-2 pr-3 align-top sm:table-cell">
        <BoardsCell boards={boards} repo={repo} homeRepo={homeRepo} t={t} />
      </td>

      <td className="py-1.5 pr-3 align-top">
        <div className="flex justify-end gap-0.5">
          {/* Run is the pool's most frequent verb — one click on row hover,
              not buried in the ⋯ menu. Steps aside while a run is in flight
              (the state chip owns it — one run glyph per row, same rule as
              the board tile) and for disabled routines, which never run. A
              read-only viewer can't trigger a run (it ends in a push they lack),
              so the affordance renders inert rather than vanishing. */}
          {cloud && routine.enabled && status?.kind !== "running" && (
            <RunNowAction
              routine={routine}
              repo={repo}
              readOnly={readOnly}
              onFired={onFired}
            />
          )}
          {/* Local routines can't be fired from here — the run button opens
              the how-to-run-it modal instead of the cloud /run path. */}
          {!cloud && routine.enabled && (
            <RunLocallyAction
              routine={routine}
              repo={repo}
              readOnly={readOnly}
            />
          )}
          <RowMenu
            routine={routine}
            committed={committed}
            routineId={routineId}
            dashboards={dashboards}
            readOnly={readOnly}
            onEdit={onEdit}
            onToggle={onToggle}
            onDelete={onDelete}
            onPlace={onPlace}
          />
        </div>
      </td>
    </tr>
  )
}

/** The leading node: green = fresh, yellow = stale/attention, accent = running,
    red = unreachable, hollow = never-run/manual, dim hollow = disabled. Never
    the only carrier of state — the label beside it always names it. */
export function StateDot({
  status,
  className,
}: {
  status: WidgetStatus | null
  className?: string
}) {
  const tone = status ? dotTone(status) : "skeleton"
  const base = "inline-block size-1.5 shrink-0 rounded-full"
  const map: Record<string, string> = {
    green: "bg-green",
    yellow: "bg-yellow",
    accent: "bg-primary",
    red: "bg-red",
    hollow: "border border-ink-faint",
    disabled: "border border-border",
    skeleton: "animate-pulse bg-bg3",
  }
  return <span aria-hidden className={cn(base, map[tone], className)} />
}

function dotTone(status: WidgetStatus): string {
  switch (status.kind) {
    case "live":
      return status.stale ? "yellow" : "green"
    case "running":
      return "accent"
    case "draft":
      return "accent"
    case "needs-trigger":
      return "yellow"
    case "unreachable":
      return "red"
    case "disabled":
      return "disabled"
    default:
      return "hollow"
  }
}

/**
 * The state chip carries freshness as color — this ledger's reason to exist
 * ("is anything stale?", Design Principle #2). It's the lazygit / `gh run
 * list` status column, not a SaaS badge: the tone rides a low-alpha wash
 * behind the label (never 13px colored text — several light palettes have no
 * AA-clearing yellow/green at that size), and the label stays full ink so it
 * clears 4.5:1 on every wash in every theme. Weight and wash strength — not
 * dimming — separate a calm healthy row from one that wants a look, so a
 * board of fresh routines reads as a quiet green ladder and the amber/red
 * anomaly pops. Off states (disabled, never-run) carry no wash: there is no
 * tone to report, and they should recede.
 */
const chipBase =
  "inline-flex items-center rounded px-1.5 py-0.5 font-mono text-xs leading-none whitespace-nowrap"

export function StateLabel({
  status,
  lastRunAt,
  now,
}: {
  status: WidgetStatus | null
  lastRunAt: string | null
  now: number
}) {
  const t = useT()
  if (status === null) {
    return (
      <span className="inline-block h-4 w-16 animate-pulse rounded bg-bg3" />
    )
  }
  const off = "font-mono text-xs text-ink-faint"
  const fresh = cn(chipBase, "bg-green/12 text-ink")
  const stale = cn(chipBase, "bg-yellow/15 font-medium text-ink")
  const active = cn(chipBase, "bg-primary/15 font-medium text-ink")
  const bad = cn(chipBase, "bg-red/15 font-medium text-ink")
  switch (status.kind) {
    case "live":
      return status.stale ? (
        <span className={stale}>{t("widget.stale")}</span>
      ) : (
        <span className={fresh}>{ranLabel(lastRunAt, now, t)}</span>
      )
    case "running":
      return <span className={active}>{t("widget.running")}</span>
    case "draft":
      return <span className={active}>{t("routines.stateDraft")}</span>
    case "disabled":
      return <span className={off}>{t("routines.stateDisabled")}</span>
    case "unreachable":
      return <span className={bad}>{t("routines.stateUnreachable")}</span>
    case "needs-trigger":
      return <span className={stale}>{t("routines.stateNeedsSetup")}</span>
    default:
      return <span className={off}>{t("routines.stateNever")}</span>
  }
}

/** "Ran {ago}" using the same relative-time vocabulary as the widget footer. */
function ranLabel(lastRunAt: string | null, now: number, t: Translate): string {
  if (!lastRunAt) return t("widget.never")
  const ago = agoParts(lastRunAt, now)
  return ago.unit === "now"
    ? t("widget.ran", { ago: t("time.now") })
    : t("widget.ran", { ago: t(`time.${ago.unit}`, { n: ago.n }) })
}

/** Faint bordered tag, shared by both ledgers — informational markers
    (built-in, unused, orphan, overrides) and the `+n` collapse chip, never
    state. Class string, not a component, since the chip wears it on a
    `<button>`. */
const ledgerTagCls =
  "rounded border border-border-dim px-1 font-mono text-xs text-ink-faint"

/**
 * The ledgers' list cell (boards, used-by): a column holding an unbounded list
 * of identifiers inside rows that are one line of machine output. It shows the
 * head of the list, truncating, and counts the tail into a `+n` chip whose
 * popover holds every item — see DESIGN.md ("Type"), which owns the rule and
 * the reasoning.
 *
 * The width sits here rather than on the column: once the flexible column
 * claims the slack with `w-full`, the table hands every other column its
 * min-content and ignores a `<th>` width.
 */
function CrossRefCell({
  items,
  render,
  moreLabel,
  heading,
}: {
  items: string[]
  /** The item as its cross-reference link — the cell truncates the head, the
      popover lists them all. */
  render: (item: string) => ReactNode
  /** Names the collapsed tail for screen readers ("Show all 3 boards"). */
  moreLabel: string
  /** The popover's heading — the column's own label. */
  heading: string
}) {
  const [head, ...tail] = items
  if (head == null) return null
  return (
    <span className="flex w-40 items-center gap-1.5">
      {/* The truncated head carries the full slug as its native tooltip, the
          bargain every truncating cell in these tables makes (the name cell,
          the owner cell). Without it a lone long slug would be unreadable:
          nothing collapses, so there's no popover to recover it from. */}
      <span
        data-slot="cross-ref-head"
        title={head}
        className="min-w-0 truncate"
      >
        {render(head)}
      </span>
      {tail.length > 0 && (
        <Popover>
          <PopoverTrigger
            render={
              <button
                type="button"
                aria-label={moreLabel}
                // Caps its visible box and extends the hit area with an `after`
                // inset rather than growing — the chip rule in DESIGN.md
                // ("Layout → Touch"), since this one shows a border.
                className={cn(
                  ledgerTagCls,
                  "relative shrink-0 cursor-pointer transition-colors outline-none after:absolute after:-inset-2",
                  "hover:border-border hover:text-foreground focus-visible:text-foreground aria-expanded:border-border aria-expanded:text-foreground",
                )}
              />
            }
          >
            +{tail.length}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto max-w-72 gap-1.5 p-3">
            <PopoverTitle className="font-mono text-xs text-ink-faint">
              {heading}
            </PopoverTitle>
            {/* The head repeats here: the popover is the list, not the
                remainder — reading it shouldn't mean stitching two places
                together. Out of the table a slug may wrap at its own hyphens
                rather than paint past the popup, the one place the never-break
                rule on `rowLinkCls` has to give. */}
            <ul className="flex flex-col gap-1 [&_a]:whitespace-normal [&_a]:[overflow-wrap:anywhere]">
              {items.map((item) => (
                <li key={item}>{render(item)}</li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      )}
    </span>
  )
}

/** The empty twin of a list cell: the signal the list itself can't give — a
    routine that renders nowhere, a template no routine instantiates. */
function CrossRefEmpty({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs text-ink-faint">
      <span aria-hidden>—</span>
      <span className={ledgerTagCls}>{children}</span>
    </span>
  )
}

function BoardsCell({
  boards,
  repo,
  homeRepo,
  t,
}: {
  boards: string[]
  repo: RepoInfo
  homeRepo: string
  t: Translate
}) {
  if (boards.length === 0) {
    // The orphan catcher — the one signal the boards can't give: a routine in
    // the pool that renders nowhere.
    return <CrossRefEmpty>{t("routines.orphan")}</CrossRefEmpty>
  }
  return (
    <CrossRefCell
      items={boards}
      moreLabel={t("routines.boardsMore", { n: boards.length })}
      heading={t("routines.colBoards")}
      render={(slug) => (
        <Link to={boardHref(repo.full, slug, homeRepo)} className={rowLinkCls}>
          {slug}
        </Link>
      )}
    />
  )
}

/**
 * The templates ledger (ADR-0029): everything the add-routine picker offers
 * — this repo's templates/routines/ plus the built-ins — with the signals
 * the picker can't give: which routines instantiate each template (`unused`
 * mirrors the pool's `orphan`) and a repo template overriding a same-named
 * built-in. Read-only by design — templates are authored in Claude Code,
 * never the app (ADR-0022) — so its one action instantiates: new routine
 * from template, seeding the add dialog.
 */
export function TemplatesSection({
  templates,
  routines,
  repo,
  readOnly = false,
  onUse,
}: {
  templates: DiscoveredTemplate[]
  routines: Routine[]
  repo: RepoInfo
  /** Read-only repo: "New routine from template" instantiates a routine (a
      draft that could never sync), so it disables. Unknown/pushable → enabled. */
  readOnly?: boolean
  onUse: (templateId: string) => void
}) {
  const t = useT()
  if (templates.length === 0) return null
  // Draft-aware cross-reference: every routine names a template (ADR-0022),
  // so the pool partitions cleanly under the ledger's used-by column.
  const usedBy = new Map<string, string[]>()
  for (const routine of routines) {
    const list = usedBy.get(routine.template) ?? []
    list.push(routine.slug)
    usedBy.set(routine.template, list)
  }
  return (
    <section className="mt-10">
      <h2 className="font-mono text-base font-medium text-foreground">
        {t("templates.title")}
      </h2>
      {/* Both slots link out — {dir} to the templates directory itself
          (templates are authored in git, never the app — ADR-0022), {repo}
          to the repo root, matching the pool subtitle above. Split from the
          translated template so the links survive every locale's word
          order. HEAD lets GitHub resolve the default branch. */}
      <p className="mt-0.5 mb-3 max-w-prose text-sm text-ink-dim">
        {t("templates.subtitle")
          .split(/(\{dir\}|\{repo\})/)
          .map((part, i) =>
            part === "{dir}" ? (
              <a
                key={i}
                href={`https://github.com/${repo.full}/tree/HEAD/templates/routines`}
                target="_blank"
                rel="noreferrer"
                className={SUBTITLE_LINK}
              >
                templates/routines/
              </a>
            ) : part === "{repo}" ? (
              <a
                key={i}
                href={`https://github.com/${repo.full}`}
                target="_blank"
                rel="noreferrer"
                className={SUBTITLE_LINK}
              >
                {repo.name}
              </a>
            ) : (
              part
            ),
          )}
      </p>
      {/* Same -mx-3 bleed as the pool table above: the row wash breathes past
          the content column while the edge cells pad the text back to the
          page rail. */}
      <div className="-mx-3 overflow-x-auto">
        {/* Same ledger contract as the pool table above: one 13px line box for
            every cell, and one flexible column. Here it's the description —
            the only genuinely variable-length string — so the source, schedule,
            and used-by columns stop being squeezed into three-line wraps and
            the last column stops being pushed past the container edge. */}
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-border text-left align-bottom font-mono whitespace-nowrap text-ink-faint">
              <th scope="col" className="px-3 py-1.5 font-normal">
                {t("templates.colTemplate")}
              </th>
              <th
                scope="col"
                className="hidden w-full py-1.5 pr-3 font-normal md:table-cell"
              >
                {t("templates.colDescription")}
              </th>
              <th scope="col" className="py-1.5 pr-3 font-normal">
                {t("templates.colSource")}
              </th>
              <th
                scope="col"
                className="hidden py-1.5 pr-3 font-normal md:table-cell"
              >
                {t("templates.colSchedule")}
              </th>
              <th
                scope="col"
                className="hidden py-1.5 pr-3 font-normal sm:table-cell"
              >
                {t("templates.colUsedBy")}
              </th>
              <th scope="col" className="w-16 py-1.5 pr-3">
                <span className="sr-only">{t("templates.colActions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {templates.map((template) => (
              <TemplateRow
                key={template.id}
                template={template}
                usedBy={usedBy.get(template.id) ?? []}
                repo={repo}
                readOnly={readOnly}
                onUse={() => onUse(template.id)}
              />
            ))}
          </tbody>
        </table>
        <p className="sr-only" role="status">
          {t("templates.count", { n: templates.length })}
        </p>
      </div>
    </section>
  )
}

/** The template's source file on GitHub — repo templates only; built-ins
    ship inside the app bundle and have no file in the viewer's repos. */
function templateFileUrl(repoFull: string, id: string): string {
  return `https://github.com/${repoFull}/blob/HEAD/templates/routines/${id}.md`
}

/** The templates ledger's markers (built-in, overrides) in the shared tag
    vocabulary — `ledgerTagCls`, the same faint bordered chip the cross-ref
    cells wear for `orphan`, `unused`, and `+n`. */
function TemplateTag({ children }: { children: ReactNode }) {
  return <span className={ledgerTagCls}>{children}</span>
}

function TemplateRow({
  template,
  usedBy,
  repo,
  readOnly,
  onUse,
}: {
  template: DiscoveredTemplate
  usedBy: string[]
  repo: RepoInfo
  readOnly: boolean
  onUse: () => void
}) {
  const t = useT()
  const nameCls = "truncate font-mono font-medium text-foreground"
  const name = (
    <>
      {template.name}
      <span className="sr-only"> — {template.id}</span>
    </>
  )
  return (
    <tr className="group border-b border-border-dim last:border-0 hover:bg-bg1/60">
      {/* Mono name, the routine rows' glance shape. The id — what
          routines.yaml's `template:` references — is the name itself for
          every built-in, so like the routine slug it rides as a title
          tooltip + sr-only echo instead of a duplicated second line. A repo
          template's name links to its file on GitHub (ADR-0029), the same
          way a routine's name links to its detail view; a built-in ships in
          the app bundle and has no file in the viewer's repos, so its name
          stays inert. */}
      <td className="px-3 py-2 align-top whitespace-nowrap">
        {template.source === "repo" ? (
          <a
            href={templateFileUrl(repo.full, template.id)}
            target="_blank"
            rel="noreferrer"
            title={template.id}
            className={cn(
              "block",
              nameCls,
              "underline-offset-2 outline-none hover:underline focus-visible:underline",
            )}
          >
            {name}
          </a>
        ) : (
          <div className={nameCls} title={template.id}>
            {name}
          </div>
        )}
      </td>

      {/* The flexible column: `max-w-0` lets it shrink so the ellipsis does the
          work, `w-full` hands it every pixel the fixed columns don't claim. */}
      <td className="hidden w-full max-w-0 py-2 pr-3 align-top text-ink-dim md:table-cell">
        <div className="truncate">{template.description}</div>
      </td>

      {/* The source is a repo name — an identifier, never broken across lines. */}
      <td className="py-2 pr-3 align-top whitespace-nowrap">
        <span className="inline-flex items-center gap-1.5">
          {template.source === "builtin" ? (
            <TemplateTag>{t("templates.builtin")}</TemplateTag>
          ) : (
            <span className="font-mono text-ink-dim">{repo.name}</span>
          )}
          {template.shadows && (
            <TemplateTag>{t("templates.shadows")}</TemplateTag>
          )}
        </span>
      </td>

      <td className="hidden py-2 pr-3 align-top font-mono whitespace-nowrap text-ink-dim md:table-cell">
        {template.widget.schedule != null ? (
          <ScheduleText schedule={template.widget.schedule} />
        ) : (
          <span aria-hidden className="text-ink-faint">
            —
          </span>
        )}
      </td>

      <td className="hidden py-2 pr-3 align-top sm:table-cell">
        {usedBy.length === 0 ? (
          // The picker can't say this: a template no routine instantiates —
          // the ledger's twin of the pool's orphan.
          <CrossRefEmpty>{t("templates.unused")}</CrossRefEmpty>
        ) : (
          // Anchors to the pool rows above — the same dotted cross-reference
          // idiom, and the same head-plus-count collapse, as the boards cell —
          // not inert text (one page, one graph).
          <CrossRefCell
            items={usedBy}
            moreLabel={t("templates.usedByMore", { n: usedBy.length })}
            heading={t("templates.colUsedBy")}
            render={(slug) => (
              <a href={`#routine-${slug}`} className={rowLinkCls}>
                {slug}
              </a>
            )}
          />
        )}
      </td>

      <td className="py-1.5 pr-3 align-top">
        <div className="flex justify-end gap-0.5">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={
              readOnly
                ? t("readonly.hint")
                : t("templates.use", { name: template.name })
            }
            title={readOnly ? t("readonly.hint") : undefined}
            disabled={readOnly}
            className={cn(
              rowActionCls,
              readOnly && "cursor-not-allowed opacity-50",
            )}
            onClick={onUse}
          >
            <CalendarPlus />
          </Button>
        </div>
      </td>
    </tr>
  )
}

/** The pool's inline run affordance — fires the routine's API trigger via
    /run, the same plumbing as the board's Update control (ADR-0016). On a
    successful fire the row flips to Running through onFired and this button
    unmounts; on failure it stays visible in destructive ink with the error
    as its label. */
function RunNowAction({
  routine,
  repo,
  readOnly,
  onFired,
}: {
  routine: Routine
  repo: RepoInfo
  readOnly: boolean
  onFired: () => void
}) {
  const t = useT()
  const fetcher = useFetcher<RunResult>()
  // Mark running on a successful fire so the state column flips (ADR-0016).
  useEffect(() => {
    if (fetcher.data?.ok === true) onFired()
  }, [fetcher.data, onFired])

  const busy = fetcher.state !== "idle"
  const error =
    fetcher.data != null && !fetcher.data.ok
      ? fetcher.data.error === "no-trigger"
        ? t("widget.updateNoTrigger", { slug: routine.slug })
        : t("widget.updateFailed")
      : null
  const label = readOnly
    ? t("readonly.hint")
    : (error ?? t("routines.runNow", { name: routine.name }))
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={label}
      title={label}
      disabled={busy || readOnly}
      className={cn(
        rowActionCls,
        (busy || error != null) && "opacity-100",
        error != null && "text-destructive",
        // Read-only: rest at a dimmed, unmistakably inert state rather than the
        // hover-revealed default (the toolbar badge carries the reason).
        readOnly && "cursor-not-allowed opacity-50",
      )}
      onClick={() =>
        void fetcher.submit(
          { repo: repo.full, slug: routine.slug },
          { method: "post", action: "/run", encType: "application/json" },
        )
      }
    >
      <Play />
      <span role="status" className="sr-only">
        {error ?? ""}
      </span>
    </Button>
  )
}

/** The pool's run affordance for a local routine (ADR-0012): the board can't
    fire it — it runs on the user's machine — so the button opens the
    how-to-run-it modal instead of the cloud /run path. */
function RunLocallyAction({
  routine,
  repo,
  readOnly,
}: {
  routine: Routine
  repo: RepoInfo
  readOnly: boolean
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const label = readOnly
    ? t("readonly.hint")
    : t("widget.runLocalOpen", { name: routine.name })
  return (
    <>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={label}
        title={label}
        disabled={readOnly}
        className={cn(
          rowActionCls,
          readOnly && "cursor-not-allowed opacity-50",
        )}
        onClick={() => setOpen(true)}
      >
        <Play />
      </Button>
      <RunLocallyDialog
        routine={routine}
        dataRepo={repo.full}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}

function RowMenu({
  routine,
  committed,
  routineId,
  dashboards,
  readOnly,
  onEdit,
  onToggle,
  onDelete,
  onPlace,
}: {
  routine: Routine
  committed: boolean
  routineId: string | undefined
  dashboards: string[]
  /** Read-only repo: the mutating items (edit, add to board, enable/disable,
      delete) disable; "Open in claude.ai" — a read-only link — stays live. */
  readOnly: boolean
  onEdit: () => void
  onToggle: () => void
  onDelete: () => void
  onPlace: (boardSlug: string) => void
}) {
  const t = useT()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t("routines.rowMenu", { name: routine.name })}
            className={cn(rowActionCls, "aria-expanded:opacity-100")}
          />
        }
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={4} className="w-52">
        <DropdownMenuItem disabled={readOnly} onClick={onEdit}>
          <Pencil />
          {t("routines.edit")}
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={readOnly}>
            <LayoutGrid />
            {t("routines.addToBoard")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-64 w-48 overflow-y-auto">
            {!committed ? (
              // Placement lands in the board's own draft, and the board loader
              // only sees committed routines.yaml — so a still-draft routine
              // must sync before it can be placed.
              <DropdownMenuItem disabled>
                {t("routines.placeSyncFirst")}
              </DropdownMenuItem>
            ) : dashboards.length === 0 ? (
              <DropdownMenuItem disabled>
                {t("routines.noBoards")}
              </DropdownMenuItem>
            ) : (
              dashboards.map((slug) => (
                <DropdownMenuItem
                  key={slug}
                  className="font-mono text-xs"
                  onClick={() => onPlace(slug)}
                >
                  {slug}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {routineId != null && (
          <DropdownMenuItem
            render={
              <a
                href={claudeRoutineUrl(routineId)}
                target="_blank"
                rel="noreferrer"
              />
            }
          >
            <ExternalLink />
            {t("routines.openInClaude")}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem disabled={readOnly} onClick={onToggle}>
          <Power />
          {routine.enabled ? t("routines.disable") : t("routines.enable")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={readOnly}
          onClick={onDelete}
        >
          <Trash2 />
          {t("routines.delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function EmptyState({
  onAdd,
  readOnly,
}: {
  onAdd: () => void
  readOnly: boolean
}) {
  const t = useT()
  return (
    <div className="rounded-lg border border-border-dim px-6 py-12 text-center">
      <p className="text-sm text-foreground">{t("routines.emptyTitle")}</p>
      <p className="mt-1 text-sm text-ink-dim">{t("routines.emptyHint")}</p>
      <Button
        className="mt-4 gap-2 disabled:cursor-not-allowed"
        size="sm"
        disabled={readOnly}
        title={readOnly ? t("readonly.hint") : undefined}
        onClick={onAdd}
      >
        <CalendarPlus />
        {t("routines.new")}
      </Button>
    </div>
  )
}

/** Delete a routine from routines.yaml and every widget that referenced it —
    the pool-view twin of the board's own confirm (dashboard-board.tsx). */
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
