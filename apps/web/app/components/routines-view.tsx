import { useCallback, useEffect, useMemo, useState } from "react"
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
import { NavShell } from "./nav-shell.tsx"
import { SyncPanel } from "./sync-panel.tsx"
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
import { cn } from "~/lib/utils"
import type { ArtifactInfo, SidebarData } from "../lib/dashboard.server.ts"
import { removeRoutine, type ServerConfig, useDraft } from "../lib/draft.ts"
import { useT, type Translate } from "../lib/i18n.tsx"
import { boardHref } from "../lib/repos.ts"
import { widgetStatus, type WidgetStatus } from "../lib/routine-status.ts"
import type { DiscoveredTemplate } from "../lib/templates.ts"
import { agoParts } from "../lib/time.ts"
import type { RunResult } from "../routes/run.ts"

/** The claude.ai page for a cloud routine — keyed on the id in its trigger
    file, the same id the fire API addresses (ADR-0016). */
function claudeRoutineUrl(id: string): string {
  return `https://claude.ai/code/routines/${id}`
}

/** A routine pool draft edits routines.yaml alone; there's no board in scope,
    so the dashboard side of the shared draft shape (draft.ts) stays empty and
    is never committed (SyncPanel skips it without a slug). */
const EMPTY_DASHBOARD = dashboardFileSchema.parse({ grid: {}, widgets: [] })

interface RepoInfo {
  full: string
  name: string
  isShared: boolean
}

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
  sidebar: SidebarData
  templates: DiscoveredTemplate[]
  login: string
  displayName: string | null
  now: number
  pool: Pool
  artifacts: Promise<Record<string, ArtifactInfo>>
}) {
  const t = useT()
  const navigate = useNavigate()

  // A repo-scoped draft key — `__routines__` can't collide with a board slug
  // (real slugs are kebab-case), so the pool's draft never crosses a board's.
  const draftKey = `${repo.full}:__routines__`
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
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null)
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null)
  // Runs the client fired this session, so the row shows "running" until a
  // reload picks up the published artifact (the pool view doesn't poll).
  const [firedAt, setFiredAt] = useState<Record<string, number>>({})

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

  return (
    <>
      <NavShell
        nav={{
          dataRepo: repo.full,
          activeRepo: "",
          dashboardSlug: "",
          routinesRepo: repo.full,
          sidebar,
          login,
          displayName,
        }}
        cap="max-w-7xl"
        actions={
          <>
            {draft != null && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2 font-mono text-xs max-sm:aspect-square max-sm:px-0"
                onClick={() => setSyncing(true)}
              >
                <span aria-hidden className="size-1.5 rounded-full bg-yellow" />
                <span className="max-sm:sr-only">{t("header.unsynced")}</span>
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-ink-dim hover:text-foreground max-sm:aspect-square max-sm:px-0"
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
          <p className="mt-0.5 text-sm text-ink-dim">
            {t("routines.subtitle", { repo: repo.name })}
          </p>
        </header>

        {effective.routines.length === 0 ? (
          <EmptyState onAdd={() => setAdding(true)} />
        ) : (
          <RoutinesTable
            routines={effective.routines}
            artifacts={resolvedArtifacts}
            boardsByRoutine={pool.boardsByRoutine}
            dashboards={pool.dashboards}
            committedSlugs={committedSlugs}
            firedAt={firedAt}
            repo={repo}
            homeRepo={homeRepo}
            now={now}
            onEdit={setEditingRoutine}
            onSetEnabled={setEnabled}
            onDelete={setDeletingSlug}
            onPlace={placeOnBoard}
            onFired={(slug) =>
              setFiredAt((prev) => ({ ...prev, [slug]: Date.now() }))
            }
          />
        )}
      </NavShell>

      <AddRoutineDialog
        open={adding || editingRoutine != null}
        onOpenChange={(open) => {
          if (!open) {
            setAdding(false)
            setEditingRoutine(null)
          }
        }}
        templates={templates}
        // No board to size for — placement (and its sizing) happens later, on a
        // board. The dialog still asks; the answer is dropped until placement.
        columns={4}
        existingSlugs={effective.routines.map((r) => r.slug)}
        onAdd={addRoutine}
        editRoutine={editingRoutine}
        onEdit={editRoutine}
        runner={repo.isShared ? login : undefined}
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
  firedAt,
  repo,
  homeRepo,
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
  firedAt: Record<string, number>
  repo: RepoInfo
  homeRepo: string
  now: number
  onEdit: (routine: Routine) => void
  onSetEnabled: (slug: string, enabled: boolean) => void
  onDelete: (slug: string) => void
  onPlace: (slug: string, boardSlug: string) => void
  onFired: (slug: string) => void
}) {
  const t = useT()
  const repoOwner = repo.full.split("/")[0]

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left align-bottom font-mono text-xs text-ink-faint">
            <th className="py-1.5 pr-3 font-normal">{t("routines.colName")}</th>
            <th className="py-1.5 pr-3 font-normal">
              {t("routines.colState")}
            </th>
            <th className="hidden py-1.5 pr-3 font-normal md:table-cell">
              {t("routines.colSchedule")}
            </th>
            <th className="hidden py-1.5 pr-3 font-normal md:table-cell">
              {t("routines.colHost")}
            </th>
            <th className="hidden py-1.5 pr-3 font-normal md:table-cell">
              {t("routines.colOwner")}
            </th>
            <th className="hidden py-1.5 pr-3 font-normal sm:table-cell">
              {t("routines.colBoards")}
            </th>
            <th className="w-8 py-1.5">
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
              pendingFiredAt: firedAt[routine.slug] ?? null,
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
                committed={committedSlugs.has(routine.slug)}
                boards={boardsByRoutine[routine.slug] ?? []}
                dashboards={dashboards}
                repo={repo}
                homeRepo={homeRepo}
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

function RoutineRow({
  routine,
  status,
  lastRunAt,
  routineId,
  owner,
  committed,
  boards,
  dashboards,
  repo,
  homeRepo,
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
  /** On the server (synced), not just in the local draft — placement needs it,
      since the board loader only sees committed routines.yaml. */
  committed: boolean
  boards: string[]
  dashboards: string[]
  repo: RepoInfo
  homeRepo: string
  now: number
  onEdit: () => void
  onToggle: () => void
  onDelete: () => void
  onPlace: (boardSlug: string) => void
  onFired: () => void
}) {
  const t = useT()
  const cloud = routineHost(routine) === "cloud"

  return (
    <tr className="group border-b border-border-dim last:border-0 hover:bg-bg1/60">
      {/* Name — the leading state node sits on the baseline of the mono name,
          the two-second glance target; slug rides beneath in faint mono. */}
      <td className="py-2 pr-3 align-top">
        <div className="flex items-start gap-2">
          <StateDot status={status} className="mt-[0.4rem]" />
          <div className="min-w-0">
            <div className="truncate font-mono text-sm font-medium text-foreground">
              {routine.name}
            </div>
            <div className="truncate font-mono text-xs text-ink-faint">
              {routine.slug}
            </div>
          </div>
        </div>
      </td>

      <td className="py-2 pr-3 align-top">
        <StateLabel status={status} lastRunAt={lastRunAt} now={now} />
      </td>

      <td className="hidden py-2 pr-3 align-top font-mono text-xs text-ink-dim md:table-cell">
        {isManual(routine) ? (
          <span className="text-ink-faint">{t("routines.manualDash")}</span>
        ) : (
          routine.schedule
        )}
      </td>

      <td className="hidden py-2 pr-3 align-top font-mono text-xs text-ink-dim md:table-cell">
        {cloud ? "cloud" : "local"}
      </td>

      <td className="hidden py-2 pr-3 align-top md:table-cell">
        <a
          href={`https://github.com/${owner}`}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-xs text-ink-dim underline decoration-dotted underline-offset-2 outline-none hover:text-foreground focus-visible:text-foreground"
        >
          {owner}
        </a>
      </td>

      <td className="hidden py-2 pr-3 align-top sm:table-cell">
        <BoardsCell boards={boards} repo={repo} homeRepo={homeRepo} t={t} />
      </td>

      <td className="py-1.5 align-top">
        <RowMenu
          routine={routine}
          cloud={cloud}
          committed={committed}
          routineId={routineId}
          dashboards={dashboards}
          repo={repo}
          onEdit={onEdit}
          onToggle={onToggle}
          onDelete={onDelete}
          onPlace={onPlace}
          onFired={onFired}
        />
      </td>
    </tr>
  )
}

/** The leading node: green = fresh, yellow = stale/attention, accent = running,
    red = unreachable, hollow = never-run/manual, dim hollow = disabled. Never
    the only carrier of state — the label beside it always names it. */
function StateDot({
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

function StateLabel({
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
      <span className="inline-block h-3 w-16 animate-pulse rounded-full bg-bg3" />
    )
  }
  const strong = "font-mono text-xs text-ink-dim"
  const faint = "font-mono text-xs text-ink-faint"
  switch (status.kind) {
    case "live":
      return status.stale ? (
        <span className="font-mono text-xs text-yellow">
          {t("widget.stale")}
        </span>
      ) : (
        <span className={strong}>{ranLabel(lastRunAt, now, t)}</span>
      )
    case "running":
      return (
        <span className="font-mono text-xs text-primary">
          {t("widget.running")}
        </span>
      )
    case "draft":
      return (
        <span className="font-mono text-xs text-primary">
          {t("routines.stateDraft")}
        </span>
      )
    case "disabled":
      return <span className={faint}>{t("routines.stateDisabled")}</span>
    case "unreachable":
      return (
        <span className="font-mono text-xs text-red">
          {t("routines.stateUnreachable")}
        </span>
      )
    case "needs-trigger":
      return (
        <span className="font-mono text-xs text-yellow">
          {t("routines.stateNeedsSetup")}
        </span>
      )
    default:
      return <span className={faint}>{t("routines.stateNever")}</span>
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
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-xs text-ink-faint">
        <span aria-hidden>—</span>
        <span className="rounded border border-border-dim px-1 text-ink-faint">
          {t("routines.orphan")}
        </span>
      </span>
    )
  }
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-0.5">
      {boards.map((slug) => (
        <Link
          key={slug}
          to={boardHref(repo.full, slug, homeRepo)}
          className="font-mono text-xs text-ink-dim underline decoration-dotted underline-offset-2 outline-none hover:text-foreground focus-visible:text-foreground"
        >
          {slug}
        </Link>
      ))}
    </span>
  )
}

function RowMenu({
  routine,
  cloud,
  committed,
  routineId,
  dashboards,
  repo,
  onEdit,
  onToggle,
  onDelete,
  onPlace,
  onFired,
}: {
  routine: Routine
  cloud: boolean
  committed: boolean
  routineId: string | undefined
  dashboards: string[]
  repo: RepoInfo
  onEdit: () => void
  onToggle: () => void
  onDelete: () => void
  onPlace: (boardSlug: string) => void
  onFired: () => void
}) {
  const t = useT()
  const fetcher = useFetcher<RunResult>()
  // Mark running on a successful fire so the state column flips (ADR-0016).
  useEffect(() => {
    if (fetcher.data?.ok === true) onFired()
  }, [fetcher.data, onFired])

  const fire = () =>
    void fetcher.submit(
      { repo: repo.full, slug: routine.slug },
      { method: "post", action: "/run", encType: "application/json" },
    )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t("routines.rowMenu", { name: routine.name })}
            className="size-6 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 hover:bg-bg3 hover:text-foreground focus-visible:opacity-100 aria-expanded:opacity-100 pointer-coarse:opacity-100"
          />
        }
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={4} className="w-52">
        {cloud && (
          <DropdownMenuItem onClick={fire} disabled={fetcher.state !== "idle"}>
            <Play />
            {t("widget.runNow")}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onEdit}>
          <Pencil />
          {t("routines.edit")}
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
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
        <DropdownMenuItem onClick={onToggle}>
          <Power />
          {routine.enabled ? t("routines.disable") : t("routines.enable")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          <Trash2 />
          {t("routines.delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  const t = useT()
  return (
    <div className="rounded-lg border border-border-dim px-6 py-12 text-center">
      <p className="text-sm text-foreground">{t("routines.emptyTitle")}</p>
      <p className="mt-1 text-sm text-ink-dim">{t("routines.emptyHint")}</p>
      <Button className="mt-4 gap-2" size="sm" onClick={onAdd}>
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
