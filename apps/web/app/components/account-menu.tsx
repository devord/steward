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

/**
 * The account menu — a GitHub-avatar pill that opens the account-scoped
 * actions that were previously loose in the header: settings, a link out to
 * the data repo, and sign-out. Consolidating them here (the top-right
 * convention) demotes sign-out from a peer of the board actions to where
 * exit actions belong, and finally gives the signed-in identity a real
 * affordance instead of dead text.
 *
 * One component, two shapes: `block` fills the sidebar footer row (login
 * grows, chevron pins right); the default compact pill sits inline in the
 * pre-board top bars. Sign-out posts to the same `/auth/logout` action the
 * old form did — no client session to clear.
 */
export function AccountMenu({
  login,
  dataRepo,
  block = false,
  onNavigate,
  className,
}: {
  login: string
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
  const initials = login.slice(0, 2)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("account.menu")}
        className={cn(
          "flex items-center gap-2 rounded-md px-1.5 py-1 font-mono text-xs text-ink-dim outline-none transition-colors hover:bg-sidebar-accent/60 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-sidebar-accent aria-expanded:text-foreground",
          block && "w-full",
          className,
        )}
      >
        <Avatar size="sm">
          <AvatarImage src={`https://github.com/${login}.png?size=64`} alt="" />
          <AvatarFallback className="font-mono lowercase">
            {initials}
          </AvatarFallback>
        </Avatar>
        <span
          className={cn(
            "truncate text-left",
            block ? "flex-1" : "max-w-[16ch]",
          )}
        >
          {login}
        </span>
        <ChevronsUpDown className="ml-auto size-3 shrink-0 text-ink-faint" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={6} className="w-56">
        {/* Identity header — not an action, so a plain row rather than a
            menu item; the pill only had room for the login, this carries the
            "which account am I acting as" answer in full (ADR-0004). */}
        <div className="flex items-center gap-2 px-1.5 py-1.5">
          <Avatar size="sm">
            <AvatarImage
              src={`https://github.com/${login}.png?size=64`}
              alt=""
            />
            <AvatarFallback className="font-mono lowercase">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="truncate font-mono text-xs text-foreground">
              {login}
            </div>
            <div className="text-xs text-ink-faint">
              {t("account.githubAccount")}
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
