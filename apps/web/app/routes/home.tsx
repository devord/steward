import { useCallback, useState } from "react"
import { Form, redirect, useRevalidator } from "react-router"

import type { Routine, WidgetSize } from "@bulletin/schema"
import { GRID_MAX_COLS } from "@bulletin/schema"
import { LayoutGrid, Plus } from "lucide-react"

import type { Route } from "./+types/home"
import { AddRoutineDialog } from "../components/add-routine-dialog.tsx"
import { SyncPanel } from "../components/sync-panel.tsx"
import { WidgetCard } from "../components/widget-card.tsx"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { cssVars } from "../lib/css.ts"
import {
  dataRepoExists,
  loadDashboard,
  resolveDataRepo,
} from "../lib/dashboard.server.ts"
import { type BaseShas, useDraft } from "../lib/draft.ts"
import { collides, findFreeSlot } from "../lib/placement.ts"
import { getAuth } from "../lib/session.server.ts"

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Bulletin" },
    {
      name: "description",
      content: "A dashboard of living widgets, kept fresh by routines.",
    },
  ]
}

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await getAuth(request)
  if (!auth) return { kind: "anonymous" as const }

  const dataRepo = resolveDataRepo(auth.login, auth.dataRepo)
  if (!(await dataRepoExists(auth.token, dataRepo))) throw redirect("/setup")

  const view = await loadDashboard(auth.token, dataRepo)
  return {
    kind: "dashboard" as const,
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
        // Moving onto another widget is a no-op — predictable beats clever
        // until drag-and-drop lands.
        if (!collides(current.dashboard.widgets, candidate, slug)) {
          widget.position = { col, row }
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
    <div className="mx-auto max-w-7xl px-4 pb-16">
      <header className="flex flex-wrap items-center gap-3 py-4">
        <h1 className="font-mono text-lg font-bold tracking-widest text-primary">
          Bulletin
        </h1>
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus data-icon="inline-start" />
          Add routine
        </Button>
        <Button
          size="sm"
          variant={editing ? "secondary" : "ghost"}
          aria-pressed={editing}
          onClick={() => setEditing((value) => !value)}
        >
          <LayoutGrid data-icon="inline-start" />
          {editing ? "Done editing" : "Edit layout"}
        </Button>
        {draft && (
          <Button size="sm" onClick={() => setSyncing(true)}>
            <Badge
              variant="secondary"
              className="mr-1 h-4 bg-bg/20 px-1 text-[10px]"
            >
              draft
            </Badge>
            Unsynced changes
          </Button>
        )}
        <div className="ml-auto flex items-center gap-3 text-sm text-muted-foreground">
          <a
            href={`https://github.com/${view.dataRepo}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-xs hover:text-foreground"
          >
            {view.dataRepo}
          </a>
          <span className="font-mono text-xs">{login}</span>
          <Form method="post" action="/auth/logout">
            <Button size="sm" variant="ghost" type="submit">
              sign out
            </Button>
          </Form>
        </div>
      </header>

      {dashboard.widgets.length === 0 ? (
        <EmptyDashboard onAdd={() => setAdding(true)} />
      ) : (
        <main
          className="dash-grid"
          style={cssVars({ "--row-h": `${dashboard.grid.rowHeight}px` })}
        >
          {dashboard.widgets.flatMap((widget) => {
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
                onMove={(dCol, dRow) => moveWidget(widget.routine, dCol, dRow)}
                onResize={(size) => resizeWidget(widget.routine, size)}
                onRemove={() => removeWidget(widget.routine)}
              />,
            ]
          })}
        </main>
      )}

      {unplaced.length > 0 && editing && (
        <section className="mt-6">
          <h2 className="mb-2 font-mono text-xs tracking-widest text-ink-faint uppercase">
            Not on the grid
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

function Landing() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 leading-relaxed">
      <h1 className="font-mono text-3xl font-bold tracking-widest text-primary">
        Bulletin
      </h1>
      <p className="mt-4">
        A dashboard of living widgets, each kept fresh by a scheduled routine.
      </p>
      <p className="mt-2 text-muted-foreground">
        Your config and artifacts live in a private GitHub repo of your own —
        the app stores nothing.
      </p>
      <a
        href="/auth/login"
        className="mt-8 inline-block rounded-lg bg-primary px-4 py-2 font-mono text-sm font-bold text-primary-foreground hover:bg-primary/80"
      >
        Sign in with GitHub
      </a>
    </main>
  )
}

function EmptyDashboard({ onAdd }: { onAdd: () => void }) {
  return (
    <main className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-24 text-center">
      <p className="text-muted-foreground">No widgets on the grid yet.</p>
      <Button onClick={onAdd}>
        <Plus data-icon="inline-start" />
        Add your first routine
      </Button>
    </main>
  )
}
