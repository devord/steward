import { ExternalLink, Globe, Lock } from "lucide-react"

import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarImage,
} from "~/components/ui/avatar"
import { cn } from "~/lib/utils"
import type { SidebarRepo } from "../lib/dashboard.server.ts"
import { useT } from "../lib/i18n.tsx"

/** Avatars shown before the stack collapses into a "+n" count. */
const MAX_AVATARS = 3

/**
 * A rail group's identity row (ADR-0023): the repo name in the group-heading
 * voice, a lock/globe visibility glyph, who has access as a tight avatar
 * stack, and a hover-revealed jump to GitHub — access settings for admins,
 * the repo page otherwise. Indicators and a link out, never a management
 * surface: GitHub's own sharing screen is the source of truth, this row just
 * keeps the board honest about where its data lives and who can see it.
 *
 * Everything degrades to less, quietly: unknown visibility drops the glyph,
 * unlistable collaborators (plain readers get a 403) drop the stack, a solo
 * private repo shows just its name — the home group usually reads as the
 * plain heading it always was.
 */
export function RepoGroupHeader({ group }: { group: SidebarRepo }) {
  const t = useT()
  const collaborators = group.collaborators ?? []
  // A stack of one is noise — you know you have access; show people only
  // when the repo is actually shared with someone.
  const showStack = collaborators.length > 1
  const shown = collaborators.slice(0, MAX_AVATARS)
  const overflow = collaborators.length - shown.length

  const gitHubHref = group.viewerIsAdmin
    ? `https://github.com/${group.repo}/settings/access`
    : `https://github.com/${group.repo}`
  const gitHubLabel = group.viewerIsAdmin
    ? t("repo.manageAccess", { repo: group.repo })
    : t("repo.viewOnGitHub", { repo: group.repo })

  return (
    <div
      className="group/repo mb-1 flex h-5 items-center gap-1.5 pr-1 pl-2.5"
      title={group.repo}
    >
      <span className="truncate font-mono text-xs font-medium text-ink-faint">
        {group.isHome ? t("switcher.personal") : group.name}
      </span>
      {group.private != null &&
        (group.private ? (
          <Lock
            aria-hidden
            className="size-3 shrink-0 text-ink-faint"
            data-testid="repo-private"
          />
        ) : (
          <Globe
            aria-hidden
            className="size-3 shrink-0 text-ink-faint"
            data-testid="repo-public"
          />
        ))}
      {/* Visibility must survive without the glyph for assistive tech. */}
      {group.private != null && (
        <span className="sr-only">
          {group.private ? t("repo.private") : t("repo.public")}
        </span>
      )}

      <span className="ml-auto flex shrink-0 items-center gap-1">
        {showStack && (
          <AvatarGroup
            className="-space-x-1"
            aria-label={t("repo.collaborators", {
              n: collaborators.length,
              repo: group.repo,
            })}
          >
            {shown.map((person) => (
              <Avatar key={person.login} size="sm" className="size-4">
                <AvatarImage src={person.avatarUrl} alt="" />
                <AvatarFallback className="text-[8px]">
                  {person.login.slice(0, 1).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            ))}
            {overflow > 0 && (
              <span className="relative z-10 font-mono text-xs text-ink-faint">
                +{overflow}
              </span>
            )}
          </AvatarGroup>
        )}
        {/* Rests invisible so the heading stays a heading; surfaces with the
            group like the per-board ⋯ menu. Focus always reveals it. */}
        <a
          href={gitHubHref}
          target="_blank"
          rel="noreferrer"
          aria-label={gitHubLabel}
          title={gitHubLabel}
          className={cn(
            "flex size-5 items-center justify-center rounded-sm text-ink-faint opacity-0 transition-opacity outline-none",
            "group-hover/repo:opacity-100 focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:opacity-100",
            "hover:bg-sidebar-accent hover:text-foreground",
          )}
        >
          <ExternalLink aria-hidden className="size-3" />
        </a>
      </span>
    </div>
  )
}
