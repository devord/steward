import { useSubmit } from "react-router"

import { ChevronsUpDown, LogOut, Settings } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioTile,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { Link } from "~/components/ui/link"
import { cn } from "~/lib/utils"
import { APPEARANCE_MODES } from "../lib/appearance-modes.ts"
import { useAppearance } from "../lib/use-appearance.ts"
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
 * actions that were previously loose in the header: settings, the quick
 * appearance-mode row, and sign-out.
 * Consolidating them here (the top-right convention) demotes sign-out from a
 * peer of the board actions to where exit actions belong, and gives the
 * signed-in identity a real affordance. Strictly account-scoped: repo links
 * live on each rail group's header (ADR-0026), where the repo is.
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
/**
 * The account menu's quick mode row: the settings mode control's three
 * choices as icon tiles beside their label, one menu row tall. Real menu
 * radio items (arrow keys walk them, `menuitemradio` semantics), and
 * selecting keeps the menu open so the board re-themes in place — the
 * device preference the landing toggle and /settings write (theme pairing
 * stays on /settings; this row is only the mode).
 */
function ModeRow() {
  const t = useT()
  const [prefs, update] = useAppearance()
  return (
    <DropdownMenuRadioGroup
      aria-label={t("settings.mode")}
      value={prefs.mode}
      onValueChange={(value) => {
        const next = APPEARANCE_MODES.find(({ mode }) => mode === value)
        if (next) update({ mode: next.mode })
      }}
      className="flex items-center gap-0.5 px-1.5 py-1"
    >
      <span aria-hidden className="flex-1 text-sm text-ink-dim">
        {t("settings.mode")}
      </span>
      {APPEARANCE_MODES.map(({ mode, Icon, labelKey }) => (
        <DropdownMenuRadioTile
          key={mode}
          value={mode}
          aria-label={t(labelKey)}
          title={t(labelKey)}
        >
          <Icon aria-hidden className="size-3.5" />
        </DropdownMenuRadioTile>
      ))}
    </DropdownMenuRadioGroup>
  )
}

export function AccountMenu({
  login,
  displayName,
  block = false,
  onNavigate,
  className,
}: {
  login: string
  /** GitHub display name; null/absent on older sessions → login only. */
  displayName?: string | null
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
          "flex cursor-pointer items-center rounded-md text-sm text-ink-dim outline-none transition-colors hover:bg-sidebar-accent/60 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-sidebar-accent aria-expanded:text-foreground",
          // Block fills the rail foot and hangs the avatar on the marker spine
          // (the boards' `left-[13px]` glyph column) so it lines up with every
          // rail glyph above it. pl-7 (the foot tier's wider label column, one
          // notch past the nav's pl-6): the 20px avatar is wider than the 14px
          // glyphs, so the name needs the extra step to clear it. The compact
          // pill packs tight for the top bar.
          block ? "relative w-full py-1.5 pr-2.5 pl-7" : "gap-2 px-1.5 py-1",
          className,
        )}
      >
        <Avatar
          size={block ? "xs" : "sm"}
          className={cn(
            block &&
              "absolute top-1/2 left-[13px] -translate-x-1/2 -translate-y-1/2",
          )}
        >
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

        <DropdownMenuSeparator />

        <ModeRow />

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
