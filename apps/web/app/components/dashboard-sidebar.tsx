import { useState } from "react"

import { LayoutGrid, MoreHorizontal, Plus, Trash2 } from "lucide-react"

import { AccountMenu } from "./account-menu.tsx"
import { Wordmark } from "./logo.tsx"
import { NewDashboardDialog } from "./new-dashboard-dialog.tsx"
import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { Link } from "~/components/ui/link"
import { cn } from "~/lib/utils"
import { type BoardScope, boardHref, DEFAULT_DASHBOARD } from "../lib/board.ts"
import { useT } from "../lib/i18n.tsx"

/**
 * The board navigation rail — brand, the boards grouped by scope, a new-board
 * affordance, and the account menu pinned to the foot. Renders the same inner
 * content in two hosts: the persistent `<aside>` on wide viewports and the
 * mobile drawer (`dashboard-shell.tsx`). It carries no surface, width, or
 * positioning of its own — the host owns the border, background, collapse, and
 * resize — so the two placements can't drift.
 *
 * Board switching lives in this always-visible list (ADR-0010): every board is
 * one click, the active one reads from across the room, and "new dashboard" is
 * a peer of the boards it joins. The data repo is reachable from the account
 * menu ("View data repo"), so it isn't repeated here.
 *
 * The Team group tracks the *scope*, not the boards: `teamDashboards` is null
 * only when team scope is unreachable (unconfigured, no repo, no access) — an
 * empty array means the team repo exists with no boards yet (deleting the last
 * one gets here), and the group stays put with a create-first row in place of
 * the board list. Hiding it would make team scope disappear from the app the
 * moment its last board goes.
 */
export function DashboardSidebar({
  dataRepo,
  scope,
  dashboardSlug,
  personalDashboards,
  teamDashboards,
  login,
  displayName,
  onDeleteBoard,
  onNavigate,
}: {
  dataRepo: string
  scope: BoardScope
  dashboardSlug: string
  personalDashboards: string[]
  teamDashboards: string[] | null
  login: string
  displayName?: string | null
  /** Delete a board by scope+slug — the handler behind every board's per-board
      menu, so a board is actionable without first switching to it. Absent on
      chrome pages (no board actions there); the personal default board is never
      offered a menu (it must always exist). */
  onDeleteBoard?: (scope: BoardScope, slug: string) => void
  /** Fired when a board link is followed — lets the mobile drawer close. */
  onNavigate?: () => void
}) {
  const t = useT()
  // The scope the new-dashboard dialog opens on, or null while closed — the
  // empty team group's create-first row opens it pre-scoped to team.
  const [creating, setCreating] = useState<BoardScope | null>(null)

  return (
    <div className="flex h-full flex-col">
      {/* Brand row, exactly the board toolbar's height (h-11 + border-b) so
          the top hairline runs unbroken across both columns. */}
      <div className="flex h-11 shrink-0 items-center border-b border-border-dim px-3">
        <Link
          to="/"
          aria-label="Bulletin"
          onClick={onNavigate}
          className="-mx-1 inline-flex items-center rounded-md px-1 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Wordmark className="text-sm" />
        </Link>
      </div>

      <nav
        aria-label={t("nav.boards")}
        className="flex-1 space-y-4 overflow-y-auto px-2 py-3"
      >
        <NavGroup label={t("switcher.personal")}>
          {personalDashboards.map((slug) => {
            const active = scope === "personal" && dashboardSlug === slug
            // Every personal board is deletable but the default — it backs `/`.
            return (
              <NavItem
                key={`personal:${slug}`}
                to={boardHref("personal", slug)}
                label={slug}
                active={active}
                onDelete={
                  onDeleteBoard && slug !== DEFAULT_DASHBOARD
                    ? () => onDeleteBoard("personal", slug)
                    : undefined
                }
                onNavigate={onNavigate}
              />
            )
          })}
        </NavGroup>

        {teamDashboards && (
          <NavGroup label={t("switcher.team")}>
            {teamDashboards.map((slug) => {
              const active = scope === "team" && dashboardSlug === slug
              return (
                <NavItem
                  key={`team:${slug}`}
                  to={boardHref("team", slug)}
                  label={slug}
                  active={active}
                  onDelete={
                    onDeleteBoard
                      ? () => onDeleteBoard("team", slug)
                      : undefined
                  }
                  onNavigate={onNavigate}
                />
              )
            })}
            {teamDashboards.length === 0 && (
              // The group's only child while the team repo has no boards: the
              // next action, sitting where the first board will. The plus takes
              // the rail-node slot the active dot uses, so it reads as "a board
              // goes here".
              <button
                type="button"
                onClick={() => setCreating("team")}
                className="relative flex w-full cursor-pointer items-center rounded-md py-1.5 pr-2.5 pl-6 text-left text-sm text-ink-dim transition-colors outline-none hover:bg-sidebar-accent/60 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Plus
                  aria-hidden
                  className="absolute top-1/2 left-[13px] size-3 -translate-x-1/2 -translate-y-1/2 text-ink-faint"
                />
                {t("team.emptyCta")}
              </button>
            )}
          </NavGroup>
        )}

        {/* Hairline setting the create action apart from the boards it makes —
            a peer of them, but a verb, not one of the nouns. */}
        <div className="mx-2.5 border-t border-border-dim" />

        <button
          type="button"
          onClick={() => setCreating(scope)}
          className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-ink-dim transition-colors outline-none hover:bg-sidebar-accent/60 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <LayoutGrid className="size-4 shrink-0 text-ink-faint" />
          {t("switcher.new")}
        </button>
      </nav>

      <div className="shrink-0 border-t border-border-dim p-2">
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
        defaultScope={creating ?? scope}
        canTeam={teamDashboards != null}
        takenSlugs={{
          personal: personalDashboards,
          team: teamDashboards ?? [],
        }}
      />
    </div>
  )
}

/**
 * A scope heading with its board list threaded on a single hairline spine — a
 * tree indent guide (1px, neutral), not a side-stripe: the rail descends from
 * under the heading and runs the height of the group, so the boards read as its
 * children rather than rows floating in space. The active board is an accent
 * node sitting on the rail (see {@link NavItem}).
 */
function NavGroup({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-1 px-2.5 font-mono text-xs font-medium text-ink-faint">
        {label}
      </div>
      <div className="relative flex flex-col gap-0.5">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-1 left-[13px] w-px bg-border-dim"
        />
        {children}
      </div>
    </div>
  )
}

/**
 * One board link, indented to hang off its group's rail. The leading slot is
 * pinned to the rail's x so the active accent dot reads as a node on the spine
 * ("you are here"); inactive rows leave the rail unbroken. Active also fills and
 * lifts to full ink.
 *
 * When `onDelete` is set (every deletable board — all but the personal default)
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
            ? "bg-sidebar-accent font-medium text-foreground"
            : "text-ink-dim hover:bg-sidebar-accent/60 hover:text-foreground",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute top-1/2 left-[13px] size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors",
            active ? "bg-primary" : "bg-transparent group-hover:bg-ink-faint",
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
