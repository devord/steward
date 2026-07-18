import { useCallback, useEffect, useState } from "react"

import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react"

import { DashboardSidebar } from "./dashboard-sidebar.tsx"
import { Wordmark } from "./logo.tsx"
import { Button } from "~/components/ui/button"
import { Link } from "~/components/ui/link"
import { Sheet, SheetContent, SheetTitle } from "~/components/ui/sheet"
import { cn } from "~/lib/utils"
import type { SidebarData } from "../lib/dashboard.server.ts"
import { useT } from "../lib/i18n.tsx"
import { useSidebarCollapsed, useSidebarWidth } from "../lib/sidebar-panel.ts"

/** The navigation the rail renders — the boards and the account. */
export interface ShellNav {
  /** The active board's repo+slug; "" on chrome pages (settings) where no
      board is current, so the rail lights nothing and reads as "off-board". */
  activeRepo: string
  dashboardSlug: string
  /** The repo whose routine pool view (ADR-0025) is active — lights that repo's
      Routines entry instead of a board. "" / absent everywhere else. */
  routinesRepo?: string
  /** Every discovered data repo with its boards (ADR-0023), home first.
      null → still streaming in (ADR-0030): the rail renders its skeleton. */
  sidebar: SidebarData | null
  login: string
  /** GitHub display name for the account menu; falls back to the login. */
  displayName?: string | null
  /** Board-lifecycle delete by repo+slug, wired to each board's per-board menu
      in the rail. Absent on chrome pages (settings); the rail itself withholds
      the menu from the one board that can't be deleted (the home default). */
  onDeleteBoard?: (repo: string, slug: string) => void
  /** Rename a board's display name — same per-board menu, offered on every
      board (the current name rides along for the dialog's prefill). */
  onRenameBoard?: (repo: string, slug: string) => void
  /** Rename a section — the section header's own `⋯` menu in the rail, keyed
      by repo + the section's current name. Absent on chrome pages. */
  onRenameSection?: (repo: string, section: string) => void
  /** Dissolve a section — same menu; its boards fall back to the repo's
      unlabeled lead section. Absent on chrome pages. */
  onDeleteSection?: (repo: string, section: string) => void
}

/**
 * The app frame (ADR-0010): the persistent navigation rail beside the content,
 * a mobile drawer that carries the same rail off-canvas below `lg`, and a slim
 * sticky toolbar over the content. Every signed-in surface — the boards and the
 * settings page alike — renders inside it, so navigating between them keeps the
 * frame and swaps only the content, never teleporting to a different-looking
 * page. The board layer (`dashboard-shell.tsx`) adds its board-scoped actions
 * through `actions`; settings passes its own. Extracting the frame here is what
 * keeps the two from drifting.
 *
 * The rail collapses and drag-resizes, both persisted per device; the toolbar
 * and the rail's brand row are the identical `h-11` bordered box, so the top
 * hairline runs unbroken across both columns. When the rail is hidden —
 * collapsed on desktop, or below `lg` — the toolbar carries the wordmark so the
 * brand never disappears.
 */
export function NavShell({
  nav,
  cap,
  context,
  actions,
  children,
}: {
  nav: ShellNav
  /** Content + toolbar width cap (`max-w-*`) — wide for a board grid, a
      reading width for a form. */
  cap: string
  /** Wayfinding label rendered after the wordmark wherever the rail (which
      normally answers "where am I") is hidden — the active board's slug on
      board routes. Without it the phone header says only "Steward" and the
      current board is pure recall. */
  context?: string
  /** The header's trailing action cluster (right-aligned). */
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  const t = useT()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [collapsed, toggleCollapsed] = useSidebarCollapsed()
  const { width, setWidth, persist } = useSidebarWidth()
  const [resizing, setResizing] = useState(false)
  // The width transition is enabled a frame *after* mount — not in a plain
  // mount effect, which React would batch with the stored-preference
  // correction (default → localStorage width/collapsed) and animate it. Every
  // route mounts its own NavShell, so that correction runs on each page
  // switch; deferring past its paint keeps the rail from snapping to the
  // default and sliding to the stored width. Transitions still fire for
  // genuine collapse toggles afterwards.
  const [animate, setAnimate] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimate(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const onGutterPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      const startX = e.clientX
      const startWidth = width
      let current = startWidth
      e.currentTarget.setPointerCapture(e.pointerId)
      setResizing(true)
      document.body.style.userSelect = "none"
      document.body.style.cursor = "col-resize"
      const onMove = (ev: PointerEvent) => {
        current = startWidth + (ev.clientX - startX)
        setWidth(current)
      }
      const onUp = () => {
        window.removeEventListener("pointermove", onMove)
        window.removeEventListener("pointerup", onUp)
        document.body.style.userSelect = ""
        document.body.style.cursor = ""
        setResizing(false)
        persist(current)
      }
      window.addEventListener("pointermove", onMove)
      window.addEventListener("pointerup", onUp)
    },
    [width, setWidth, persist],
  )

  const onGutterKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const step = e.shiftKey ? 32 : 8
      if (e.key === "ArrowLeft") {
        e.preventDefault()
        const next = width - step
        setWidth(next)
        persist(next)
      } else if (e.key === "ArrowRight") {
        e.preventDefault()
        const next = width + step
        setWidth(next)
        persist(next)
      }
    },
    [width, setWidth, persist],
  )

  return (
    <div className="flex min-h-dvh">
      {/* Persistent rail — on the canvas plane (bg, via --sidebar), split
          from the content by a hairline: chrome is one flat plane, cards the
          only elevated surface. Collapses to zero width (content clipped,
          not reflowed) and resizes via the gutter. */}
      <aside
        inert={collapsed || undefined}
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 overflow-hidden bg-sidebar lg:block",
          // Deliberately animates `width` (a layout property): the content
          // column must reflow *with* the rail — a transform slide would
          // leave a dead gutter until the snap. 200ms, user-initiated,
          // desktop-only; the reflow cost is accepted.
          animate && !resizing
            ? "transition-[width] duration-200 ease-out motion-reduce:transition-none"
            : "",
        )}
        style={{ width: collapsed ? 0 : width }}
      >
        <div
          style={{ width }}
          className="relative flex h-full flex-col border-r border-border-dim"
        >
          <DashboardSidebar {...nav} />
          {/* Drag/keyboard gutter — the ARIA window-splitter pattern. */}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={t("nav.resize")}
            tabIndex={collapsed ? -1 : 0}
            onPointerDown={onGutterPointerDown}
            onKeyDown={onGutterKeyDown}
            className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize touch-none transition-colors hover:bg-primary/40 focus-visible:bg-primary/60 focus-visible:outline-none"
          />
        </div>
      </aside>

      {/* Mobile drawer — the same rail, off-canvas. */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent>
          <SheetTitle className="sr-only">{t("nav.boards")}</SheetTitle>
          <DashboardSidebar {...nav} onNavigate={() => setDrawerOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* h-11 + border-b, the same box as the rail's brand row → continuous
            top hairline across the two columns. z-30 clears a lifted card
            (drag z-20) so a widget dragged up to the top can't cover it. */}
        {/* Below lg the row relaxes to h-12: the brand lockup steps up to
            text-base there (the wordmark must not read smaller than the 16px
            widget titles it sits above) and touch targets take their coarse
            floors, so the desktop-slim 44px row would crowd. On lg it stays
            the same h-11 box as the rail's brand row → unbroken hairline. */}
        <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center border-b bg-background lg:h-11">
          <div
            className={cn(
              "mx-auto flex h-full w-full items-center gap-1.5 px-4 sm:px-6",
              cap,
            )}
          >
            {/* Desktop: collapse/expand the rail. */}
            <Button
              variant="ghost"
              size="icon-sm"
              className="hidden text-ink-dim hover:text-foreground lg:inline-flex"
              aria-label={collapsed ? t("nav.expand") : t("nav.collapse")}
              onClick={toggleCollapsed}
            >
              {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            </Button>
            {/* Mobile: open the drawer. 44px on coarse pointers (the 44/48px
                platform floor for icon-only chrome); -ml keeps the glyph
                roughly on the text gutter as the box grows. */}
            <Button
              variant="ghost"
              size="icon-sm"
              className="-ml-1 size-9 text-ink-dim hover:text-foreground lg:hidden pointer-coarse:-ml-2 pointer-coarse:size-11"
              aria-label={t("nav.openMenu")}
              onClick={() => setDrawerOpen(true)}
            >
              <Menu />
            </Button>
            {/* Brand shows here whenever the rail's own wordmark is hidden:
                always below lg, and on desktop only while collapsed. Below lg
                the lockup takes the 16px heading tier — the most visible type
                in the app must anchor the header, not whisper under it. */}
            <Link
              to="/"
              aria-label="Steward"
              className={cn(
                "-mx-1 mr-1 inline-flex items-center rounded-md px-1 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11",
                !collapsed && "lg:hidden",
              )}
            >
              <Wordmark className="text-base lg:text-sm" />
            </Link>
            {/* Wayfinding: the active board, readable without opening the
                drawer. Same visibility as the brand — wherever the rail isn't
                answering "where am I". Truncates before anything else. */}
            {context != null && (
              <span
                className={cn(
                  "min-w-0 truncate font-mono text-xs text-ink-dim",
                  !collapsed && "lg:hidden",
                )}
              >
                · {context}
              </span>
            )}

            {actions && (
              <div className="ml-auto flex items-center gap-1">{actions}</div>
            )}
          </div>
        </header>

        <div className={cn("mx-auto w-full px-4 pt-5 pb-16 sm:px-6", cap)}>
          {children}
        </div>
      </div>
    </div>
  )
}
