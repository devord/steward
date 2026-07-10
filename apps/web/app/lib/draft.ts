import { useCallback, useEffect, useState } from "react"

import {
  type DashboardFile,
  type RoutinesFile,
  dashboardFileSchema,
  routinesFileSchema,
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

export interface ServerConfig {
  routines: RoutinesFile
  dashboard: DashboardFile
  baseShas: BaseShas
}

/**
 * Draft state layered over the server-loaded config. `draft` is null until
 * hydration (localStorage is client-only) and while no edits exist; the
 * first `update` call forks the server config into a draft.
 */
export function useDraft(boardKey: string, server: ServerConfig) {
  const [draft, setDraft] = useState<Draft | null>(null)

  useEffect(() => {
    setDraft(readDraft(boardKey))
  }, [boardKey])

  const update = useCallback(
    (mutate: (current: Draft) => Draft) => {
      setDraft((previous) => {
        const base = previous ?? {
          baseShas: server.baseShas,
          routines: server.routines,
          dashboard: server.dashboard,
        }
        const next = mutate(structuredClone(base))
        localStorage.setItem(storageKey(boardKey), JSON.stringify(next))
        return next
      })
    },
    [boardKey, server],
  )

  const clear = useCallback(() => {
    localStorage.removeItem(storageKey(boardKey))
    setDraft(null)
  }, [boardKey])

  /** Re-apply the draft onto a fresh base after a stale-base conflict. */
  const rebase = useCallback(
    (freshShas: BaseShas) => {
      update((current) => ({ ...current, baseShas: freshShas }))
    },
    [update],
  )

  return { draft, update, clear, rebase }
}
