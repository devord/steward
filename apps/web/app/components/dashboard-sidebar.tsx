import { useState } from "react"

import {
  FolderGit2,
  ListTodo,
  MoreHorizontal,
  Plus,
  Trash2,
} from "lucide-react"

import { AccountMenu } from "./account-menu.tsx"
import { AddDataRepoDialog } from "./add-data-repo-dialog.tsx"
import { Wordmark } from "./logo.tsx"
import { NewDashboardDialog } from "./new-dashboard-dialog.tsx"
import { RepoGroupHeader } from "./repo-group-header.tsx"
import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { Link } from "~/components/ui/link"
import { cn } from "~/lib/utils"
import type { SidebarData } from "../lib/dashboard.server.ts"
import { boardHref, DEFAULT_DASHBOARD, routinesHref } from "../lib/repos.ts"
import { useT } from "../lib/i18n.tsx"

/**
 * The board navigation rail — brand, one group per discovered data repo
 * (ADR-0023, home first), a new-board affordance, and the account menu pinned
 * to the foot. Renders the same inner content in two hosts: the persistent
 * `<aside>` on wide viewports and the mobile drawer (`dashboard-shell.tsx`).
 * It carries no surface, width, or positioning of its own — the host owns the
 * border, background, collapse, and resize — so the two placements can't drift.
 *
 * Board switching lives in this always-visible list: every board is one click,
 * the active one reads from across the room, and "new dashboard" is a peer of
 * the boards it joins. Each group leads with its dashboards — the group IS its
 * boards — and the repo's routine pool (ADR-0025) hangs off the group foot: a
 * peer view, but a different kind, so it sits under the boards, never posing as
 * the first one.
 *
 * A repo group with no boards keeps a create-first row in place of the board
 * list — deleting the last board must not make the repo disappear from the app.
 */
export function DashboardSidebar({
  dataRepo,
  activeRepo,
  dashboardSlug,
  routinesRepo = "",
  sidebar,
  login,
  displayName,
  onDeleteBoard,
  onNavigate,
}: {
  dataRepo: string
  /** The active board's repo; "" on chrome pages (settings). */
  activeRepo: string
  dashboardSlug: string
  /** The repo whose routine pool view is active (ADR-0025), else "". */
  routinesRepo?: string
  sidebar: SidebarData
  login: string
  displayName?: string | null
  /** Delete a board by repo+slug — the handler behind every board's per-board
      menu, so a board is actionable without first switching to it. Absent on
      chrome pages (no board actions there); the home default board is never
      offered a menu (it must always exist). */
  onDeleteBoard?: (repo: string, slug: string) => void
  /** Fired when a board link is followed — lets the mobile drawer close. */
  onNavigate?: () => void
}) {
  const t = useT()
  // The repo the new-dashboard dialog opens on, or null while closed — an
  // empty group's create-first row opens it pre-targeted at that repo.
  const [creating, setCreating] = useState<string | null>(null)
  const [addingRepo, setAddingRepo] = useState(false)

  const homeRepo = sidebar.repos.find((repo) => repo.isHome)?.repo ?? ""

  return (
    <div className="flex h-full flex-col">
      {/* Brand row, exactly the board toolbar's height (h-11 + border-b) so
          the top hairline runs unbroken across both columns. */}
      <div className="flex h-11 shrink-0 items-center border-b border-border-dim px-3">
        <Link
          to="/"
          aria-label="Steward"
          onClick={onNavigate}
          className="-mx-1 inline-flex items-center rounded-md px-1 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Wordmark className="text-sm" />
        </Link>
      </div>

      <nav
        aria-label={t("nav.boards")}
        className="flex flex-1 flex-col overflow-y-auto px-2 py-3"
      >
        <div className="space-y-4">
          {sidebar.repos.map((group) => (
            <NavGroup
              key={group.repo}
              header={<RepoGroupHeader group={group} />}
              foot={
                <PoolNavItem
                  to={routinesHref(group.repo)}
                  active={routinesRepo === group.repo}
                  onNavigate={onNavigate}
                />
              }
            >
              {group.dashboards.map((slug) => {
                const active =
                  activeRepo === group.repo && dashboardSlug === slug
                // Every repo's `main` is its default board (server-protected in
                // all repos) — so no delete menu on any `main`.
                return (
                  <NavItem
                    key={`${group.repo}:${slug}`}
                    to={boardHref(group.repo, slug, homeRepo)}
                    label={slug}
                    active={active}
                    onDelete={
                      onDeleteBoard && slug !== DEFAULT_DASHBOARD
                        ? () => onDeleteBoard(group.repo, slug)
                        : undefined
                    }
                    onNavigate={onNavigate}
                  />
                )
              })}
              {group.dashboards.length === 0 && (
                // The group's only child while the repo has no boards: the
                // next action, sitting where the first board will. The plus
                // takes the rail-node slot the active dot uses, so it reads
                // as "a board goes here".
                <RailAction
                  icon={Plus}
                  label={t("switcher.newHere")}
                  onClick={() => setCreating(group.repo)}
                />
              )}
            </NavGroup>
          ))}

          {/* Discovery degraded (search rate limit, GitHub flap): say quietly
              that groups may be missing rather than render a confident lie. */}
          {!sidebar.complete && (
            <p className="px-2.5 font-mono text-xs text-ink-faint">
              {t("switcher.incomplete")}
            </p>
          )}
        </div>

        {/* New board — a create verb that belongs with the boards above, so it
            sits at the end of the list on the same marker/label column, set off
            by one hairline (a verb, not one of the nouns). The trailing space
            is empty scroll room, not a gap the actions float in. */}
        <div className="mt-2 space-y-2">
          <div className="mx-2.5 border-t border-border-dim" />
          <RailAction
            icon={Plus}
            label={t("switcher.new")}
            onClick={() => setCreating(activeRepo || homeRepo)}
          />
        </div>
      </nav>

      {/* Foot: workspace-level actions live here, not adrift in the board list.
          "Add data repo" grows the rail itself (a new group), so it sits with
          the account — the other whole-workspace control — on a shared column
          keyed to the account avatar. */}
      <div className="shrink-0 space-y-0.5 border-t border-border-dim p-2">
        <button
          type="button"
          onClick={() => setAddingRepo(true)}
          className="flex w-full cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 text-sm text-ink-dim transition-colors outline-none hover:bg-sidebar-accent/60 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span
            aria-hidden
            className="flex size-6 shrink-0 items-center justify-center"
          >
            <FolderGit2 className="size-4 text-ink-faint" />
          </span>
          {t("switcher.addRepo")}
        </button>
        <AccountMenu
          login={login}
          displayName={displayName}
          dataRepo={dataRepo}
          block
          onNavigate={onNavigate}
        />
      </div>

      <NewDashboardDialog
        open={creating !== null}
        onOpenChange={(open) => {
          if (!open) setCreating(null)
        }}
        repos={sidebar.repos.map((repo) => repo.repo)}
        defaultRepo={creating ?? activeRepo ?? homeRepo}
        homeRepo={homeRepo}
        takenSlugs={Object.fromEntries(
          sidebar.repos.map((repo) => [repo.repo, repo.dashboards]),
        )}
      />
      <AddDataRepoDialog
        open={addingRepo}
        onOpenChange={setAddingRepo}
        known={sidebar.repos.map((repo) => repo.repo)}
        onNavigate={onNavigate}
      />
    </div>
  )
}

/**
 * A create verb rendered on the board list's own grid: the icon sits centered
 * on the rail spine (the marker column the active dot uses), the label on the
 * board-name column. Sharing that geometry is what keeps "new dashboard" and
 * the empty-group create-first row reading as peers of the boards they make,
 * not buttons floating on a different margin.
 */
function RailAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Plus
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex w-full cursor-pointer items-center rounded-md py-1.5 pr-2.5 pl-6 text-left text-sm text-ink-dim transition-colors outline-none hover:bg-sidebar-accent/60 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Icon
        aria-hidden
        className="absolute top-1/2 left-[13px] size-4 -translate-x-1/2 -translate-y-1/2 text-ink-faint"
      />
      {label}
    </button>
  )
}

/**
 * A repo heading over its board list, the boards threaded on a single hairline
 * spine — a tree indent guide (1px, neutral), not a side-stripe: the rail
 * descends from under the heading and runs the height of the list, so the
 * boards read as its children rather than rows floating in space. The active
 * board is an accent node sitting on the rail (see {@link NavItem}). The repo's
 * routine pool isn't a board, so it hangs off the group foot below the spine
 * ({@link PoolNavItem}) — the group reads first as the dashboards it holds.
 */
function NavGroup({
  header,
  foot,
  children,
}: {
  header: React.ReactNode
  /** A repo-level entry rendered under the board spine — the routine pool link
      (ADR-0025). A peer view of the boards but a different kind, so it sits at
      the group's foot, off the spine, never as the first "board". */
  foot?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div>
      {header}
      <div className="relative flex flex-col gap-0.5">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-1 left-[13px] w-px bg-border-dim"
        />
        {children}
      </div>
      {foot}
    </div>
  )
}

/**
 * A repo's routine pool link (ADR-0025) — a peer of its boards but a different
 * kind: it lists what runs, not a grid. It sits at the group's foot, below the
 * board spine, on the boards' own marker/label columns — a ledger icon in the
 * node slot (where boards carry a dot), the label on the board-name column — so
 * it reads as the repo's own entry, plainly not one of the dashboards. Set off
 * from the last board by a hair of space, it lights the same accent-tinted
 * selection as an active board when it's the current page.
 */
function PoolNavItem({
  to,
  active,
  onNavigate,
}: {
  to: string
  active: boolean
  onNavigate?: () => void
}) {
  const t = useT()
  return (
    <Link
      to={to}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative mt-1 flex items-center rounded-md py-1.5 pr-2.5 pl-6 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        active
          ? "bg-primary/10 font-medium text-foreground"
          : "text-ink-dim hover:bg-sidebar-accent/60 hover:text-foreground",
      )}
    >
      <ListTodo
        aria-hidden
        className="absolute top-1/2 left-[13px] size-4 -translate-x-1/2 -translate-y-1/2 text-ink-faint"
      />
      {t("nav.routines")}
    </Link>
  )
}

/**
 * One board link, indented to hang off its group's rail. The leading slot is
 * pinned to the rail's x so the active accent dot reads as a node on the spine
 * ("you are here"); inactive rows leave the rail unbroken. Active also fills and
 * lifts to full ink.
 *
 * When `onDelete` is set (every deletable board — all but the home default)
 * the row carries a trailing `⋯` menu: board-lifecycle actions live here, beside
 * the board they act on, so any board is actionable without switching to it
 * first. The menu rests quiet — a faint glyph, no hover gate — and brightens as
 * the pointer nears (row, then button): present enough to find, dim enough to
 * recede against the board names. The Link is a sibling of the menu button
 * (never its parent) so no interactive control nests inside the anchor.
 */
function NavItem({
  to,
  label,
  active,
  onDelete,
  onNavigate,
}: {
  to: string
  label: string
  active: boolean
  onDelete?: () => void
  onNavigate?: () => void
}) {
  const t = useT()
  return (
    <div className="group/nav relative flex items-center">
      <Link
        to={to}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group relative flex min-w-0 flex-1 items-center rounded-md py-1.5 pr-2.5 pl-6 font-mono text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          onDelete && "pr-8",
          active
            ? "bg-primary/10 font-medium text-foreground"
            : "text-ink-dim hover:bg-sidebar-accent/60 hover:text-foreground",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute top-1/2 left-[13px] -translate-x-1/2 -translate-y-1/2 rounded-full transition-all",
            active
              ? "size-2 bg-primary"
              : "size-1.5 bg-transparent group-hover:bg-ink-faint",
          )}
        />
        <span className="truncate">{label}</span>
      </Link>
      {onDelete && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={t("board.menu")}
                className="absolute right-1 size-6 text-ink-faint transition-colors group-hover/nav:text-ink-dim hover:bg-sidebar-accent hover:text-foreground focus-visible:text-foreground aria-expanded:bg-sidebar-accent aria-expanded:text-foreground"
              />
            }
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={4} className="w-48">
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 />
              {t("board.deleteDashboard")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
