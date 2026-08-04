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
import { cn, railCaptionCls } from "~/lib/utils"
import type { SidebarData } from "../lib/dashboard.server.ts"
import { boardDraftKey, poolDraftKey } from "../lib/draft.ts"
import { useRailStatus } from "../lib/rail-status.ts"
import { boardHref, DEFAULT_DASHBOARD, routinesHref } from "../lib/repos.ts"
import { sectionBoards } from "../lib/sidebar-sections.ts"
import { agoParts } from "../lib/time.ts"
import { useNow } from "../lib/use-now.ts"
import { useT } from "../lib/i18n.tsx"

/**
 * A navigable row (ADR-0058). The fill spans the rail edge to edge, square,
 * with no gap to its siblings — the file-tree read the brand already claims
 * (tmux/lazygit, and Flow's left nav). Radius signals elevation (DESIGN.md
 * § Shape) and a nav row does not float, so the old rounded pill inset in an
 * 8px margin was the wrong material; it also made a 44px touch row read as a
 * floating slab the moment the selection wash filled it.
 *
 * Only rows carry this. Captions never take a fill, which is what lets a
 * reader answer "is this a place I can go" by sweeping the pointer: the
 * things that light up are exactly the things that navigate.
 *
 * `rail-row` (app.css) supplies the vertical padding from the rail's rhythm
 * vars, so a coarse pointer grows the row and its boundaries together.
 * The focus ring is inset — the nav is a scroll container, so an outset ring
 * on a full-bleed row is clipped at both edges.
 */
const rowCls =
  "rail-row relative flex w-full items-center pl-8 text-left text-sm transition-colors outline-none focus-visible:inset-ring-3 focus-visible:inset-ring-ring/50"

/** The trailing inset a row needs to clear its own `⋯`, in both pointer
    modes (the trigger floors to size-8 on coarse). Rows without a menu keep
    the plain `pr-3`. */
const rowMenuPad = "pr-9 pointer-coarse:pr-11"

/**
 * The `⋯` trigger's rest state on rows and section captions (ADR-0058): it
 * holds its slot but not its ink. Nine visible menu glyphs down a 200px
 * column made the trailing edge the busiest thing in the rail, so the trigger
 * rests invisible and appears on row hover, on `focus-visible`, and while its
 * menu is open. `opacity`, never `display` — the trigger keeps its tab stop
 * either way. Coarse pointers have no hover, so there it stays visible.
 *
 * Its slot stays *reserved* rather than swapping in over the age: a trailing
 * column that trades content for controls flickers down the whole list as the
 * pointer crosses it on the way to one row.
 */
const rowMenuCls =
  "text-ink-faint opacity-0 transition-[color,opacity,background-color] group-hover/nav:opacity-100 hover:bg-sidebar-accent hover:text-foreground focus-visible:opacity-100 focus-visible:text-foreground aria-expanded:opacity-100 aria-expanded:bg-sidebar-accent aria-expanded:text-foreground pointer-coarse:opacity-100"

/**
 * The board navigation rail — brand, one group per discovered data repo
 * (ADR-0023, home first), a new-board affordance, and the account menu pinned
 * to the foot. Renders the same inner content in two hosts: the persistent
 * `<aside>` on wide viewports and the mobile drawer (`dashboard-shell.tsx`).
 * It carries no surface, width, or positioning of its own — the host owns the
 * border, background, collapse, and resize — so the two placements can't drift.
 *
 * The rail reads as three tiers (ADR-0023/0034/0058), and each differs from
 * its neighbour on at least three axes at once — the point being that no
 * single one has to carry the hierarchy:
 *
 * | | data repo | section | board |
 * |---|---|---|---|
 * | leading glyph | exposure, roots the spine | — | — |
 * | label x | 32 | 32 | 32, or 48 in a section |
 * | size / case | 11px CAPS tracked | 11px CAPS tracked | 14px, the slug |
 * | weight | semibold | medium | normal (medium active) |
 * | ink | `foreground` | `ink-dim` | `ink` |
 * | air above | 40px | 28px | 0 — contiguous |
 * | takes a fill | never | never | hover + active, full-bleed |
 *
 * Before ADR-0058 the two captions were the same 11px tracked-caps tier in
 * the same `ink-dim`, starting their labels at the same x, separated by a
 * weight step and a `FolderGit2` every repo carried alike. Two landmarks in
 * one voice means neither reads as the parent of the other, so the repo
 * caption took full ink (ADR-0049's move, one tier down) and its glyph became
 * the one that says something: private / shared / public.
 *
 * Board switching lives in this always-visible list: every board is one click,
 * the active one reads from across the room, and "new dashboard" is a peer of
 * the boards it joins. The repo's routine pool (ADR-0025) is no longer a row
 * but a control in the repo's own caption (ADR-0058) — repo-scoped furniture
 * beside the repo's other affordance, which returns a whole row per repo.
 *
 * A repo group with no boards keeps a create-first row in place of the board
 * list — deleting the last board must not make the repo disappear from the app.
 *
 * Rows carry honest client-local state (rail-status.ts): a yellow dot
 * ({@link UnsyncedDot}) trailing a name marks unsynced draft edits, and a
 * client-fired run in flight pulses the caption's routines glyph in the
 * accent. Both read straight from localStorage — no server call, and nothing
 * decorative: no state, no marker.
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
  onRenameSection,
  onDeleteSection,
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
  onRenameBoard?: (repo: string, slug: string) => void
  /** Rename a whole section — the section header's own `⋯` menu, keyed by
      repo + the section's current name. Renames the heading across every board
      filed under it (ADR-0039). Absent on chrome pages. */
  onRenameSection?: (repo: string, section: string) => void
  /** Dissolve a section — same menu; its boards fall back to the repo's
      unlabeled lead section (the boards themselves stay). Absent on chrome
      pages. */
  onDeleteSection?: (repo: string, section: string) => void
  /** Fired when a board link is followed — lets the mobile drawer close. */
  onNavigate?: () => void
}) {
  const t = useT()
  // One ticking clock for the whole rail's freshness ages (ADR-0035), so the
  // "2h" labels stay current between navigations without each row polling.
  const now = useNow()
  // The repo the new-dashboard dialog opens on, or null while closed — an
  // empty group's create-first row opens it pre-targeted at that repo.
  const [creating, setCreating] = useState<string | null>(null)
  const [addingRepo, setAddingRepo] = useState(false)
  // Client-local state the rail can honestly mark rows with: unsynced drafts
  // per board / pool, in-flight client-fired runs per repo (rail-status.ts).
  const { drafts, running } = useRailStatus()

  const homeRepo = sidebar?.repos.find((repo) => repo.isHome)?.repo ?? ""

  return (
    // `rail` carries the rhythm ladder's five custom properties (app.css), so
    // the coarse-pointer override moves every rung at once — the variant that
    // grew only the row height is what inverted the ladder on phones.
    <div className="rail flex h-full flex-col">
      {/* Brand row, exactly the board toolbar's height (h-11 + border-b) so
          the top hairline runs unbroken across both columns. */}
      {/* pl-[11px]: the lockup's mark is 1.25em — 20px at the brand's 16px —
          and this lands its center on the rail's one glyph column (21px), so
          the tie, every repo's exposure glyph, the spine and the foot's glyphs
          hang on a single vertical line down the whole rail. The Link's
          -mx-1/px-1 pair cancels, so the row's own padding positions the
          mark. */}
      <div className="flex h-11 shrink-0 items-center border-b border-border-dim pr-3 pl-[11px]">
        <Link
          to="/"
          aria-label="Steward"
          onClick={onNavigate}
          className="-mx-1 inline-flex items-center rounded-md px-1 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Wordmark />
        </Link>
      </div>

      {/* py-2 with no horizontal padding: the rows own their inset now that
          their fill is full-bleed, and every hairline in the rail — the brand
          row's, the one over "New dashboard", the foot's — still clears its
          nearest row by the same 8px. */}
      <nav
        aria-label={t("nav.boards")}
        className="flex flex-1 flex-col overflow-y-auto py-2"
      >
        {sidebar === null ? (
          <RailSkeleton />
        ) : (
          <>
            {/* The rail's top-level boundary and the widest rung of its ladder
                (DESIGN.md § Layout): repo group to repo group. Every rung now
                lives in one place, `--rail-*` in app.css, so a pointer variant
                can't move one and invert the nesting. */}
            <div className="flex flex-col gap-(--rail-group-step)">
              {sidebar.repos.map((repoGroup) => (
                <NavGroup
                  key={repoGroup.repo}
                  header={
                    <RepoGroupHeader
                      group={repoGroup}
                      routines={
                        <PoolAction
                          repo={repoGroup.repo}
                          active={routinesRepo === repoGroup.repo}
                          running={running.has(repoGroup.repo)}
                          draft={drafts.has(poolDraftKey(repoGroup.repo))}
                          onNavigate={onNavigate}
                        />
                      }
                    />
                  }
                >
                  {/* Boards partition into their repo's sections (ADR-0034):
                      ungrouped lead unlabeled, then labeled sections in the
                      repo's authored order. A repo with no sections yields one
                      label-less section — the flat list. Rendered as a flat
                      child sequence (not nested wrappers) so the spine's one
                      geometry holds; a section is a quiet label followed by
                      boards indented one step under it, the extra indent (not a
                      wrapper) carrying the nesting. */}
                  {sectionBoards(
                    repoGroup.dashboards,
                    repoGroup.sections,
                  ).flatMap((section, index) => {
                    // Hoisted so the menu closures capture a narrowed string,
                    // not the section's string | null label.
                    const label = section.label
                    return [
                      label != null && (
                        <SectionLabel
                          key={`section:${label}`}
                          label={label}
                          count={section.boards.length}
                          // First section in the group → the repo caption's own
                          // content, so it opens no air above itself.
                          lead={index === 0}
                          onRename={
                            onRenameSection
                              ? () => onRenameSection(repoGroup.repo, label)
                              : undefined
                          }
                          onDelete={
                            onDeleteSection
                              ? () => onDeleteSection(repoGroup.repo, label)
                              : undefined
                          }
                        />
                      ),
                      ...section.boards.map((board) => {
                        const active =
                          activeRepo === repoGroup.repo &&
                          dashboardSlug === board.slug
                        // Every repo's `main` is its default board (server-
                        // protected in all repos) — so no delete on any `main`.
                        // Editing only sets the section, so every board gets it.
                        return (
                          <NavItem
                            key={`${repoGroup.repo}:${board.slug}`}
                            to={boardHref(repoGroup.repo, board.slug, homeRepo)}
                            label={board.slug}
                            active={active}
                            // A board inside a named section sits one indent
                            // deeper than an ungrouped one, nested under its
                            // label (ADR-0034).
                            indented={section.label != null}
                            // Freshness (ADR-0035, rendered per ADR-0058): the
                            // trailing age, pilled when overdue.
                            lastRunAt={board.lastRunAt}
                            stale={board.stale}
                            now={now}
                            draft={drafts.has(
                              boardDraftKey(repoGroup.repo, board.slug),
                            )}
                            onRename={
                              onRenameBoard
                                ? () =>
                                    onRenameBoard(repoGroup.repo, board.slug)
                                : undefined
                            }
                            onDelete={
                              onDeleteBoard && board.slug !== DEFAULT_DASHBOARD
                                ? () =>
                                    onDeleteBoard(repoGroup.repo, board.slug)
                                : undefined
                            }
                            onNavigate={onNavigate}
                          />
                        )
                      }),
                    ]
                  })}
                  {repoGroup.dashboards.length === 0 && (
                    // The group's only child while the repo has no boards: the
                    // next action, sitting where the first board will. The plus
                    // takes the glyph column the spine runs down, so it reads
                    // as "a board goes here".
                    <RailAction
                      icon={Plus}
                      label={t("switcher.newHere")}
                      onClick={() => setCreating(repoGroup.repo)}
                    />
                  )}
                </NavGroup>
              ))}

              {/* Discovery degraded (search rate limit, GitHub flap): say quietly
              that groups may be missing rather than render a confident lie. */}
              {/* A prose sentence, so ink-dim — ink-faint never carries copy
                  the user is meant to read. */}
              {!sidebar.complete && (
                <p className="pr-3 pl-8 text-xs text-ink-dim">
                  {t("switcher.incomplete")}
                </p>
              )}
            </div>

            {/* New board — a create verb that belongs with the boards above, so it
            sits at the end of the list on the same glyph/label columns, set off
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
      <div className="flex shrink-0 flex-col border-t border-border-dim py-2">
        {/* Foot tier: glyphs stay on the rail's 21px spine column, but the
            label column steps out one notch (pl-9 vs the nav's pl-8) so the
            account avatar — a 20px disc, wider than the 12px glyphs — clears
            its name instead of crowding it. Both foot rows share that column,
            so they align with each other; the glyphs still hang on the
            spine. */}
        <RailAction
          icon={FolderGit2}
          label={t("switcher.addRepo")}
          onClick={() => setAddingRepo(true)}
          className="pl-9"
        />
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
            sections={Object.fromEntries(
              sidebar.repos.map((repo) => [
                repo.repo,
                // The repo's authored section order first, then any a board
                // names off-list — deduped, to offer in the create dialog.
                [
                  ...new Set([
                    ...repo.sections,
                    ...repo.dashboards
                      .map((board) => board.section)
                      .filter((section): section is string => section != null),
                  ]),
                ],
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
    // The resolved rail's own rhythm, so the ghost's silhouette is the shape
    // that lands: the group gap between groups, the caption gap from a heading
    // to its rows, and contiguous rows on the row pitch (ADR-0058) rather than
    // the loose ladder the old 2px-gap rows drew.
    <div aria-hidden className="flex flex-col gap-(--rail-group-step)">
      {[3, 2].map((rows, group) => (
        <div key={group}>
          <div className="mb-(--rail-caption-step) flex h-5 items-center pl-8">
            <Skeleton className="h-2.5 w-24" />
          </div>
          <div className="flex flex-col">
            {Array.from({ length: rows }, (_, row) => (
              <div key={row} className="rail-row flex items-center pl-8">
                <Skeleton className={row % 2 === 0 ? "h-3 w-24" : "h-3 w-16"} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * A create verb rendered on the board list's own grid: the icon sits centered
 * on the glyph column the spine runs down, the label on the board-name column.
 * Sharing that geometry is what keeps "new dashboard" and the empty-group
 * create-first row reading as peers of the boards they make, not buttons
 * floating on a different margin.
 */
function RailAction({
  icon: Icon,
  label,
  onClick,
  className,
}: {
  icon: typeof Plus
  label: string
  onClick: () => void
  /** Extra classes (e.g. the foot tier's wider `pl-9`), merged last. */
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      // A rail row is one line, always: the glyph is centred on the row's box,
      // so a label that wraps strands it between two lines and breaks the
      // pitch every gap in the ladder is measured against. `title` keeps the
      // whole label reachable on the narrow rail where one may truncate.
      title={label}
      className={cn(
        rowCls,
        "cursor-pointer truncate pr-3 text-ink-dim hover:bg-sidebar-accent/60 hover:text-foreground",
        className,
      )}
    >
      {/* size-3 (12px) — the one glyph size on the rail's marker column,
          shared with the repo caption's exposure glyph and its routines
          control. It rode at 14px once: two pixels is invisible in isolation
          and obvious in a column. */}
      <Icon
        aria-hidden
        className="absolute top-1/2 left-[21px] size-3 -translate-x-1/2 -translate-y-1/2 text-ink-faint"
      />
      {label}
    </button>
  )
}

/**
 * A dashboard section's sub-heading (ADR-0034) — the repo caption's idiom one
 * tier in, and deliberately quieter on three axes at once (ADR-0058): medium
 * where the repo is semibold, `ink-dim` where the repo took full ink, and
 * glyph-less where the repo roots the spine. It stays at the board-name column
 * with its own boards a step deeper, so the indent carries the nesting.
 *
 * It stays `ink-dim`, never `ink-faint` — the user reads it to steer, so it
 * must clear AA at this size. And it stays in the caption tier rather than
 * dropping to a smaller one: a heading smaller than what it heads is the
 * inversion the caption idiom exists to avoid.
 *
 * It carries a count, like the repo caption above it and the band heading on
 * the board (ADR-0048). A bare word at the head of a list is decoration; the
 * count is what makes the caption navigation — you can see how much is filed
 * under a section without reading its rows.
 *
 * A generous gap opens above every section but the group's first
 * (`--rail-section-gap`) and its own boards hug it below at the caption step
 * (`--rail-caption-gap`). Both are rungs of the one ladder in app.css, which
 * is what keeps the ratio (each step ≥1.5× the step it contains) true on
 * coarse pointers too — the ladder used to invert there because only the row
 * height had a touch variant.
 *
 * The **`lead` section takes no top margin**: it is the repo caption's own
 * first content, so the caption's own gap is the whole distance. It used to
 * open the full section gap there too, on the theory that every section
 * caption should sit the same distance below whatever precedes it — but what
 * precedes the first one is the heading that owns it, not a peer's last board.
 * Spending the between-sections gap inside a group detached the repo caption
 * from its own contents and flattened the rail into one ladder of evenly
 * spaced captions. Air belongs at boundaries; the first section isn't one.
 *
 * The label is the viewer's own words (a display label, ADR-0026), verbatim but
 * cased up by the caption — truncated, never wrapped.
 *
 * When `onRename`/`onDelete` are set the heading carries a trailing `⋯` menu —
 * the same idiom the board rows ({@link NavItem}) and the repo caption
 * (repo-group-header.tsx) already teach, one tier apart. A section isn't a
 * record, so both actions are batch edits across the boards filed under it
 * (ADR-0039): Rename retitles the heading, Delete dissolves it (the boards move
 * up to the ungrouped lead, none deleted). Sized to the repo caption's `⋯`
 * (size-5), not the rows' size-6 — this is a caption tier, not a board row —
 * and it rests invisible like every other rail `⋯` (ADR-0058), landing its
 * glyph on the same trailing column the repo caption and board rows share in
 * both pointer modes.
 */
function SectionLabel({
  label,
  count,
  lead,
  onRename,
  onDelete,
}: {
  label: string
  count: number
  /** This is the group's first child — the repo caption's own content, so the
      caption's own gap is the distance and the section opens no air of its
      own. */
  lead?: boolean
  onRename?: () => void
  onDelete?: () => void
}) {
  const t = useT()
  const hasMenu = onRename != null || onDelete != null
  return (
    <div
      data-testid="rail-section"
      // The optical-gap rules in app.css read this slot: whatever follows a
      // caption is a row, and it pulls its own padding back out of the gap.
      data-slot="rail-caption"
      // h-5 + an in-flow ⋯, matching the repo caption (repo-group-header.tsx):
      // the button centers in the caption's own height rather than overhanging
      // an auto-height text row. pr-3.5 (pr-3 on coarse, where both buttons
      // hit the icon-xs size-8 floor) lands the size-5 glyph's optical center
      // 24px from the rail's right edge — the one trailing column every rail
      // ⋯ shares.
      className={cn(
        "group/nav relative mb-(--rail-caption-gap) flex h-5 items-center pr-3.5 pl-8 pointer-coarse:pr-3",
        // The section gap, less the padding of the row that precedes it — the
        // same optical correction the rows under this caption make below.
        !lead && "mt-(--rail-section-step)",
      )}
    >
      {/* Label and count share one flex-1 box so the ⋯ keeps its trailing
          column: the count sits outside the truncating label, so a long
          section name shortens instead of pushing the number out of view. */}
      <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
        <span
          data-testid="rail-section-label"
          // Medium, overriding the tier's semibold: this is the repo caption's
          // idiom one step in, and weight is one of the three axes carrying
          // the subordination (with ink and the missing glyph).
          className={cn(railCaptionCls, "min-w-0 truncate font-medium")}
        >
          {label}
        </span>
        {/* aria-hidden: the boards it counts are listed directly beneath, so
            a screen reader would be told the number and then read the items.
            The count is a visual shortcut for the sighted scan, not new
            information. */}
        <span
          aria-hidden
          className="shrink-0 text-2xs text-ink-dim tabular-nums"
        >
          {count}
        </span>
      </span>
      {hasMenu && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={t("section.menu")}
                className={cn("size-5", rowMenuCls)}
              />
            }
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={4} className="w-48">
            {onRename && (
              <DropdownMenuItem onClick={onRename}>
                <Pencil />
                {t("section.rename")}
              </DropdownMenuItem>
            )}
            {onDelete && (
              <DropdownMenuItem variant="destructive" onClick={onDelete}>
                <Trash2 />
                {t("section.delete")}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}

/**
 * A repo heading over its board list, the boards threaded on a single hairline
 * spine — a tree indent guide (1px, neutral), not a side-stripe. The spine
 * descends from under the repo heading's own exposure glyph
 * (repo-group-header.tsx), which roots it, and runs the height of the list, so
 * the boards read as the repo's children rather than rows floating in space.
 * It draws *over* the rows' full-bleed fill (ADR-0058) so the guide stays
 * continuous through the row you're on, the way a file tree's does; before
 * that it was a beaded string of freshness dots, and the line was the only
 * thing holding them together.
 *
 * Boards inside a named section hang one indent deeper off the same spine.
 * There is deliberately no second guide for them: a two-level tree guide in a
 * 200px column is noise, and the 16px indent step already carries the nesting.
 */
function NavGroup({
  header,
  children,
}: {
  header: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div>
      {header}
      {/* `rail-list` is what the optical-gap rules in app.css key on: a row
          leading the group, or a row under a section caption, gives its own
          padding back so a caption's declared gap is the gap you see. */}
      <div className="rail-list relative flex flex-col">
        {/* -top-1 reaches back up into the caption's own gap so the line starts
            just under the repo glyph and reads as hanging from it. Pinned
            inside the column it began a full gap below the glyph — far enough
            that the spine looked like it belonged to the first section rather
            than to the repo. It ends flush with the last row now that the pool
            has left the list for the caption (ADR-0058). */}
        {/* `border`, not `border-dim` (DESIGN.md § Color): dim splits the flat
            plane, and this line is not a split — it is the structure the
            reader follows to tell whose children these rows are. At the dim
            tier's ≥1.2:1 it read as a rendering artifact beside the rows
            rather than as a guide, and it now has to carry the nesting alone:
            the freshness dots that used to bead it are gone (ADR-0058). */}
        <span
          aria-hidden
          className="pointer-events-none absolute -top-1 bottom-0 left-[21px] z-10 w-px bg-border"
        />
        {children}
      </div>
    </div>
  )
}

/**
 * A repo's routine pool (ADR-0025) as a control in its caption, not a row
 * (ADR-0058). The pool is repo-scoped furniture — what runs in this repo — so
 * it belongs on the repo's own row beside the repo's other affordance, and
 * moving it there returns a whole row per repo (40px each on a phone) for a
 * view opened far less often than a board.
 *
 * It takes the caption's glyph size (size-3) and, when active, the app's
 * selection vocabulary at button scale: an accent wash under an accent glyph,
 * the same treatment the header's edit toggle wears. An in-flight client-fired
 * run pulses it in the accent (resting solid under reduced motion), which is
 * the state that used to ride the row's leading marker.
 *
 * Unlike the rows' `⋯`, this never hides: it is a destination, and a
 * destination that appears on hover is one a touch user can't find.
 */
function PoolAction({
  repo,
  active,
  running,
  draft,
  onNavigate,
}: {
  repo: string
  active: boolean
  /** A client-fired run is in flight somewhere in this repo's pool
      (rail-status.ts) — runs belong to the pool, so this is their honest
      marker. */
  running?: boolean
  /** The pool view holds unsynced routine edits (its own draft, ADR-0025). */
  draft?: boolean
  onNavigate?: () => void
}) {
  const t = useT()
  return (
    <>
      {/* The pool's unsynced marker leads the cluster — it used to trail the
          pool's row name, and it is the same 6px yellow dot the header chip
          and the board rows carry, so one dot means one thing rail-wide. */}
      {draft && <UnsyncedDot label={t("nav.routinesUnsynced")} />}
      <Link
        to={routinesHref(repo)}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        title={t("nav.repoRoutines", { repo })}
        className={cn(
          // size-5 with the icon-xs coarse floor, matching the `⋯` beside it
          // so the caption's two controls read as one cluster.
          "flex size-5 shrink-0 items-center justify-center rounded-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:size-8",
          active
            ? "bg-primary/10 text-primary"
            : "text-ink-faint hover:bg-sidebar-accent hover:text-foreground",
          running && !active && "text-primary",
        )}
      >
        <ListTodo
          aria-hidden
          data-testid={running ? "rail-running" : undefined}
          className={cn(
            "size-3",
            running && "animate-pulse motion-reduce:animate-none",
          )}
        />
        <span className="sr-only">
          {t("nav.repoRoutines", { repo })}
          {running && `, ${t("nav.runInFlight")}`}
        </span>
      </Link>
    </>
  )
}

/**
 * The rail's unsynced marker — one 6px yellow dot, exactly the header chip's
 * unsynced dot, on boards and the routine pool alike. It means exactly one
 * thing — unsynced — and it is the only mark a fresh, idle row carries.
 * Never colour alone: the sr-only label names the state for readers.
 */
function UnsyncedDot({ label }: { label: string }) {
  return (
    <span className="flex shrink-0 items-center">
      <span
        aria-hidden
        data-testid="rail-draft"
        className="size-1.5 rounded-full bg-yellow"
      />
      <span className="sr-only">, {label}</span>
    </span>
  )
}

/**
 * A board's freshness readout (ADR-0035, rendered per ADR-0058). The always-on
 * leading dot is gone: it was green on nearly every row — the idle state
 * wearing a colour — while the board itself already rules the opposite way for
 * the same fact (a fresh tile carries no pill; semantic colour only when it
 * means something). The age was beside it the whole time and says strictly
 * more than the dot did.
 *
 * So: the plain age in `ink-dim` when fresh, nothing when the board has never
 * run, and — when a widget is overdue against its schedule — that age inside
 * the **widget card's own stale pill** (`StatusPill` tone `stale`), one
 * vocabulary for one fact across rail and board. The wash carries the tone and
 * the label keeps full ink, because 12px semantic-coloured text misses AA on
 * several light palettes. Never colour alone either: a pill is a form
 * difference against every fresh row's bare age, and {@link NavItem} keeps the
 * `sr-only` phrase that names the state in words.
 */
function Freshness({ age, stale }: { age: string | null; stale?: boolean }) {
  if (!stale) {
    return age == null ? null : (
      <span
        aria-hidden
        className="font-mono text-xs text-ink-dim tabular-nums"
        data-testid="rail-age"
      >
        {age}
      </span>
    )
  }
  return (
    <span
      aria-hidden
      data-testid="rail-stale"
      className="flex h-[18px] shrink-0 items-center rounded-sm border border-yellow/45 bg-yellow/10 px-1.5 font-mono text-xs text-ink tabular-nums"
    >
      {age}
    </span>
  )
}

/**
 * One board link, indented to hang off its group's spine. Boards carry full ink
 * at rest — the bright, primary tier under the muted captions, and the only
 * tier that takes a fill. The active board reads by the selection wash, full
 * `foreground` ink and a weight step; that is what the fill was always for, and
 * it no longer has to outrank freshness for a marker column, because ADR-0058
 * retired the marker column. To the right, a compact age ("2h") reports when
 * the board's stalest widget last ran, pilled when it is overdue
 * ({@link Freshness}). A board inside a named section (`indented`) hangs one
 * step deeper — the extra indent nests it under its section label (ADR-0034).
 *
 * When `onRename`/`onDelete` are set the row carries a trailing `⋯` menu:
 * board-lifecycle actions live here, beside the board they act on, so any board
 * is actionable without switching to it first. Rename is offered on every
 * board; delete is withheld from each repo's default `main`. The trigger rests
 * invisible and appears with the pointer or focus (ADR-0058), but its slot is
 * reserved either way, so the age never jumps aside for it. The Link is a
 * sibling of the menu button (never its parent) so no interactive control nests
 * inside the anchor.
 */
function NavItem({
  to,
  label,
  active,
  indented,
  lastRunAt,
  stale,
  now,
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
  /** The board's stalest widget's last publish, ISO — the age readout and,
      with `stale`, whether it is pilled (ADR-0035). null → unknown (no age). */
  lastRunAt?: string | null
  /** A widget is overdue against its schedule (ADR-0035) — pills the age. */
  stale?: boolean
  /** The rail's shared clock ({@link useNow}) the age is measured against. */
  now: number
  /** This board holds unsynced edits (a localStorage draft, ADR-0003) — it
      carries the header chip's yellow dot, trailing the name
      ({@link UnsyncedDot}), so unsynced work is visible without switching
      to the board. */
  draft?: boolean
  onRename?: () => void
  onDelete?: () => void
  onNavigate?: () => void
}) {
  const t = useT()
  const hasMenu = onRename != null || onDelete != null
  const ago = lastRunAt != null ? agoParts(lastRunAt, now) : null
  const age =
    ago == null
      ? null
      : ago.unit === "now"
        ? t("time.nowShort")
        : t(`time.${ago.unit}Short`, { n: ago.n })
  return (
    <div className="group/nav relative flex items-center">
      <Link
        to={to}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          rowCls,
          "min-w-0 flex-1 gap-2 font-mono",
          indented && "pl-12",
          hasMenu ? rowMenuPad : "pr-3",
          active
            ? "bg-primary/10 font-medium text-foreground"
            : "text-ink hover:bg-sidebar-accent/60",
        )}
      >
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {(stale || lastRunAt != null) && (
          <span className="sr-only">
            {`, ${stale ? t("nav.stale") : t("nav.fresh")}`}
            {ago != null &&
              `, ${
                ago.unit === "now"
                  ? t("time.now")
                  : t(`time.${ago.unit}`, { n: ago.n })
              }`}
          </span>
        )}
        <Freshness age={age} stale={stale} />
        {draft && <UnsyncedDot label={t("nav.unsynced")} />}
      </Link>
      {hasMenu && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={t("board.menu")}
                className={cn("absolute right-3 size-6", rowMenuCls)}
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
