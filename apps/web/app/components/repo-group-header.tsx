import { useEffect, useId, useState } from "react"
import { useFetcher } from "react-router"

import { REPO_NAME_MAX } from "@steward/schema"

import {
  ExternalLink,
  FolderGit2,
  Globe,
  Lock,
  MoreHorizontal,
} from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
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
import type { RenameRepoResult } from "../routes/data-repos.ts"
import { useT } from "../lib/i18n.tsx"

/** Collaborators listed in the popover before collapsing into "+n". */
const MAX_LISTED = 12

/**
 * A rail group's identity row (ADR-0023): the repo's display name — its
 * data/repo.yaml `name`, else "Personal" / the short repo name (ADR-0026) —
 * in the group-heading voice, then two distinct trailing marks. A **quiet
 * visibility glyph plus collaborator count** is status, not a control: it
 * reads at a glance and never acts (a lock that secretly opened a menu was
 * the affordance lying about its job). Beside it, a **`⋯` control** opens the
 * access popover — the same status-vs-actions split, and the same `⋯` glyph,
 * the board rows already carry one line down, so the rail teaches the idiom
 * once. The popover holds the full repo slug, visibility in words, who has
 * access at a readable size, and a jump to GitHub — access settings for
 * admins, the repo page otherwise. For sharing, indicators and a link out
 * only: GitHub's own screen is the source of truth. The display name is the
 * one thing managed here, because it is ours — a commit to the repo's own
 * config, offered only to viewers who can push.
 *
 * The rail itself stays a status cluster plus one `⋯` wide — the name owns
 * the row; the people moved into the popover where 20px avatars and logins
 * actually read.
 *
 * Everything degrades to less, quietly: unlistable collaborators (plain
 * readers get a 403) drop the count and the popover's list, unknown
 * visibility drops the glyph and the visibility line. With nothing to
 * disclose at all (no status, no `⋯`), the row gives way to the bare
 * hover-revealed GitHub link — the home group then reads as just its leading
 * glyph and name, the trailing side bare.
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
      // pr-1.5, not pr-1: the ⋯ here is size-5 while the board rows' is
      // size-6 with right-1 — the extra 2px puts both glyphs' optical
      // centers on one column (the buttons are invisible at rest, so the
      // glyph, not the box edge, is what must align). On coarse pointers
      // both buttons take the icon-xs size-8 floor, so the 2px compensation
      // inverts: pr-1 matches the rows' right-1 exactly.
      // pl-6 (not pl-2.5): the name now clears a leading identity glyph pinned
      // to the marker column, so the heading joins the group's glyph column
      // (repo → boards → pool) and roots it — the name aligns with the board
      // names it heads, one tier up by weight and voice, not by outdent.
      className="group/repo relative mb-1 flex h-5 items-center gap-1.5 pr-1.5 pl-6 pointer-coarse:pr-1"
      title={group.repo}
    >
      {/* The repo tier's anchor (ADR-0023): a repo glyph on the marker column
          (left-[13px], the boards' own glyph x) that tops the group's glyph
          column and gives the top tier a left-edge presence the boards below
          already had. Rhymes with the foot's "Add data repo" glyph — that makes a
          new group; this marks each one. ink-dim, a step up from the faint
          board/pool glyphs, so the parent node reads slightly heavier than its
          children. */}
      <FolderGit2
        aria-hidden
        data-testid="repo-glyph"
        className="absolute top-1/2 left-[13px] size-3.5 -translate-x-1/2 -translate-y-1/2 text-ink-dim"
      />
      {/* foreground, not ink-dim: with N repos the group heading is the rail's
          primary structure, and at ink-dim it sat at the same brightness as the
          inactive boards and the section labels — three tiers at one value, the
          blur this pass fixes. Lifting it to full ink makes it the clear anchor
          (the 15px mono boards still hold weight by size). The trailing
          visibility glyphs stay faint (metadata, resting quiet). Voice follows
          the account menu's prose-vs-identifier rule: a display name (or
          "Personal") is prose — sans — separating the heading tier from the
          mono board slugs below; only the bare repo-name fallback keeps mono. */}
      <span
        className={cn(
          "truncate text-xs font-medium text-foreground",
          group.displayName != null || group.isHome ? "font-sans" : "font-mono",
        )}
      >
        {group.displayName ??
          (group.isHome ? t("switcher.personal") : group.name)}
      </span>

      <span className="ml-auto flex shrink-0 items-center gap-1">
        {/* Status, not a control: visibility and how many can see it, resting
            quiet. It reads at a glance and never acts — the actions live under
            the ⋯ beside it. Screen readers get the words; the glyph is the
            at-a-glance shorthand. */}
        {(group.private != null || shared) && (
          <span
            data-testid="repo-status"
            className="flex items-center gap-1 text-ink-faint"
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
              // Mono digits sit ~0.75px above the line box's center (the
              // baseline lands at (ascent−descent)/2, and digits have no
              // descender), so flexbox centering leaves the count riding
              // high against the glyph. Nudge it onto the optical center.
              <span className="translate-y-[0.75px] font-mono text-xs">
                {collaborators.length}
              </span>
            )}
            <span className="sr-only">
              {group.private != null &&
                (group.private ? t("repo.private") : t("repo.public"))}
              {shared &&
                ` — ${t("repo.collaborators", {
                  n: collaborators.length,
                  repo: group.repo,
                })}`}
            </span>
          </span>
        )}

        {group.private != null || shared || group.viewerCanPush ? (
          <Popover>
            {/* The board rows' ⋯ idiom (NavItem), shrunk to the heading's
                20px: same glyph, same faint-at-rest → brighten-as-the-pointer-
                nears → fill-when-open behavior. A real control, so the panel it
                opens (access, name, GitHub) is findable — where the lock alone
                only ever said "private". */}
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("repo.access", { repo: group.repo })}
                  className="size-5 text-ink-faint transition-colors group-hover/repo:text-ink-dim hover:bg-sidebar-accent hover:text-foreground focus-visible:text-foreground aria-expanded:bg-sidebar-accent aria-expanded:text-foreground"
                />
              }
            >
              <MoreHorizontal />
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
              {group.viewerCanPush && <RenameForm group={group} />}
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
              // size-8 on coarse: the same floor the ⋯ buttons get from
              // icon-xs, so this glyph holds their column and touch target.
              "flex size-5 items-center justify-center rounded-sm text-ink-faint opacity-0 transition-opacity outline-none pointer-coarse:size-8",
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

/**
 * The display-name editor (ADR-0026) — one labeled input in the access
 * popover, shown only to viewers who can push (saving is a commit to the
 * repo's data/repo.yaml, and GitHub's permissions are the real gate). Blank
 * falls back to the placeholder: the short repo name the group would carry
 * anyway. The typed draft stays local until the sidebar loader confirms the
 * committed value, so the input never flashes stale between commit and
 * revalidation.
 */
function RenameForm({ group }: { group: SidebarRepo }) {
  const t = useT()
  const inputId = useId()
  const fetcher = useFetcher<RenameRepoResult>()
  const committed = group.displayName ?? ""
  // null → no local edit: the input mirrors the committed name.
  const [draft, setDraft] = useState<string | null>(null)

  const busy = fetcher.state !== "idle"
  const value = draft ?? committed
  const dirty = draft != null && draft.trim() !== committed
  const failed = !busy && fetcher.data?.ok === false

  // Hand the input back to the committed value once the loader catches up
  // with what was saved — never before, so the draft covers the gap.
  useEffect(() => {
    if (fetcher.data?.ok && draft != null && draft.trim() === committed) {
      setDraft(null)
    }
  }, [fetcher.data, draft, committed])

  function save(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!dirty || busy) return
    void fetcher.submit(
      JSON.stringify({
        intent: "rename",
        repo: group.repo,
        name: value.trim(),
      }),
      { method: "post", action: "/data-repos", encType: "application/json" },
    )
  }

  return (
    <form onSubmit={save} className="border-t border-border-dim px-3 py-2.5">
      <label htmlFor={inputId} className="text-xs font-medium text-ink-dim">
        {t("repo.displayName")}
      </label>
      <div className="mt-1.5 flex items-center gap-1.5">
        <Input
          id={inputId}
          value={value}
          maxLength={REPO_NAME_MAX}
          placeholder={group.name}
          disabled={busy}
          onChange={(event) => setDraft(event.target.value)}
          className="h-7 flex-1"
        />
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          disabled={!dirty || busy}
        >
          {t("repo.saveName")}
        </Button>
      </div>
      {failed && (
        <p role="alert" className="mt-1.5 text-xs text-destructive">
          {t("repo.renameFailed")}
        </p>
      )}
    </form>
  )
}
