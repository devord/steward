import { CalendarPlus, Check, PencilRuler } from "lucide-react"

import { NavShell } from "./nav-shell.tsx"
import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"
import type { SidebarData } from "../lib/dashboard.server.ts"
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
  dashboardSlug,
  sidebar,
  login,
  displayName,
  hasDraft,
  editing,
  wide,
  onSync,
  onAdd,
  onToggleEdit,
  onDeleteBoard,
  onRenameBoard,
  onRenameSection,
  onDeleteSection,
  children,
}: {
  dataRepo: string
  dashboardSlug: string
  /** null → still streaming in (ADR-0030): the rail renders its skeleton. */
  sidebar: SidebarData | null
  login: string
  displayName?: string | null
  hasDraft: boolean
  editing: boolean
  /** Widen the content cap to fill a large monitor (else a centered width). */
  wide: boolean
  onSync: () => void
  onAdd: () => void
  onToggleEdit: () => void
  /** Delete a board by repo+slug — wired to the rail's per-board menu. */
  onDeleteBoard: (repo: string, slug: string) => void
  /** Rename a board's display name — same menu; current name for prefill. */
  onRenameBoard: (repo: string, slug: string) => void
  /** Rename a section — the rail's section-header menu, keyed by repo+name. */
  onRenameSection: (repo: string, section: string) => void
  /** Dissolve a section — same menu; its boards move to the ungrouped lead. */
  onDeleteSection: (repo: string, section: string) => void
  children: React.ReactNode
}) {
  const t = useT()

  return (
    <NavShell
      nav={{
        activeRepo: dataRepo,
        dashboardSlug,
        sidebar,
        login,
        displayName,
        // Board lifecycle lives in the rail's per-board menu, keyed by
        // repo+slug — rename on every board, delete on all but each repo's
        // default `main`.
        onDeleteBoard,
        onRenameBoard,
        // Section lifecycle rides the section header's own menu (ADR-0039),
        // keyed by repo + the section's current name.
        onRenameSection,
        onDeleteSection,
      }}
      // Canvas cap: `wide` fills a large monitor (still bounded so the board
      // stays composed, not stretched edge-to-edge); `fixed` keeps the
      // comfortable centered reading width.
      cap={wide ? "max-w-[1800px]" : "max-w-7xl"}
      // Header wayfinding where the rail is hidden — the slug, not the display
      // name: the header pairs it with the wordmark as an identifier, the same
      // honest machine string the URL carries.
      context={dashboardSlug}
      actions={
        <>
          {hasDraft && (
            // The routines ledger's state-chip idiom (StateLabel): the yellow
            // rides a low-alpha wash and hairline while the label stays full
            // ink — 13px colored text misses AA on several light palettes.
            <ToolbarAction
              variant="ghost"
              className="gap-2 border-yellow/45 bg-yellow/10 font-mono text-xs text-ink hover:bg-yellow/15 dark:hover:bg-yellow/15"
              label={t("header.unsynced")}
              icon={
                <span aria-hidden className="size-1.5 rounded-full bg-yellow" />
              }
              onClick={onSync}
            />
          )}
          {/* The toolbar's one accent moment: the create verb takes the solid
              primary (as its empty-state twin already does); everything else
              here rests in ink. Below `sm` the label collapses away and a
              solid square would out-shout the whole header (the loudest
              element in the chrome for a rare action), so the accent survives
              as glyph ink on a ghost square instead of a fill. */}
          <ToolbarAction
            className="max-sm:bg-transparent max-sm:text-primary max-sm:hover:bg-primary/10 max-sm:hover:text-primary dark:max-sm:hover:bg-primary/10"
            label={t("header.addRoutine")}
            icon={<CalendarPlus />}
            onClick={onAdd}
          />
          <ToolbarAction
            variant="ghost"
            className={
              editing
                ? // Active edit mode is a "you are here", not a gray fill — the
                  // rail's selection vocabulary: accent wash, accent glyph,
                  // label in unchanged ink.
                  "bg-primary/10 text-foreground hover:bg-primary/15 dark:hover:bg-primary/15"
                : "text-ink-dim hover:text-foreground"
            }
            aria-pressed={editing}
            label={editing ? t("header.done") : t("header.editLayout")}
            icon={
              editing ? <Check className="text-primary" /> : <PencilRuler />
            }
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
 * 360px viewport. The label stays the accessible name. Icon-only squares cap
 * the *visible* box at 36px — a 44px box in the 48px header reads as a
 * full-height slab the moment a state wash fills it (edit-active) — and the
 * `after` inset extends the touch target to 44px invisibly, the widget bar's
 * ⋯-trigger pattern.
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
      className={cn(
        "max-sm:relative max-sm:min-h-9 max-sm:min-w-9 max-sm:px-0 max-sm:after:absolute max-sm:after:-inset-1",
        className,
      )}
      {...props}
    >
      {icon}
      <span className="max-sm:sr-only">{label}</span>
    </Button>
  )
}
