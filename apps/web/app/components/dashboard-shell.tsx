import { useState } from "react"

import { LayoutGrid, Menu, Plus, Trash2 } from "lucide-react"

import { DashboardSidebar } from "./dashboard-sidebar.tsx"
import { Wordmark } from "./logo.tsx"
import { Button } from "~/components/ui/button"
import { Link } from "~/components/ui/link"
import { Sheet, SheetContent, SheetTitle } from "~/components/ui/sheet"
import { cn } from "~/lib/utils"
import type { BoardScope } from "../lib/board.ts"
import { useT } from "../lib/i18n.tsx"

/**
 * The board chrome (ADR-0010): a persistent navigation rail beside the grid,
 * a mobile drawer that carries the same rail off-canvas below `lg`, and a
 * slim toolbar over the content that holds the board-scoped actions. Splitting
 * navigation (the rail) from board actions (the toolbar) is what unclutters
 * the old single-row header — account and board-switching move into the rail,
 * leaving the toolbar to Add / Edit / Sync only.
 *
 * Pure presentation: every mutation is a callback so the board keeps all draft
 * and edit state.
 */
export function DashboardShell({
  dataRepo,
  scope,
  dashboardSlug,
  personalDashboards,
  teamDashboards,
  login,
  hasDraft,
  editing,
  deletable,
  wide,
  onSync,
  onAdd,
  onToggleEdit,
  onDelete,
  children,
}: {
  dataRepo: string
  scope: BoardScope
  dashboardSlug: string
  personalDashboards: string[]
  teamDashboards: string[] | null
  login: string
  hasDraft: boolean
  editing: boolean
  deletable: boolean
  /** Widen the content cap to fill a large monitor (else a centered width). */
  wide: boolean
  onSync: () => void
  onAdd: () => void
  onToggleEdit: () => void
  onDelete: () => void
  children: React.ReactNode
}) {
  const t = useT()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const nav = {
    dataRepo,
    scope,
    dashboardSlug,
    personalDashboards,
    teamDashboards,
    login,
  }
  const cap = wide ? "max-w-[1800px]" : "max-w-7xl"

  return (
    <div className="flex min-h-dvh">
      {/* Persistent rail — the second neutral layer (bg1), a hairline off the
          page. Sticks full-height while the board scrolls beside it. */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border-dim bg-sidebar lg:flex">
        <DashboardSidebar {...nav} />
      </aside>

      {/* Mobile drawer — the same rail, off-canvas. */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent>
          <SheetTitle className="sr-only">{t("nav.boards")}</SheetTitle>
          <DashboardSidebar {...nav} onNavigate={() => setDrawerOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b bg-background">
          <div
            className={cn(
              "mx-auto flex min-h-11 items-center gap-2 px-4 py-1.5 sm:px-6",
              cap,
            )}
          >
            {/* Below lg the rail is gone, so the toolbar carries the drawer
                trigger and the brand it would otherwise show. */}
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-ink-dim hover:text-foreground lg:hidden"
              aria-label={t("nav.openMenu")}
              onClick={() => setDrawerOpen(true)}
            >
              <Menu />
            </Button>
            <Link
              to="/"
              aria-label="Bulletin"
              className="-mx-1 inline-flex items-center rounded-md px-1 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 lg:hidden"
            >
              <Wordmark className="text-sm" />
            </Link>

            <div className="ml-auto flex items-center gap-1">
              {hasDraft && (
                <ToolbarAction
                  variant="outline"
                  className="gap-2 font-mono text-xs"
                  label={t("header.unsynced")}
                  icon={
                    <span
                      aria-hidden
                      className="size-1.5 rounded-full bg-yellow"
                    />
                  }
                  onClick={onSync}
                />
              )}
              <ToolbarAction
                variant="ghost"
                className="text-ink-dim hover:text-foreground"
                label={t("header.addRoutine")}
                icon={<Plus />}
                onClick={onAdd}
              />
              <ToolbarAction
                variant={editing ? "secondary" : "ghost"}
                className={
                  editing ? undefined : "text-ink-dim hover:text-foreground"
                }
                aria-pressed={editing}
                label={editing ? t("header.done") : t("header.editLayout")}
                icon={<LayoutGrid />}
                onClick={onToggleEdit}
              />
              {editing && deletable && (
                <ToolbarAction
                  variant="ghost"
                  className="text-ink-dim hover:text-red"
                  label={t("board.deleteDashboard")}
                  icon={<Trash2 />}
                  onClick={onDelete}
                />
              )}
            </div>
          </div>
        </header>

        <div className={cn("mx-auto w-full px-4 pt-5 pb-16 sm:px-6", cap)}>
          {children}
        </div>
      </div>
    </div>
  )
}

/**
 * A toolbar button that collapses to its icon on phones: the label goes
 * sr-only and the button squares off, so the action row holds one line on a
 * 360px viewport. The label stays the accessible name.
 */
function ToolbarAction({
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
