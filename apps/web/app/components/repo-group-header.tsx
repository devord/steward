import { useEffect, useId, useState } from "react"
import { useFetcher } from "react-router"

import { REPO_NAME_MAX } from "@steward/schema"

import {
  ExternalLink,
  FolderGit2,
  Globe,
  Lock,
  MoreHorizontal,
  Pencil,
  Users,
} from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
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
 * exposure glyph** is status, not a control: it reads at a glance and never
 * acts (a lock that secretly opened a menu was the affordance lying about
 * its job). One glyph on a private → shared → public ladder answers the only
 * at-a-glance question — who can see this: `Lock` (only you), `Users` (shared
 * with specific people), `Globe` (public, where "anyone can see it" subsumes
 * the count). The exact people — a bare "6" floats without a noun — leave the
 * rail for the popover, where avatars and logins actually read; the rail just
 * says how exposed the repo is. Beside it, a **`⋯` control** opens the
 * access popover — the same status-vs-actions split, and the same `⋯` glyph,
 * the board rows already carry one line down, so the rail teaches the idiom
 * once. The popover splits along the same seam as the rail's status-vs-actions
 * cluster: a **read-only disclosure** up top (the full repo slug, visibility in
 * words, who has access at a readable size) sits over an **actions** row — a
 * jump to GitHub for sharing (its own screen is the source of truth), and, for
 * viewers who can push, a **Rename repo** launcher. Renaming the display name is
 * the one thing managed here, because it is ours — a commit to the repo's own
 * config — but it is a *write*, so it opens a focused dialog ({@link
 * RenameRepoDialog}) the way a board's rename does, never an inline field
 * wedged inside the sharing panel.
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
  // The ⋯ popover's own open state, so picking "Rename repo" can close the
  // disclosure before the write dialog takes over the surface.
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const collaborators = group.collaborators ?? []
  // A count of one is noise — you know you have access; people appear only
  // when the repo is actually shared with someone.
  const shared = collaborators.length > 1
  const listed = collaborators.slice(0, MAX_LISTED)
  const overflow = collaborators.length - listed.length

  // The exposure ladder the rail glyph rides (private → shared → public).
  // Public wins outright — "anyone can see it" makes the collaborator count
  // moot; otherwise sharing (private, or visibility not yet known) reads as
  // people, and a solo private repo as the lock.
  // Screen readers get the words and the count the single glyph can't carry,
  // joined without a leading dash when the visibility word is absent.
  const visibilityWord =
    group.private == null
      ? null
      : group.private
        ? t("repo.private")
        : t("repo.public")
  const statusLabel = [
    visibilityWord,
    shared
      ? t("repo.collaborators", { n: collaborators.length, repo: group.repo })
      : null,
  ]
    .filter(Boolean)
    .join(" — ")

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
      // mb-0.5 (not mb-1): the caption hugs its content at the same 2px the
      // group's own gap-0.5 threads its boards, so the tier steps read as one
      // rhythm — the first section (or first board) tucks under the repo
      // exactly as a board tucks under its section, no wider seam at the top.
      className="group/repo relative mb-0.5 flex h-5 items-center gap-1.5 pr-1.5 pl-6 pointer-coarse:pr-1"
      title={group.repo}
    >
      {/* The repo tier's anchor (ADR-0023): a repo glyph on the marker column
          (left-[13px], the boards' own glyph x) that tops the group's spine and
          fronts the caption — the "icon · label · count" header idiom. size-3
          (12px) reads at the 11px caps' optical weight rather than looming over
          them. Rhymes with the foot's "Add data repo" glyph — that makes a new
          group; this marks each one. */}
      <FolderGit2
        aria-hidden
        data-testid="repo-glyph"
        className="absolute top-1/2 left-[13px] size-3 -translate-x-1/2 -translate-y-1/2 text-ink-faint"
      />
      {/* A caption, not a big heading: 11px semibold UPPERCASE, tracked, muted —
          the terminal section-header idiom (tmux/lazygit, and Flow's overview).
          Small reads as a deliberate caption *because* it's tracked caps with a
          glyph and a trailing count, not as a shrunk item; that lets the boards
          below be the bright, primary tier. ink-dim clears AA at this size (the
          user reads it to steer). Voice follows the account menu's prose-vs-
          identifier rule: a display name (or "Personal") is prose — sans — while
          only the bare repo-name fallback keeps mono. */}
      <span
        className={cn(
          "truncate text-[11px] font-semibold tracking-wider text-ink-dim uppercase",
          group.displayName != null || group.isHome ? "font-sans" : "font-mono",
        )}
      >
        {group.displayName ??
          (group.isHome ? t("switcher.personal") : group.name)}
      </span>

      <span className="ml-auto flex shrink-0 items-center gap-1">
        {/* Status, not a control: one exposure glyph on the private → shared →
            public ladder, resting quiet. It reads at a glance and never acts —
            the actions live under the ⋯ beside it. Screen readers get the
            words and the count; the glyph is the at-a-glance shorthand. */}
        {(group.private != null || shared) && (
          <span
            data-testid="repo-status"
            className="flex items-center text-ink-faint"
          >
            {group.private === false ? (
              <Globe
                aria-hidden
                className="size-3 shrink-0"
                data-testid="repo-public"
              />
            ) : shared ? (
              <Users
                aria-hidden
                className="size-3 shrink-0"
                data-testid="repo-shared"
              />
            ) : (
              <Lock
                aria-hidden
                className="size-3 shrink-0"
                data-testid="repo-private"
              />
            )}
            <span className="sr-only">{statusLabel}</span>
          </span>
        )}

        {group.private != null || shared || group.viewerCanPush ? (
          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            {/* The board rows' ⋯ idiom (NavItem), shrunk to the heading's
                20px: same glyph, same faint-at-rest → brighten-as-the-pointer-
                nears → fill-when-open behavior. A real control, so the panel it
                opens (access, rename, GitHub) is findable — where the lock alone
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
            {/* Sizes to the identifier it leads with, not a fixed step
                (DESIGN.md): at `w-64` a real `<org>/steward-data-<name>` slug
                wrapped to two lines, so the panel's own subject was the one
                string it couldn't show whole. Floor keeps the collaborator
                list from collapsing to avatar width; the cap keeps a
                pathological slug from turning the panel into a slab — past it
                the title's `overflow-wrap` still takes over. */}
            <PopoverContent
              align="end"
              sideOffset={4}
              className="w-auto min-w-64 max-w-[22rem] gap-0 p-0"
            >
              <PopoverHeader className="px-3 py-2.5">
                {/* overflow-wrap:anywhere, not break-all: the slug wraps at its
                    own `/` and hyphens rather than snapping mid-word (break-all
                    split "…-formfactory" into "for / mformfactory"). */}
                <PopoverTitle className="font-mono text-xs font-medium [overflow-wrap:anywhere]">
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
              {/* Actions, under the read-only disclosure: a write we own
                  (rename → a focused dialog, pushers only) and a jump to
                  GitHub's own screen for everything about sharing. */}
              {group.viewerCanPush && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    setRenaming(true)
                  }}
                  className={cn(
                    "flex items-center gap-2 border-t border-border-dim px-3 py-2 text-left text-xs text-ink-dim transition-colors outline-none",
                    "hover:bg-sidebar-accent/60 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
                  )}
                >
                  <Pencil aria-hidden className="size-3 text-ink-faint" />
                  {t("repo.rename")}
                </button>
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

      {group.viewerCanPush && (
        <RenameRepoDialog
          group={group}
          open={renaming}
          onClose={() => setRenaming(false)}
        />
      )}
    </div>
  )
}

/**
 * The display-name editor (ADR-0026), now a focused dialog launched from the
 * access popover — the same shape a board's rename takes ({@link
 * RenameDashboardDialog}), so the rail teaches one rename gesture instead of
 * an inline popover field for repos and a dialog for boards. Offered only to
 * viewers who can push (saving is a commit to the repo's data/repo.yaml, and
 * GitHub's permissions are the real gate). Blank falls back to the placeholder:
 * the short repo name the group would carry anyway. On a committed save the
 * dialog closes and the sidebar loader revalidation lands the new name; a stale
 * success from a prior rename can't auto-close a freshly reopened dialog
 * (`submitted` gates the close to this session's own write).
 */
function RenameRepoDialog({
  group,
  open,
  onClose,
}: {
  group: SidebarRepo
  open: boolean
  onClose: () => void
}) {
  const t = useT()
  const inputId = useId()
  const fetcher = useFetcher<RenameRepoResult>({
    key: `repo-rename:${group.repo}`,
  })
  const committed = group.displayName ?? ""
  const [name, setName] = useState(committed)
  // Prefill from the committed name each time the dialog opens, keyed on `open`
  // so a re-render's fresh props can't clobber what the user is typing.
  const [armed, setArmed] = useState(false)
  // Only this open session's own submit may auto-close on success — the fetcher
  // keeps its last result, so reopening must not fire an old {ok:true}.
  const [submitted, setSubmitted] = useState(false)
  if (open && !armed) {
    setArmed(true)
    setSubmitted(false)
    setName(committed)
  }
  if (!open && armed) setArmed(false)

  const busy = fetcher.state !== "idle"
  const failed = !busy && fetcher.data?.ok === false

  const renamed = fetcher.data?.ok === true
  useEffect(() => {
    if (renamed && submitted) onClose()
  }, [renamed, submitted, onClose])

  function submit() {
    if (busy) return
    setSubmitted(true)
    void fetcher.submit(
      JSON.stringify({
        intent: "rename",
        repo: group.repo,
        name: name.trim(),
      }),
      { method: "post", action: "/data-repos", encType: "application/json" },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("repo.renameTitle")}</DialogTitle>
          <DialogDescription>
            {t("repo.renameBody", { repo: group.repo })}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor={inputId}>{t("repo.displayName")}</Label>
          <Input
            id={inputId}
            autoFocus
            value={name}
            maxLength={REPO_NAME_MAX}
            placeholder={group.name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit()
            }}
          />
          <p className="text-xs text-ink-dim">
            {t("repo.renameHint", { name: group.name })}
          </p>
        </div>
        {failed && (
          <p role="alert" className="text-xs text-destructive">
            {t("repo.renameFailed")}
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t("dialog.cancel")}
          </Button>
          <Button disabled={busy} onClick={submit}>
            {busy ? t("repo.renaming") : t("repo.saveName")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
