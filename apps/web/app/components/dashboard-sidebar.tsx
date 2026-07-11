import { useState } from "react"

import { Plus } from "lucide-react"

import { AccountMenu } from "./account-menu.tsx"
import { Wordmark } from "./logo.tsx"
import { NewDashboardDialog } from "./new-dashboard-dialog.tsx"
import { Link } from "~/components/ui/link"
import { cn } from "~/lib/utils"
import { type BoardScope, boardHref } from "../lib/board.ts"
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
 */
export function DashboardSidebar({
  dataRepo,
  scope,
  dashboardSlug,
  personalDashboards,
  teamDashboards,
  login,
  displayName,
  onNavigate,
}: {
  dataRepo: string
  scope: BoardScope
  dashboardSlug: string
  personalDashboards: string[]
  teamDashboards: string[] | null
  login: string
  displayName?: string | null
  /** Fired when a board link is followed — lets the mobile drawer close. */
  onNavigate?: () => void
}) {
  const t = useT()
  const [creating, setCreating] = useState(false)

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
          {personalDashboards.map((slug) => (
            <NavItem
              key={`personal:${slug}`}
              to={boardHref("personal", slug)}
              label={slug}
              active={scope === "personal" && dashboardSlug === slug}
              onNavigate={onNavigate}
            />
          ))}
        </NavGroup>

        {teamDashboards && (
          <NavGroup label={t("switcher.team")}>
            {teamDashboards.map((slug) => (
              <NavItem
                key={`team:${slug}`}
                to={boardHref("team", slug)}
                label={slug}
                active={scope === "team" && dashboardSlug === slug}
                onNavigate={onNavigate}
              />
            ))}
          </NavGroup>
        )}

        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-ink-dim transition-colors outline-none hover:bg-sidebar-accent/60 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="flex size-4 shrink-0 items-center justify-center">
            <Plus className="size-3.5" />
          </span>
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
        open={creating}
        onOpenChange={setCreating}
        defaultScope={scope}
        canTeam={teamDashboards != null}
        takenSlugs={{
          personal: personalDashboards,
          team: teamDashboards ?? [],
        }}
      />
    </div>
  )
}

/** A scope heading over its board list — muted, Sentence case, mono. */
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
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  )
}

/**
 * One board link. Every row reserves a fixed leading slot so labels align
 * whether the row shows the active accent dot, nothing, or (the New-dashboard
 * peer) a plus — never a side-stripe. Active also fills and lifts to full ink.
 */
function NavItem({
  to,
  label,
  active,
  onNavigate,
}: {
  to: string
  label: string
  active: boolean
  onNavigate?: () => void
}) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2 rounded-md px-2.5 py-1.5 font-mono text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        active
          ? "bg-sidebar-accent font-medium text-foreground"
          : "text-ink-dim hover:bg-sidebar-accent/60 hover:text-foreground",
      )}
    >
      <span className="flex size-4 shrink-0 items-center justify-center">
        <span
          aria-hidden
          className={cn(
            "size-1.5 rounded-full",
            active ? "bg-primary" : "bg-transparent",
          )}
        />
      </span>
      <span className="truncate">{label}</span>
    </Link>
  )
}
