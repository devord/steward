import { useCallback, useEffect, useMemo, useState } from "react"

import {
  type DashboardFile,
  type RoutinesFile,
  dashboardFileSchema,
  routinesFileSchema,
  serializeDashboardFile,
  serializeRoutinesFile,
} from "@bulletin/schema"
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

const draftSchema = z.object({
  baseShas: baseShasSchema,
  routines: routinesFileSchema,
  dashboard: dashboardFileSchema,
})

export type Draft = z.infer<typeof draftSchema>

/** `boardKey` is `<owner>/<repo>:<dashboard-slug>` — one draft per board. */
function storageKey(boardKey: string) {
  return `bulletin:draft:${boardKey}`
}

function readDraft(boardKey: string): Draft | null {
  const raw = localStorage.getItem(storageKey(boardKey))
  if (!raw) return null
  try {
    return draftSchema.parse(JSON.parse(raw))
  } catch {
    // A draft from an older schema version is not worth migrating: the
    // canonical state is one commit away (ADR-0003). Drop it.
    localStorage.removeItem(storageKey(boardKey))
    return null
  }
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

  const base = useMemo(
    () => reconcileServerBase(view, lastCommit),
    [view, lastCommit],
  )

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
        return next
      })
    },
    [boardKey, base.baseShas, base.routines, base.dashboard],
  )

  const clear = useCallback(() => {
    localStorage.removeItem(storageKey(boardKey))
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
