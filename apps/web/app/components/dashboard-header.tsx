import { Form } from "react-router"

import { LayoutGrid, Plus, Settings, Trash2 } from "lucide-react"

import { AppHeader } from "./app-header.tsx"
import { DashboardSwitcher } from "./dashboard-switcher.tsx"
import { Wordmark } from "./logo.tsx"
import { Button, buttonVariants } from "~/components/ui/button"
import { Link } from "~/components/ui/link"
import { Separator } from "~/components/ui/separator"
import { cn } from "~/lib/utils"
import type { BoardScope } from "../lib/board.ts"
import { useT } from "../lib/i18n.tsx"

/**
 * The board chrome: brand · context · actions, in one slim row. Three
 * optical zones separated by hairline rules — identity (clickable wordmark),
 * location (repo attribution + board switcher), and the trailing action /
 * account clusters. Pure presentation; every mutation is a callback so the
 * board owns all draft and edit state.
 */
export function DashboardHeader({
  dataRepo,
  scope,
  dashboardSlug,
  personalDashboards,
  teamDashboards,
  login,
  hasDraft,
  editing,
  deletable,
  onSync,
  onAdd,
  onToggleEdit,
  onDelete,
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
  onSync: () => void
  onAdd: () => void
  onToggleEdit: () => void
  onDelete: () => void
}) {
  const t = useT()

  return (
    <AppHeader className="gap-x-2.5">
      <Link
        to="/"
        aria-label="bulletin"
        className="-mx-1 inline-flex items-center rounded-md px-1 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Wordmark className="text-sm" />
      </Link>

      <HeaderDivider />

      <a
        href={`https://github.com/${dataRepo}`}
        target="_blank"
        rel="noreferrer"
        className="hidden font-mono text-xs text-ink-faint transition-colors hover:text-foreground md:inline"
      >
        {dataRepo}
      </a>
      <span
        aria-hidden
        className="hidden font-mono text-xs text-ink-faint md:inline"
      >
        /
      </span>
      <DashboardSwitcher
        scope={scope}
        dashboardSlug={dashboardSlug}
        personalDashboards={personalDashboards}
        teamDashboards={teamDashboards}
      />

      {/* Two clusters, one divider: board actions | account. Spacing is
          tighter within a cluster (gap-1) than between them, so the grouping
          reads without extra ornament. */}
      <div className="ml-auto flex items-center gap-1">
        {hasDraft && (
          <HeaderAction
            variant="outline"
            className="gap-2 font-mono text-xs"
            label={t("header.unsynced")}
            icon={
              <span aria-hidden className="size-1.5 rounded-full bg-yellow" />
            }
            onClick={onSync}
          />
        )}
        <HeaderAction
          variant="ghost"
          className="text-ink-dim hover:text-foreground"
          label={t("header.addRoutine")}
          icon={<Plus />}
          onClick={onAdd}
        />
        <HeaderAction
          variant={editing ? "secondary" : "ghost"}
          className={editing ? undefined : "text-ink-dim hover:text-foreground"}
          aria-pressed={editing}
          label={editing ? t("header.done") : t("header.editLayout")}
          icon={<LayoutGrid />}
          onClick={onToggleEdit}
        />
        {editing && deletable && (
          <HeaderAction
            variant="ghost"
            className="text-ink-dim hover:text-red"
            label={t("board.deleteDashboard")}
            icon={<Trash2 />}
            onClick={onDelete}
          />
        )}

        <HeaderDivider className="mx-1.5" />

        <Link
          to="/settings"
          aria-label={t("header.settings")}
          title={t("header.settings")}
          className={cn(
            buttonVariants({ size: "icon-sm", variant: "ghost" }),
            "text-ink-dim hover:text-foreground",
          )}
        >
          <Settings className="size-3.5" />
        </Link>
        <span className="hidden px-1 font-mono text-xs text-ink-faint md:inline">
          {login}
        </span>
        <Form method="post" action="/auth/logout">
          <Button
            size="sm"
            variant="ghost"
            type="submit"
            className="text-ink-faint hover:text-foreground"
          >
            {t("header.signOut")}
          </Button>
        </Form>
      </div>
    </AppHeader>
  )
}

/** A short vertical hairline that keeps the row's optical baseline. */
function HeaderDivider({ className }: { className?: string }) {
  return (
    <Separator
      orientation="vertical"
      className={cn("h-4! self-center!", className)}
    />
  )
}

/**
 * A header button that collapses to its icon on phones: the label goes
 * sr-only and the button squares off, so the action row holds one line
 * on a 360px viewport. The label is still the accessible name.
 */
function HeaderAction({
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
