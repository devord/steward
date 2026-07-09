import { cssVars } from "../lib/css.ts"
import type { WidgetView } from "../lib/dashboard.server.ts"
import { cronIntervalMs, formatAgo } from "../lib/time.ts"

/**
 * One grid cell: the routine's artifact in a sandboxed srcdoc iframe
 * (scripts allowed, no same-origin, no network — ADR-0002), a freshness
 * footer, and a placeholder when nothing was ever published.
 */
export function WidgetCard({
  widget,
  now,
}: {
  widget: WidgetView
  now: number
}) {
  const { routine, position, size, artifactHtml, lastRunAt } = widget
  const interval = cronIntervalMs(routine.schedule)
  // Overdue by more than one full interval → the schedule missed a run.
  const stale =
    lastRunAt != null &&
    interval != null &&
    now - Date.parse(lastRunAt) > 2 * interval

  return (
    <article
      className="widget-cell flex flex-col overflow-hidden rounded-md border border-border-dim bg-bg1"
      style={cssVars({
        "--col": position.col,
        "--row": position.row,
        "--cols": size.cols,
        "--cols-md": Math.min(size.cols, 2),
        "--rows": size.rows,
      })}
    >
      {artifactHtml ? (
        <iframe
          srcDoc={artifactHtml}
          sandbox="allow-scripts"
          title={routine.name}
          loading="lazy"
          className="min-h-0 w-full flex-1 border-0"
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1 p-3 text-center">
          <span className="text-sm text-ink-dim">{routine.name}</span>
          <span className="text-xs text-ink-faint">
            {routine.enabled
              ? `no artifact yet — runs on ${routine.schedule}`
              : "routine disabled"}
          </span>
        </div>
      )}
      <footer className="flex items-center justify-between gap-2 border-t border-border-dim px-2 py-1 font-mono text-xs text-ink-faint">
        <span className="truncate">{routine.name}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          {stale && (
            <span
              className="rounded-sm bg-yellow/15 px-1 text-yellow"
              title="overdue relative to its schedule"
            >
              stale
            </span>
          )}
          {lastRunAt ? `ran ${formatAgo(lastRunAt, now)}` : "never ran"}
        </span>
      </footer>
    </article>
  )
}
