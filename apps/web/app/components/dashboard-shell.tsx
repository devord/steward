import { CalendarPlus, Check, PencilRuler } from "lucide-react"

import { NavShell } from "./nav-shell.tsx"
import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"
import type { BoardScope } from "../lib/board.ts"
import { useT } from "../lib/i18n.tsx"

/**
 * The board chrome (ADR-0010): the shared app frame ({@link NavShell} — rail,
 * mobile drawer, sticky header) with the board-scoped actions dropped into its
 * toolbar. Splitting navigation (the rail) from board actions (the toolbar) is
 * what unclutters the old single-row header — account and board-switching live
 * in the rail, leaving the toolbar to Sync / Add / Edit only. Deleting the
 * board is board-lifecycle, not layout: it lives in the rail's per-board menu
 * (passed down as `nav.onDeleteDashboard`), not in this toolbar.
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
  displayName,
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
  displayName?: string | null
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

  return (
    <NavShell
      nav={{
        dataRepo,
        scope,
        dashboardSlug,
        personalDashboards,
        teamDashboards,
        login,
        displayName,
        // The active board's delete lives in the rail's per-board menu. Only
        // deletable boards get it — the personal default has no menu action.
        onDeleteDashboard: deletable ? onDelete : undefined,
      }}
      // Canvas cap: `wide` fills a large monitor (still bounded so the board
      // stays composed, not stretched edge-to-edge); `fixed` keeps the
      // comfortable centered reading width.
      cap={wide ? "max-w-[1800px]" : "max-w-7xl"}
      actions={
        <>
          {hasDraft && (
            <ToolbarAction
              variant="outline"
              className="gap-2 font-mono text-xs"
              label={t("header.unsynced")}
              icon={
                <span aria-hidden className="size-1.5 rounded-full bg-yellow" />
              }
              onClick={onSync}
            />
          )}
          <ToolbarAction
            variant="ghost"
            className="text-ink-dim hover:text-foreground"
            label={t("header.addRoutine")}
            icon={<CalendarPlus />}
            onClick={onAdd}
          />
          <ToolbarAction
            variant={editing ? "secondary" : "ghost"}
            className={
              editing ? undefined : "text-ink-dim hover:text-foreground"
            }
            aria-pressed={editing}
            label={editing ? t("header.done") : t("header.editLayout")}
            icon={editing ? <Check /> : <PencilRuler />}
            onClick={onToggleEdit}
          />
        </>
      }
    >
      {children}
    </NavShell>
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
