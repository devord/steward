import type { Widget } from "@bulletin/schema"

import { Skeleton } from "~/components/ui/skeleton"
import { cssVars } from "../lib/css.ts"

/**
 * A widget cell while its artifact streams in from GitHub (ADR-0002). The
 * board structure loads first, so this sits in the widget's real grid slot at
 * its real size — the silhouette is already correct; only the body is
 * pending. Mirrors WidgetCard's frame (border, card surface, footer rule) so
 * the swap to the loaded card doesn't shift the layout.
 */
export function WidgetSkeleton({ widget }: { widget: Widget }) {
  const { position, size } = widget
  // A couple more body lines on taller cells so big widgets don't read empty.
  const lines = size.rows > 1 ? 5 : 3

  return (
    <div
      aria-hidden
      className="widget-cell flex flex-col overflow-hidden rounded-lg border bg-card"
      style={cssVars({
        "--col": position.col,
        "--row": position.row,
        "--cols": size.cols,
        "--cols-md": Math.min(size.cols, 2),
        "--rows": size.rows,
      })}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 p-3">
        <Skeleton className="h-2.5 w-1/3" />
        <div className="mt-0.5 flex flex-col gap-2">
          {Array.from({ length: lines }, (_, i) => (
            <Skeleton key={i} className={LINE_WIDTHS[i % LINE_WIDTHS.length]} />
          ))}
        </div>
      </div>
      <footer className="flex items-center justify-between gap-2 border-t border-border-dim px-2 py-[5px]">
        <Skeleton className="h-2 w-20" />
        <Skeleton className="h-2 w-10" />
      </footer>
    </div>
  )
}

// Ragged widths so the placeholder reads as prose, not a fill bar.
const LINE_WIDTHS = [
  "h-2 w-full",
  "h-2 w-11/12",
  "h-2 w-4/5",
  "h-2 w-full",
  "h-2 w-2/3",
]
