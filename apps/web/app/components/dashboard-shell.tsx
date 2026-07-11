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
 * in the rail, leaving the toolbar to Sync / Add / Edit only. Deleting a board
 * is board-lifecycle, not layout: it lives in the rail's per-board menu (passed
 * down as `nav.onDeleteBoard`, keyed by scope+slug so any board is deletable
 * from its own row, not just the one in view), not in this toolbar.
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
  wide,
  onSync,
  onAdd,
  onToggleEdit,
  onDeleteBoard,
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
  /** Widen the content cap to fill a large monitor (else a centered width). */
  wide: boolean
  onSync: () => void
  onAdd: () => void
  onToggleEdit: () => void
  /** Delete a board by scope+slug — wired to the rail's per-board menu. */
  onDeleteBoard: (scope: BoardScope, slug: string) => void
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
        // Board delete lives in the rail's per-board menu, keyed by scope+slug —
        // the rail draws a menu on every board but the personal default.
        onDeleteBoard,
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
