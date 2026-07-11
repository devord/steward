import { useSubmit } from "react-router"

import { ChevronsUpDown, ExternalLink, LogOut, Settings } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { Link } from "~/components/ui/link"
import { cn } from "~/lib/utils"
import { useT } from "../lib/i18n.tsx"

/** Two-letter monogram fallback: initials of a real name, else the login. */
function initialsFor(name: string | null | undefined, login: string): string {
  const source = name?.trim() || login
  const parts = source.split(/\s+/).filter(Boolean)
  const letters =
    parts.length > 1
      ? parts[0][0] + parts[parts.length - 1][0]
      : source.slice(0, 2)
  return letters.toUpperCase()
}

/**
 * The account menu — a GitHub-avatar pill that opens the account-scoped
 * actions that were previously loose in the header: settings, a link out to
 * the data repo, and sign-out. Consolidating them here (the top-right
 * convention) demotes sign-out from a peer of the board actions to where
 * exit actions belong, and gives the signed-in identity a real affordance.
 *
 * Identity reads as the person, not the handle: the pill and menu header
 * show the GitHub display name (sans) when we have it, with the `@login`
 * (mono, an identifier) as the secondary line. Older sessions with no stored
 * name fall back to the login alone.
 *
 * One component, two shapes: `block` fills the sidebar footer row (identity
 * grows, chevron pins right); the default compact pill sits inline in the
 * pre-board top bars. Sign-out posts to the same `/auth/logout` action.
 */
export function AccountMenu({
  login,
  displayName,
  dataRepo,
  block = false,
  onNavigate,
  className,
}: {
  login: string
  /** GitHub display name; null/absent on older sessions → login only. */
  displayName?: string | null
  /** owner/repo — shows the "View data repo" item when present. */
  dataRepo?: string
  /** Full-width sidebar-footer shape vs. the compact inline pill. */
  block?: boolean
  /** Called when a menu item navigates — lets the mobile drawer close. */
  onNavigate?: () => void
  className?: string
}) {
  const t = useT()
  const submit = useSubmit()
  const name = displayName?.trim() || null
  const primary = name ?? login
  const initials = initialsFor(name, login)
  const avatarSrc = `https://github.com/${login}.png?size=80`

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("account.menu")}
        className={cn(
          "flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm text-ink-dim outline-none transition-colors hover:bg-sidebar-accent/60 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-sidebar-accent aria-expanded:text-foreground",
          block && "w-full",
          className,
        )}
      >
        <Avatar size="sm">
          <AvatarImage src={avatarSrc} alt="" />
          <AvatarFallback className="text-[0.625rem] font-medium">
            {initials}
          </AvatarFallback>
        </Avatar>
        <span
          className={cn(
            "truncate text-left",
            // A real name is prose (sans); a bare login is an identifier (mono).
            name ? "font-sans" : "font-mono",
            block ? "flex-1" : "max-w-[16ch]",
          )}
        >
          {primary}
        </span>
        <ChevronsUpDown className="ml-auto size-3.5 shrink-0 text-ink-faint" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={6} className="w-60">
        {/* Identity header — not an action, so a plain row. Carries the full
            "which account am I acting as" answer (ADR-0004): name over @login. */}
        <div className="flex items-center gap-2.5 px-1.5 py-1.5">
          <Avatar size="default">
            <AvatarImage src={avatarSrc} alt="" />
            <AvatarFallback className="text-xs font-medium">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">
              {primary}
            </div>
            <div className="truncate font-mono text-xs text-ink-faint">
              {name ? `@${login}` : t("account.githubAccount")}
            </div>
          </div>
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem render={<Link to="/settings" onClick={onNavigate} />}>
          <Settings />
          {t("header.settings")}
        </DropdownMenuItem>
        {dataRepo && (
          <DropdownMenuItem
            render={
              <a
                href={`https://github.com/${dataRepo}`}
                target="_blank"
                rel="noreferrer"
              />
            }
          >
            <ExternalLink />
            {t("account.viewRepo")}
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          variant="destructive"
          onClick={() =>
            void submit(null, { method: "post", action: "/auth/logout" })
          }
        >
          <LogOut />
          {t("header.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
