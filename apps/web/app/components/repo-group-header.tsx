import { ExternalLink, Globe, Lock } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "~/components/ui/popover"
import { cn } from "~/lib/utils"
import type { SidebarRepo } from "../lib/dashboard.server.ts"
import { useT } from "../lib/i18n.tsx"

/** Collaborators listed in the popover before collapsing into "+n". */
const MAX_LISTED = 12

/**
 * A rail group's identity row (ADR-0023): the repo name in the group-heading
 * voice, and — when there is anything to disclose — a quiet visibility glyph
 * plus collaborator count that opens an access popover: the full repo slug,
 * visibility in words, who has access at a readable size, and a jump to
 * GitHub — access settings for admins, the repo page otherwise. Indicators
 * and a link out, never a management surface: GitHub's own sharing screen is
 * the source of truth, this row just keeps the board honest about where its
 * data lives and who can see it.
 *
 * The rail itself stays two glyphs wide at most — the name owns the row; the
 * people moved into the popover where 20px avatars and logins actually read.
 *
 * Everything degrades to less, quietly: unlistable collaborators (plain
 * readers get a 403) drop the count and the popover's list, unknown
 * visibility drops the glyph and the visibility line. With nothing to
 * disclose at all, the popover gives way to the bare hover-revealed GitHub
 * link — the home group usually reads as the plain heading it always was.
 */
export function RepoGroupHeader({ group }: { group: SidebarRepo }) {
  const t = useT()
  const collaborators = group.collaborators ?? []
  // A count of one is noise — you know you have access; people appear only
  // when the repo is actually shared with someone.
  const shared = collaborators.length > 1
  const listed = collaborators.slice(0, MAX_LISTED)
  const overflow = collaborators.length - listed.length

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
      {/* Visibility must survive without the glyph for assistive tech. */}
      {group.private != null && (
        <span className="sr-only">
          {group.private ? t("repo.private") : t("repo.public")}
        </span>
      )}

      <span className="ml-auto flex shrink-0 items-center">
        {group.private != null || shared ? (
          <Popover>
            <PopoverTrigger
              aria-label={t("repo.access", { repo: group.repo })}
              className={cn(
                "flex h-5 cursor-pointer items-center gap-1 rounded-sm px-1 text-ink-faint transition-colors outline-none",
                "hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
                "aria-expanded:bg-sidebar-accent aria-expanded:text-foreground",
              )}
            >
              {group.private != null &&
                (group.private ? (
                  <Lock
                    aria-hidden
                    className="size-3 shrink-0"
                    data-testid="repo-private"
                  />
                ) : (
                  <Globe
                    aria-hidden
                    className="size-3 shrink-0"
                    data-testid="repo-public"
                  />
                ))}
              {shared && (
                <span className="font-mono text-xs">
                  {collaborators.length}
                </span>
              )}
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={4}
              className="w-64 gap-0 p-0"
            >
              <PopoverHeader className="px-3 py-2.5">
                <PopoverTitle className="font-mono text-xs font-medium break-all">
                  {group.repo}
                </PopoverTitle>
                {group.private != null && (
                  <PopoverDescription className="text-xs">
                    {group.private
                      ? t("repo.privateDetail")
                      : t("repo.publicDetail")}
                  </PopoverDescription>
                )}
              </PopoverHeader>
              {shared && (
                <ul
                  aria-label={t("repo.collaborators", {
                    n: collaborators.length,
                    repo: group.repo,
                  })}
                  className="flex flex-col gap-1.5 border-t border-border-dim px-3 py-2.5"
                >
                  {listed.map((person) => (
                    <li key={person.login} className="flex items-center gap-2">
                      <Avatar size="sm" className="size-5">
                        <AvatarImage src={person.avatarUrl} alt="" />
                        <AvatarFallback className="text-[9px]">
                          {person.login.slice(0, 1).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate font-mono text-xs text-ink-dim">
                        {person.login}
                      </span>
                    </li>
                  ))}
                  {overflow > 0 && (
                    <li className="pl-7 font-mono text-xs text-ink-faint">
                      {t("repo.moreCollaborators", { n: overflow })}
                    </li>
                  )}
                </ul>
              )}
              <a
                href={gitHubHref}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  "flex items-center gap-2 rounded-b-lg border-t border-border-dim px-3 py-2 text-xs text-ink-dim transition-colors outline-none",
                  "hover:bg-sidebar-accent/60 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
                )}
              >
                <ExternalLink aria-hidden className="size-3 text-ink-faint" />
                {group.viewerIsAdmin
                  ? t("repo.manageOnGitHub")
                  : t("repo.openOnGitHub")}
              </a>
            </PopoverContent>
          </Popover>
        ) : (
          // Nothing to disclose (metadata fully degraded): keep the bare jump
          // to GitHub. Rests invisible so the heading stays a heading; focus
          // and coarse pointers always reveal it.
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
        )}
      </span>
    </div>
  )
}
