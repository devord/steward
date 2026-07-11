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
 * The board navigation rail — brand, the full list of boards grouped by
 * scope, a new-board affordance, and the account menu pinned to the foot.
 * Renders the same inner content in two hosts: the persistent `<aside>` on
 * wide viewports and the mobile drawer (`dashboard-shell.tsx`). It carries no
 * surface or positioning of its own — the host owns the border, background,
 * and scroll container — so the two placements can't drift.
 *
 * Board switching moved off the header's cramped `<select>` (ADR-0010) into
 * this always-visible list: every board is one click, the active one reads
 * from across the room, and "new dashboard" is a peer of the boards it joins.
 */
export function DashboardSidebar({
  dataRepo,
  scope,
  dashboardSlug,
  personalDashboards,
  teamDashboards,
  login,
  onNavigate,
}: {
  dataRepo: string
  scope: BoardScope
  dashboardSlug: string
  personalDashboards: string[]
  teamDashboards: string[] | null
  login: string
  /** Fired when a board link is followed — lets the mobile drawer close. */
  onNavigate?: () => void
}) {
  const t = useT()
  const [creating, setCreating] = useState(false)

  return (
    <div className="flex h-full flex-col">
      {/* Brand row, height-matched to the board toolbar so the top hairline
          runs unbroken across both columns (the divider is the only vertical
          seam). */}
      <div className="flex min-h-11 items-center border-b border-border-dim px-3 py-1.5">
        <Link
          to="/"
          aria-label="Bulletin"
          onClick={onNavigate}
          className="-mx-1 inline-flex items-center rounded-md px-1 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Wordmark className="text-sm" />
        </Link>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-2 py-3">
        {/* Repo attribution — the board's home on GitHub, captioning the
            boards it scopes. Full width here (it was hidden below md in the
            old header). */}
        <a
          href={`https://github.com/${dataRepo}`}
          target="_blank"
          rel="noreferrer"
          className="block truncate px-2 font-mono text-xs text-ink-faint transition-colors hover:text-ink-dim"
        >
          {dataRepo}
        </a>

        <nav aria-label={t("nav.boards")} className="space-y-3">
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
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-ink-dim transition-colors outline-none hover:bg-sidebar-accent/60 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Plus className="size-3.5 shrink-0" />
            {t("switcher.new")}
          </button>
        </nav>
      </div>

      <div className="border-t border-border-dim p-2">
        <AccountMenu
          login={login}
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

/** A scope heading over its board list — mono, muted, Sentence case. */
function NavGroup({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="px-2 pb-1 font-mono text-xs text-ink-faint">{label}</div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  )
}

/**
 * One board link. The active board carries an accent dot in a reserved
 * leading slot (never a side-stripe) and the full-ink label; the slot keeps
 * every row's text aligned whether or not the dot is lit.
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
        "flex items-center gap-2 rounded-md px-2 py-1.5 font-mono text-xs transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        active
          ? "bg-sidebar-accent text-foreground"
          : "text-ink-dim hover:bg-sidebar-accent/60 hover:text-foreground",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          active ? "bg-primary" : "bg-transparent",
        )}
      />
      <span className="truncate">{label}</span>
    </Link>
  )
}
