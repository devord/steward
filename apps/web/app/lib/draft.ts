import { useCallback, useEffect, useMemo, useState } from "react"

import {
  type DashboardFile,
  type RoutinesFile,
  dashboardFileSchema,
  routinesFileSchema,
  serializeDashboardFile,
  serializeRoutinesFile,
} from "@steward/schema"
import { z } from "zod"

/**
 * Unsynced config edits (ADR-0003): the UI mutates a draft in localStorage,
 * never the repo. `baseShas` are the blob SHAs the draft was created
 * against — the Sync panel compares them with the repo's current SHAs to
 * detect a moved base.
 */
export const baseShasSchema = z.object({
  routines: z.string().nullable(),
  dashboard: z.string().nullable(),
})

export type BaseShas = z.infer<typeof baseShasSchema>

/** The two config files a board's draft can touch. */
export type SyncKind = "routines" | "dashboard"

/** localStorage key prefix for drafts — the rail scans it (rail-status.ts) to
    mark boards carrying unsynced work. */
export const DRAFT_KEY_PREFIX = "steward:draft:"

/** Fired on every draft write/remove so same-document observers (the rail)
    can re-scan; `storage` events only reach *other* tabs. */
export const DRAFT_EVENT = "steward:draft-change"

function notifyDraftChange() {
  // Deferred: writes happen inside React state updaters, and a synchronous
  // dispatch there would set listeners' state mid-render.
  queueMicrotask(() => window.dispatchEvent(new Event(DRAFT_EVENT)))
}

/** One draft per board (ADR-0003): two dashboards in the same repo are
    separate edit surfaces even though they share routines.yaml. */
export function boardDraftKey(repo: string, slug: string): string {
  return `${repo}:${slug}`
}

/** The repo pool's own draft key (ADR-0025) — `__routines__` can't collide
    with a board slug (real slugs are kebab-case), so the pool's draft never
    crosses a board's. */
export function poolDraftKey(repo: string): string {
  return `${repo}:__routines__`
}

const draftSchema = z.object({
  baseShas: baseShasSchema,
  routines: routinesFileSchema,
  dashboard: dashboardFileSchema,
})

export type Draft = z.infer<typeof draftSchema>

/** `boardKey` is `<owner>/<repo>:<dashboard-slug>` — one draft per board. */
function storageKey(boardKey: string) {
  return `${DRAFT_KEY_PREFIX}${boardKey}`
}

function readDraft(boardKey: string): Draft | null {
  const raw = localStorage.getItem(storageKey(boardKey))
  if (!raw) return null
  try {
    const parsed = draftSchema.parse(JSON.parse(raw))
    return {
      ...parsed,
      dashboard: pruneDanglingWidgets(parsed.dashboard, parsed.routines),
    }
  } catch {
    // A draft from an older schema version is not worth migrating: the
    // canonical state is one commit away (ADR-0003). Drop it.
    localStorage.removeItem(storageKey(boardKey))
    notifyDraftChange()
    return null
  }
}

/**
 * Drop widgets whose routine no longer exists. Such a widget renders nothing
 * (the board skips it) yet still occupies its cells for collision and inflates
 * the column floor — an invisible blocker that pins the grid. Pruning is the
 * symmetric counterpart to `removeRoutine`: it keeps the two config sides in
 * sync so the board self-heals on the next commit. Returns the same object
 * when nothing dangles, to keep memo identity stable for healthy boards.
 */
export function pruneDanglingWidgets(
  dashboard: DashboardFile,
  routines: RoutinesFile,
): DashboardFile {
  const known = new Set(routines.routines.map((r) => r.slug))
  const widgets = dashboard.widgets.filter((w) => known.has(w.routine))
  if (widgets.length === dashboard.widgets.length) return dashboard
  return { ...dashboard, widgets }
}

/** Drop a routine and every widget that references it (bug: "delete" that
    only unplaced the widget left the routine — and its slug — behind). */
export function removeRoutine(draft: Draft, slug: string): Draft {
  return {
    ...draft,
    routines: {
      ...draft.routines,
      routines: draft.routines.routines.filter((r) => r.slug !== slug),
    },
    dashboard: {
      ...draft.dashboard,
      widgets: draft.dashboard.widgets.filter((w) => w.routine !== slug),
    },
  }
}

/** Adopt a fresh base for the draft's content — the "keep my version"
    resolution of a moved base (force-overwrites the server on next commit). */
export function rebaseDraft(draft: Draft, freshShas: BaseShas): Draft {
  return { ...draft, baseShas: freshShas }
}

/** Which files' bases moved server-side relative to the draft. */
export function staleKinds(
  draftShas: BaseShas,
  serverShas: BaseShas,
): SyncKind[] {
  const kinds: SyncKind[] = []
  if (draftShas.routines !== serverShas.routines) kinds.push("routines")
  if (draftShas.dashboard !== serverShas.dashboard) kinds.push("dashboard")
  return kinds
}

/** What the client remembers about its own last direct commit, so it can tell
    a lagging read of the pre-commit blob apart from a real third-party edit. */
export interface LastCommit {
  /** Base SHAs the committed draft was made against. */
  prevShas: BaseShas
  /** SHAs the commit produced, per file it wrote. */
  newShas: Partial<Record<SyncKind, string>>
  routines: RoutinesFile
  dashboard: DashboardFile
  files: { routines: string; dashboard: string }
}

export interface ServerConfig {
  routines: RoutinesFile
  dashboard: DashboardFile
  baseShas: BaseShas
  baseFiles: { routines: string | null; dashboard: string | null }
}

export interface ReconciledBase extends ServerConfig {
  /** true once every committed file has converged on the server (or been
      overtaken by a third-party commit) — the caller drops the LastCommit. */
  settled: boolean
}

/**
 * Fold the client's last commit into the freshly loaded server config. The
 * contents API can serve a lagging replica right after a commit, so the loader
 * may report the pre-commit blob for a file we know we just wrote. Per file:
 *  - loader SHA === the SHA we committed → GitHub converged; trust the loader.
 *  - loader SHA === the pre-commit SHA → a lagging read; substitute what we
 *    committed so a new draft forks from the real base, not the stale one.
 *  - anything else → a genuine third-party commit moved past ours; trust the
 *    loader (a real moved base the Sync panel will surface as a conflict).
 */
export function reconcileServerBase(
  view: ServerConfig,
  lastCommit: LastCommit | null,
): ReconciledBase {
  if (!lastCommit) return { ...view, settled: true }

  const baseShas = { ...view.baseShas }
  const baseFiles = { ...view.baseFiles }
  let routines = view.routines
  let dashboard = view.dashboard
  let settled = true

  for (const kind of ["routines", "dashboard"] as const) {
    const committedSha = lastCommit.newShas[kind]
    if (committedSha == null) continue // this file wasn't part of the commit
    const loaderSha = view.baseShas[kind]
    if (loaderSha === committedSha) continue // converged — loader is authoritative
    if (loaderSha === lastCommit.prevShas[kind]) {
      // Lagging read of the pre-commit blob: carry our committed state forward.
      baseShas[kind] = committedSha
      baseFiles[kind] = lastCommit.files[kind]
      if (kind === "routines") routines = lastCommit.routines
      else dashboard = lastCommit.dashboard
      settled = false
    }
    // else: overtaken by a third-party commit — leave the loader's value.
  }

  return { baseShas, baseFiles, routines, dashboard, settled }
}

/**
 * Draft state layered over the server-loaded config. `draft` is null until
 * hydration (localStorage is client-only) and while no edits exist; the
 * first `update` call forks the server config into a draft. `base` is the
 * server config reconciled with the client's last commit (see
 * reconcileServerBase) — always use it, not the raw loader `view`, so a
 * lagging post-commit read can't resurrect stale config.
 */
export function useDraft(boardKey: string, view: ServerConfig) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [lastCommit, setLastCommit] = useState<LastCommit | null>(null)

  useEffect(() => {
    setDraft(readDraft(boardKey))
    // A remembered commit belongs to the board that made it.
    setLastCommit(null)
  }, [boardKey])

  const base = useMemo(() => {
    const reconciled = reconcileServerBase(view, lastCommit)
    // A widget whose routine was removed straight from routines.yaml (or by an
    // older delete path) renders nothing but still pins the grid; prune it here
    // so every downstream consumer — render, drag collision, column floor, and
    // the draft that forks from this base — sees only live widgets.
    return {
      ...reconciled,
      dashboard: pruneDanglingWidgets(
        reconciled.dashboard,
        reconciled.routines,
      ),
    }
  }, [view, lastCommit])

  // Once the server has caught up, the commit record has nothing left to fix.
  useEffect(() => {
    if (lastCommit && base.settled) setLastCommit(null)
  }, [lastCommit, base.settled])

  const update = useCallback(
    (mutate: (current: Draft) => Draft) => {
      setDraft((previous) => {
        const start = previous ?? {
          baseShas: base.baseShas,
          routines: base.routines,
          dashboard: base.dashboard,
        }
        const next = mutate(structuredClone(start))
        localStorage.setItem(storageKey(boardKey), JSON.stringify(next))
        notifyDraftChange()
        return next
      })
    },
    [boardKey, base.baseShas, base.routines, base.dashboard],
  )

  const clear = useCallback(() => {
    localStorage.removeItem(storageKey(boardKey))
    notifyDraftChange()
    setDraft(null)
  }, [boardKey])

  /** After a successful direct commit: remember what we wrote (so a lagging
      read of the pre-commit blob is reconciled, not re-forked) and drop the
      now-obsolete draft. */
  const applyCommit = useCallback(
    (newShas: Partial<Record<SyncKind, string>>) => {
      if (draft) {
        setLastCommit({
          prevShas: draft.baseShas,
          newShas,
          routines: draft.routines,
          dashboard: draft.dashboard,
          files: {
            routines: serializeRoutinesFile(draft.routines),
            dashboard: serializeDashboardFile(draft.dashboard),
          },
        })
      }
      localStorage.removeItem(storageKey(boardKey))
      notifyDraftChange()
      setDraft(null)
    },
    [boardKey, draft],
  )

  /** Fold the SHAs a partial (raced) commit did land into the draft's base, so
      retrying doesn't false-conflict on the file that already committed. */
  const patchBaseShas = useCallback(
    (partial: Partial<Record<SyncKind, string>>) => {
      update((current) => ({
        ...current,
        baseShas: { ...current.baseShas, ...partial },
      }))
    },
    [update],
  )

  /** Re-apply the draft onto a fresh base after a stale-base conflict. */
  const rebase = useCallback(
    (freshShas: BaseShas) => {
      update((current) => rebaseDraft(current, freshShas))
    },
    [update],
  )

  return {
    draft,
    base,
    update,
    clear,
    rebase,
    applyCommit,
    patchBaseShas,
  }
}
