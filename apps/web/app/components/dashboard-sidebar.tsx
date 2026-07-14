import { useState } from "react"

import {
  FolderGit2,
  ListTodo,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react"

import { AccountMenu } from "./account-menu.tsx"
import { AddDataRepoDialog } from "./add-data-repo-dialog.tsx"
import { Wordmark } from "./logo.tsx"
import { NewDashboardDialog } from "./new-dashboard-dialog.tsx"
import { RepoGroupHeader } from "./repo-group-header.tsx"
import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { Link } from "~/components/ui/link"
import { Skeleton } from "~/components/ui/skeleton"
import { cn } from "~/lib/utils"
import type { SidebarData } from "../lib/dashboard.server.ts"
import { boardDraftKey, poolDraftKey } from "../lib/draft.ts"
import { useRailStatus } from "../lib/rail-status.ts"
import { boardHref, DEFAULT_DASHBOARD, routinesHref } from "../lib/repos.ts"
import { groupBoards } from "../lib/sidebar-sections.ts"
import { useT } from "../lib/i18n.tsx"

/**
 * The board navigation rail — brand, one group per discovered data repo
 * (ADR-0023, home first), a new-board affordance, and the account menu pinned
 * to the foot. Renders the same inner content in two hosts: the persistent
 * `<aside>` on wide viewports and the mobile drawer (`dashboard-shell.tsx`).
 * It carries no surface, width, or positioning of its own — the host owns the
 * border, background, collapse, and resize — so the two placements can't drift.
 *
 * The rail reads as three tiers (ADR-0023/0034): a repo heading anchored by its
 * own glyph (repo-group-header.tsx) and set in the board type size, its boards
 * threaded below on a hairline spine, and — one step deeper — the boards of any
 * named section, under a quiet sub-label. The heading leads by weight, glyph,
 * and full ink; the boards are quiet mono until active. Indent plus the spine
 * read them as the repo's children.
 *
 * Board switching lives in this always-visible list: every board is one click,
 * the active one reads from across the room, and "new dashboard" is a peer of
 * the boards it joins. Each group leads with its dashboards — the group IS its
 * boards — and the repo's routine pool (ADR-0025) closes the group as the
 * spine's terminal node: unmistakably inside the repo, but in a different voice
 * (a ledger glyph + sans label vs the boards' rest-quiet dots + mono names), so
 * it never poses as one of the boards.
 *
 * A repo group with no boards keeps a create-first row in place of the board
 * list — deleting the last board must not make the repo disappear from the app.
 *
 * Rows carry honest client-local state ({@link RowStateDot}): a yellow dot
 * trailing a name marks unsynced draft edits (boards and the pool alike), a
 * pulsing accent dot on the pool row marks a client-fired run in flight.
 * Both read straight from localStorage (rail-status.ts) — no server call,
 * and nothing decorative: no state, no dot.
 */
export function DashboardSidebar({
  activeRepo,
  dashboardSlug,
  routinesRepo = "",
  sidebar,
  login,
  displayName,
  onDeleteBoard,
  onRenameBoard,
  onNavigate,
}: {
  /** The active board's repo; "" on chrome pages (settings). */
  activeRepo: string
  dashboardSlug: string
  /** The repo whose routine pool view is active (ADR-0025), else "". */
  routinesRepo?: string
  /** null → still streaming in (ADR-0030): the board list renders its
      skeleton while the brand row and the foot stay put. */
  sidebar: SidebarData | null
  login: string
  displayName?: string | null
  /** Delete a board by repo+slug — the handler behind every board's per-board
      menu, so a board is actionable without first switching to it. Absent on
      chrome pages (no board actions there); the home default board is never
      offered a menu (it must always exist). */
  onDeleteBoard?: (repo: string, slug: string) => void
  /** Rename a board's display name — offered on every board, including each
      repo's default `main` (only delete is withheld there). The current name
      rides along so the dialog can prefill. Absent on chrome pages. */
  onRenameBoard?: (repo: string, slug: string, name: string | null) => void
  /** Fired when a board link is followed — lets the mobile drawer close. */
  onNavigate?: () => void
}) {
  const t = useT()
  // The repo the new-dashboard dialog opens on, or null while closed — an
  // empty group's create-first row opens it pre-targeted at that repo.
  const [creating, setCreating] = useState<string | null>(null)
  const [addingRepo, setAddingRepo] = useState(false)
  // Client-local state the rail can honestly mark rows with: unsynced drafts
  // per board / pool, in-flight client-fired runs per repo (rail-status.ts).
  const { drafts, running } = useRailStatus()

  const homeRepo = sidebar?.repos.find((repo) => repo.isHome)?.repo ?? ""

  return (
    <div className="flex h-full flex-col">
      {/* Brand row, exactly the board toolbar's height (h-11 + border-b) so
          the top hairline runs unbroken across both columns. */}
      <div className="flex h-11 shrink-0 items-center border-b border-border-dim px-3">
        <Link
          to="/"
          aria-label="Steward"
          onClick={onNavigate}
          className="-mx-1 inline-flex items-center rounded-md px-1 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Wordmark className="text-sm" />
        </Link>
      </div>

      <nav
        aria-label={t("nav.boards")}
        className="flex flex-1 flex-col overflow-y-auto px-2 py-3"
      >
        {sidebar === null ? (
          <RailSkeleton />
        ) : (
          <>
            <div className="space-y-4">
              {sidebar.repos.map((group) => (
                <NavGroup
                  key={group.repo}
                  header={<RepoGroupHeader group={group} />}
                  foot={
                    <PoolNavItem
                      to={routinesHref(group.repo)}
                      active={routinesRepo === group.repo}
                      running={running.has(group.repo)}
                      draft={drafts.has(poolDraftKey(group.repo))}
                      onNavigate={onNavigate}
                    />
                  }
                >
                  {/* Boards partition into their repo's sections (ADR-0034):
                      ungrouped lead unlabeled, then labeled sections in the
                      repo's authored order. A repo with no sections yields one
                      label-less section — the flat list. Rendered as a flat
                      child sequence (not nested wrappers) so the spine's one
                      geometry and the parent's row gap both hold; a section is a
                      quiet label followed by boards indented one step under it,
                      the extra indent (not a wrapper) carrying the nesting. */}
                  {groupBoards(group.dashboards, group.groups).flatMap(
                    (section, sectionIndex) => [
                      section.label != null && (
                        <SectionLabel
                          key={`section:${section.label}`}
                          first={sectionIndex === 0}
                        >
                          {section.label}
                        </SectionLabel>
                      ),
                      ...section.boards.map((board) => {
                        const active =
                          activeRepo === group.repo &&
                          dashboardSlug === board.slug
                        // Every repo's `main` is its default board (server-
                        // protected in all repos) — so no delete on any `main`.
                        // Rename is harmless (display name only), so every
                        // board gets it.
                        return (
                          <NavItem
                            key={`${group.repo}:${board.slug}`}
                            to={boardHref(group.repo, board.slug, homeRepo)}
                            label={board.name ?? board.slug}
                            active={active}
                            // A board inside a named section sits one indent
                            // deeper than an ungrouped one, nested under its
                            // label (ADR-0034).
                            indented={section.label != null}
                            draft={drafts.has(
                              boardDraftKey(group.repo, board.slug),
                            )}
                            onRename={
                              onRenameBoard
                                ? () =>
                                    onRenameBoard(
                                      group.repo,
                                      board.slug,
                                      board.name,
                                    )
                                : undefined
                            }
                            onDelete={
                              onDeleteBoard && board.slug !== DEFAULT_DASHBOARD
                                ? () => onDeleteBoard(group.repo, board.slug)
                                : undefined
                            }
                            onNavigate={onNavigate}
                          />
                        )
                      }),
                    ],
                  )}
                  {group.dashboards.length === 0 && (
                    // The group's only child while the repo has no boards: the
                    // next action, sitting where the first board will. The plus
                    // takes the marker-column slot a board's dot uses, so it
                    // reads as "a board goes here".
                    <RailAction
                      icon={Plus}
                      label={t("switcher.newHere")}
                      onClick={() => setCreating(group.repo)}
                    />
                  )}
                </NavGroup>
              ))}

              {/* Discovery degraded (search rate limit, GitHub flap): say quietly
              that groups may be missing rather than render a confident lie. */}
              {/* A prose sentence, so sans and ink-dim — mono is for
                  identifiers, and ink-faint never carries copy the user is
                  meant to read. */}
              {!sidebar.complete && (
                <p className="px-2.5 text-xs text-ink-dim">
                  {t("switcher.incomplete")}
                </p>
              )}
            </div>

            {/* New board — a create verb that belongs with the boards above, so it
            sits at the end of the list on the same marker/label column, set off
            by one hairline (a verb, not one of the nouns). The trailing space
            is empty scroll room, not a gap the actions float in. */}
            <div className="mt-2 space-y-2">
              <div className="border-t border-border-dim" />
              <RailAction
                icon={Plus}
                label={t("switcher.new")}
                onClick={() => setCreating(activeRepo || homeRepo)}
              />
            </div>
          </>
        )}
      </nav>

      {/* Foot: workspace-level actions live here, not adrift in the board list.
          "Add data repo" grows the rail itself (a new group), so it sits with
          the account — the other whole-workspace control — on a shared column
          keyed to the account avatar. */}
      {/* flex+gap, not space-y: the account menu is modal, so Base UI drops
          hidden focus-guard spans beside the trigger while it's open. space-y's
          sibling margins would count them and grow the foot 2px; gap ignores
          out-of-flow children, so the foot holds still. */}
      <div className="flex shrink-0 flex-col gap-0.5 border-t border-border-dim p-2">
        <button
          type="button"
          onClick={() => setAddingRepo(true)}
          className="flex w-full cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 text-sm text-ink-dim transition-colors outline-none hover:bg-sidebar-accent/60 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span
            aria-hidden
            className="flex size-6 shrink-0 items-center justify-center"
          >
            <FolderGit2 className="size-4 text-ink-faint" />
          </span>
          {t("switcher.addRepo")}
        </button>
        <AccountMenu
          login={login}
          displayName={displayName}
          block
          onNavigate={onNavigate}
        />
      </div>

      {/* Both create dialogs read the resolved rail (repo lists, taken
          slugs); their openers only render once it resolves, so `sidebar`
          is never null while either is open. */}
      {sidebar !== null && (
        <>
          <NewDashboardDialog
            open={creating !== null}
            onOpenChange={(open) => {
              if (!open) setCreating(null)
            }}
            repos={sidebar.repos.map((repo) => repo.repo)}
            defaultRepo={creating ?? activeRepo ?? homeRepo}
            homeRepo={homeRepo}
            takenSlugs={Object.fromEntries(
              sidebar.repos.map((repo) => [
                repo.repo,
                repo.dashboards.map((board) => board.slug),
              ]),
            )}
          />
          <AddDataRepoDialog
            open={addingRepo}
            onOpenChange={setAddingRepo}
            known={sidebar.repos.map((repo) => repo.repo)}
            onNavigate={onNavigate}
          />
        </>
      )}
    </div>
  )
}

/**
 * The board list while the sidebar streams in (ADR-0030): two ghost groups —
 * a heading bar over a couple of board rows on the group's indent — so
 * the rail's silhouette is already right and the resolved groups land without
 * a reflow. Purely decorative; the nav landmark itself stays labeled.
 */
function RailSkeleton() {
  return (
    <div aria-hidden className="space-y-4">
      {[3, 2].map((rows, group) => (
        <div key={group}>
          <div className="mb-2 px-2.5 py-1">
            <Skeleton className="h-2.5 w-24" />
          </div>
          <div className="flex flex-col gap-2 py-1 pl-6">
            {Array.from({ length: rows }, (_, row) => (
              <Skeleton
                key={row}
                className={row % 2 === 0 ? "h-3 w-24" : "h-3 w-16"}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * A create verb rendered on the board list's own grid: the icon sits centered
 * on the marker column (where a board's dot sits), the label on the
 * board-name column. Sharing that geometry is what keeps "new dashboard" and
 * the empty-group create-first row reading as peers of the boards they make,
 * not buttons floating on a different margin.
 */
function RailAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Plus
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex w-full cursor-pointer items-center rounded-md py-1.5 pr-2.5 pl-6 text-left text-sm text-ink-dim transition-colors outline-none hover:bg-sidebar-accent/60 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {/* 14px like the pool glyph — every marker-column icon shares one size,
          so nothing outdents past the group headings. */}
      <Icon
        aria-hidden
        className="absolute top-1/2 left-[13px] size-3.5 -translate-x-1/2 -translate-y-1/2 text-ink-faint"
      />
      {label}
    </button>
  )
}

/**
 * A dashboard section's sub-heading (ADR-0034) — one tier below the repo
 * heading, set off by size, weight, and indent: the repo heading is 15px
 * full-ink with its own glyph, while this is 13px `ink-dim` medium (navigational
 * text the user reads to steer — it must clear AA at this size, so not the
 * ≥3:1 `ink-faint` metadata role), a quiet sub-label sitting at the board-name
 * column with its own boards indented one step under it. A generous gap opens
 * above each section (tight within a section, air between them) except the
 * first, which tucks straight under the repo heading. The label is the viewer's
 * own words (a display label, ADR-0026), so it's sans and verbatim — truncated,
 * never wrapped, to keep the rail one row per line.
 */
function SectionLabel({
  children,
  first,
}: {
  children: React.ReactNode
  /** The section leads the group (no ungrouped boards above it): drop the top
      gap so it sits directly under the repo heading. */
  first?: boolean
}) {
  return (
    <div
      data-testid="rail-section"
      className={cn(
        "truncate pr-2.5 pl-6 text-xs font-medium text-ink-dim",
        !first && "mt-3",
      )}
    >
      {children}
    </div>
  )
}

/**
 * A repo heading over its board list, the boards threaded on a single hairline
 * spine — a tree indent guide (1px, neutral), not a side-stripe. The spine
 * descends from under the repo heading's own glyph (repo-group-header.tsx),
 * which roots it, and runs the height of the list, so the boards read as the
 * repo's children rather than rows floating in space. Inactive boards leave the
 * spine unbroken; the active board is an accent dot sitting on it, "you are
 * here" (see {@link NavItem}). The routine pool is the spine's terminal node:
 * the line runs down through the boards and ends at its ledger glyph ({@link
 * PoolNavItem}), so the group is closed by its fixed view instead of leaving it
 * adrift below. Boards inside a named section hang one indent deeper, off the
 * same spine.
 */
function NavGroup({
  header,
  foot,
  children,
}: {
  header: React.ReactNode
  /** The group's terminal entry on the spine — the routine pool link
      (ADR-0025). A peer view of the boards but a different kind, so it sits
      last, in its own voice, never as the first "board". */
  foot?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div>
      {header}
      <div className="relative flex flex-col gap-0.5">
        {/* bottom-6, not inset-y-1: the spine ends at the top edge of the pool
            row's ledger glyph (last row 32px tall, 14px glyph on its center),
            leading into the terminal node instead of striking through the
            icon's transparent strokes. It starts below the header, descending
            from the repo glyph that roots it. */}
        <span
          aria-hidden
          className="pointer-events-none absolute top-1 bottom-6 left-[13px] w-px bg-border-dim"
        />
        {children}
        {foot}
      </div>
    </div>
  )
}

/**
 * A repo's routine pool link (ADR-0025) — a peer of its boards but a different
 * kind: it lists what runs, not a grid. It closes the group as the spine's
 * terminal node, on the boards' own marker/label columns — a ledger glyph in
 * the marker slot where boards carry a dot, sized into the marker column (14px,
 * not the 16px that outdented past the group heading and made the row read
 * top-level). What separates it from the boards is kind: the glyph rests visible
 * where board dots rest invisible (the fixed view is furniture; boards are
 * content), and the label is sans where board names are mono, with a hair of
 * extra space setting it off. Active, it lights the same accent-tinted selection
 * as an active board, glyph in accent — the same "you are here" node an active
 * board's dot is.
 */
function PoolNavItem({
  to,
  active,
  running,
  draft,
  onNavigate,
}: {
  to: string
  active: boolean
  /** A client-fired run is in flight somewhere in this repo's pool
      (rail-status.ts) — runs belong to the pool, so this is their honest row. */
  running?: boolean
  /** The pool view holds unsynced routine edits (its own draft, ADR-0025). */
  draft?: boolean
  onNavigate?: () => void
}) {
  const t = useT()
  return (
    <Link
      to={to}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative mt-1 flex items-center rounded-md py-1.5 pr-2.5 pl-6 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        active
          ? "bg-primary/10 font-medium text-foreground"
          : "text-ink-dim hover:bg-sidebar-accent/60 hover:text-foreground",
      )}
    >
      <ListTodo
        aria-hidden
        className={cn(
          "absolute top-1/2 left-[13px] size-3.5 -translate-x-1/2 -translate-y-1/2 transition-colors",
          active ? "text-primary" : "text-ink-faint",
        )}
      />
      {t("nav.routines")}
      {(running || draft) && (
        <span className="ml-2 flex shrink-0 items-center gap-1.5">
          {running && (
            <RowStateDot tone="running" label={t("nav.runInFlight")} />
          )}
          {draft && <RowStateDot tone="draft" label={t("nav.unsynced")} />}
        </span>
      )}
    </Link>
  )
}

/**
 * A rail row's state marker — the routines ledger's StateDot vocabulary
 * (accent = running, yellow = unsynced) shrunk to the rail's whisper: one
 * 6px dot trailing the row's name, exactly the header chip's unsynced dot.
 * It trails the label rather than riding the spine's marker column, so the
 * spine keeps its one meaning ("you are here") and the marker survives every row
 * state (active, hover) without negotiation. Never color alone:
 * the sr-only label names the state for readers, and the two tones also
 * differ in motion (running pulses; honors reduced motion by resting solid).
 */
function RowStateDot({
  tone,
  label,
}: {
  tone: "running" | "draft"
  label: string
}) {
  return (
    <>
      <span
        aria-hidden
        data-testid={`rail-${tone}`}
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          tone === "running"
            ? "animate-pulse bg-primary motion-reduce:animate-none"
            : "bg-yellow",
        )}
      />
      <span className="sr-only">, {label}</span>
    </>
  )
}

/**
 * One board link, indented to hang off its group's spine. The leading slot is
 * pinned to the spine's x so the active accent dot reads as a node on it ("you
 * are here"); inactive rows leave the spine unbroken, and the dot warms to a
 * faint fill on hover. Active also fills the dot to accent and lifts the name to
 * full ink. A board inside a named section (`indented`) hangs one step deeper,
 * its dot on a second column just right of the spine — the extra indent is what
 * nests it under its section label (ADR-0034).
 *
 * When `onRename`/`onDelete` are set the row carries a trailing `⋯` menu:
 * board-lifecycle actions live here, beside the board they act on, so any board
 * is actionable without switching to it first. Rename is offered on every
 * board; delete is withheld from each repo's default `main`. The menu rests
 * quiet — a faint glyph, no hover gate — and brightens as
 * the pointer nears (row, then button): present enough to find, dim enough to
 * recede against the board names. The Link is a sibling of the menu button
 * (never its parent) so no interactive control nests inside the anchor.
 */
function NavItem({
  to,
  label,
  active,
  indented,
  draft,
  onRename,
  onDelete,
  onNavigate,
}: {
  to: string
  label: string
  active: boolean
  /** This board sits inside a named section, so it hangs one indent deeper
      than an ungrouped board — nested under its section label (ADR-0034). */
  indented?: boolean
  /** This board holds unsynced edits (a localStorage draft, ADR-0003) — it
      carries the header chip's yellow dot, trailing the name
      ({@link RowStateDot}), so unsynced work is visible without switching
      to the board. */
  draft?: boolean
  onRename?: () => void
  onDelete?: () => void
  onNavigate?: () => void
}) {
  const t = useT()
  const hasMenu = onRename != null || onDelete != null
  return (
    <div className="group/nav relative flex items-center">
      <Link
        to={to}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group relative flex min-w-0 flex-1 items-center rounded-md py-1.5 pr-2.5 font-mono text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          indented ? "pl-10" : "pl-6",
          hasMenu && "pr-8",
          active
            ? "bg-primary/10 font-medium text-foreground"
            : "text-ink-dim hover:bg-sidebar-accent/60 hover:text-foreground",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-all",
            indented ? "left-[29px]" : "left-[13px]",
            active
              ? "size-2 bg-primary"
              : "size-1.5 bg-transparent group-hover:bg-ink-faint",
          )}
        />
        <span className="truncate">{label}</span>
        {draft && (
          <span className="ml-2 flex shrink-0 items-center">
            <RowStateDot tone="draft" label={t("nav.unsynced")} />
          </span>
        )}
      </Link>
      {hasMenu && (
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
            {onRename && (
              <DropdownMenuItem onClick={onRename}>
                <Pencil />
                {t("board.editDashboard")}
              </DropdownMenuItem>
            )}
            {onDelete && (
              <DropdownMenuItem variant="destructive" onClick={onDelete}>
                <Trash2 />
                {t("board.deleteDashboard")}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
