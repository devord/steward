import type { Widget } from "@steward/schema"

import { Skeleton } from "~/components/ui/skeleton"
import { cn } from "~/lib/utils"

/**
 * A widget cell while its artifact streams in from GitHub (ADR-0002). The
 * board structure loads first, so this fills its react-grid-layout cell (which
 * is already at the widget's real size) — the silhouette is correct; only the
 * body is pending. Mirrors WidgetCard's view-mode frame (frameless section
 * header over a flush, page-colored body, transparent border) so the swap to
 * the loaded card neither shifts the layout nor flashes a card outline that
 * then dissolves.
 */
export function WidgetSkeleton({ widget }: { widget: Widget }) {
  return (
    <div
      aria-hidden
      className="flex size-full flex-col overflow-hidden border border-transparent"
    >
      <div className="flex min-h-8 items-center justify-between gap-2 px-3.5 py-1.5">
        <Skeleton className="h-2.5 w-24" />
        <Skeleton className="h-2.5 w-12" />
      </div>
      <WidgetSkeletonBody rows={widget.size.rows} />
    </div>
  )
}

/**
 * The pending-body lines alone — WidgetCard reuses them as the veil over a
 * mounted iframe until its document paints, so "artifact on the way" looks
 * the same whether the bytes or the paint are what's pending.
 */
export function WidgetSkeletonBody({
  rows,
  className,
}: {
  rows: number
  className?: string
}) {
  // A couple more body lines on taller cells so big widgets don't read empty.
  const lines = rows > 1 ? 5 : 3

  return (
    <div
      aria-hidden
      // Inset matched to the artifact's own tile padding (`12px 14px`), the
      // same edge the title bar above now takes — so the pending lines sit
      // exactly where the real content will, and the swap doesn't slide.
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-2.5 px-3.5 py-3",
        className,
      )}
    >
      <Skeleton className="h-2.5 w-1/3" />
      <div className="mt-0.5 flex flex-col gap-2">
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton key={i} className={LINE_WIDTHS[i % LINE_WIDTHS.length]} />
        ))}
      </div>
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
