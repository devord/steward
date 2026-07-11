import { useState } from "react"

import { Menu } from "lucide-react"

import { DashboardSidebar } from "./dashboard-sidebar.tsx"
import { Wordmark } from "./logo.tsx"
import { Button } from "~/components/ui/button"
import { Link } from "~/components/ui/link"
import { Sheet, SheetContent, SheetTitle } from "~/components/ui/sheet"
import { cn } from "~/lib/utils"
import type { BoardScope } from "../lib/board.ts"
import { useT } from "../lib/i18n.tsx"

/** The navigation the rail renders — the boards, the account, the repo home. */
export interface ShellNav {
  dataRepo: string
  scope: BoardScope
  /** The active board's slug; "" on chrome pages (settings) where no board is
      current, so the rail lights nothing and reads as "off-board". */
  dashboardSlug: string
  personalDashboards: string[]
  teamDashboards: string[] | null
  login: string
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
 * Pure presentation: it owns the drawer open state and nothing else.
 */
export function NavShell({
  nav,
  cap,
  actions,
  children,
}: {
  nav: ShellNav
  /** Content + toolbar width cap (`max-w-*`) — wide for a board grid, a
      reading width for a form. */
  cap: string
  /** The header's trailing action cluster (right-aligned). */
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  const t = useT()
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className="flex min-h-dvh">
      {/* Persistent rail — the second neutral layer (bg1), a hairline off the
          page. Sticks full-height while the content scrolls beside it. */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border-dim bg-sidebar lg:flex">
        <DashboardSidebar {...nav} />
      </aside>

      {/* Mobile drawer — the same rail, off-canvas. */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent>
          <SheetTitle className="sr-only">{t("nav.boards")}</SheetTitle>
          <DashboardSidebar {...nav} onNavigate={() => setDrawerOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b bg-background">
          <div
            className={cn(
              "mx-auto flex min-h-11 items-center gap-2 px-4 py-1.5 sm:px-6",
              cap,
            )}
          >
            {/* Below lg the rail is gone, so the toolbar carries the drawer
                trigger and the brand it would otherwise show. */}
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-ink-dim hover:text-foreground lg:hidden"
              aria-label={t("nav.openMenu")}
              onClick={() => setDrawerOpen(true)}
            >
              <Menu />
            </Button>
            <Link
              to="/"
              aria-label="Bulletin"
              className="-mx-1 inline-flex items-center rounded-md px-1 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 lg:hidden"
            >
              <Wordmark className="text-sm" />
            </Link>

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
