import { useMemo } from "react"

import type { Routine, Widget, WidgetSize } from "@bulletin/schema"
import { GRID_MAX_COLS, GRID_MAX_ROWS } from "@bulletin/schema"
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, X } from "lucide-react"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { cssVars } from "../lib/css.ts"
import type { ArtifactInfo } from "../lib/dashboard.server.ts"
import { useT } from "../lib/i18n.tsx"
import { themeArtifactHtml } from "../lib/theme.ts"
import { agoParts, cronIntervalMs } from "../lib/time.ts"
import { useResolvedTheme } from "../lib/use-appearance.ts"

export interface WidgetCardProps {
  widget: Widget
  routine: Routine
  artifact: ArtifactInfo | undefined
  now: number
  /** Edit mode swaps the footer for move/resize/remove controls. */
  editing?: boolean
  onMove?: (dCol: number, dRow: number) => void
  onResize?: (size: WidgetSize) => void
  onRemove?: () => void
}

/**
 * One grid cell: the routine's artifact in a sandboxed srcdoc iframe
 * (scripts allowed, no same-origin, no network — ADR-0002), a freshness
 * footer, and a placeholder when nothing was ever published.
 *
 * Artifacts are authored in gruvbox; a non-default theme is injected as a
 * `--color-*` override appended to the document (ADR-0009). The server
 * renders the default, so a switched theme reloads each iframe once right
 * after hydration — local srcdoc, no network, imperceptible.
 */
export function WidgetCard({
  widget,
  routine,
  artifact,
  now,
  editing = false,
  onMove,
  onResize,
  onRemove,
}: WidgetCardProps) {
  const t = useT()
  const theme = useResolvedTheme()
  const { position, size } = widget
  const html = useMemo(
    () => (artifact?.html ? themeArtifactHtml(artifact.html, theme) : null),
    [artifact?.html, theme],
  )
  const lastRunAt = artifact?.lastRunAt ?? null
  const interval = cronIntervalMs(routine.schedule)
  // Overdue by more than one full interval → the schedule missed a run.
  const stale =
    lastRunAt != null &&
    interval != null &&
    now - Date.parse(lastRunAt) > 2 * interval

  const ago = lastRunAt ? agoParts(lastRunAt, now) : null
  const ranLabel = ago
    ? ago.unit === "now"
      ? t("widget.ran", { ago: t("time.now") })
      : t("widget.ran", { ago: t(`time.${ago.unit}`, { n: ago.n }) })
    : t("widget.never")

  return (
    <article
      className="widget-cell flex flex-col overflow-hidden rounded-lg border bg-card"
      style={cssVars({
        "--col": position.col,
        "--row": position.row,
        "--cols": size.cols,
        "--cols-md": Math.min(size.cols, 2),
        "--rows": size.rows,
      })}
    >
      {html ? (
        <iframe
          srcDoc={html}
          sandbox="allow-scripts"
          title={routine.name}
          loading="lazy"
          className="min-h-0 w-full flex-1 border-0"
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 p-3 text-center">
          <span className="font-mono text-xs text-ink-dim">{routine.slug}</span>
          <span className="text-xs text-ink-faint">
            {artifact?.unreachable ? (
              t("widget.unreachable")
            ) : routine.enabled ? (
              <>
                {t("widget.waiting")}{" "}
                <span className="font-mono">{routine.schedule}</span>
              </>
            ) : (
              t("widget.disabled")
            )}
          </span>
        </div>
      )}
      {editing ? (
        <footer className="flex items-center gap-1 border-t bg-bg2 px-1.5 py-1">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t("widget.moveLeft")}
            onClick={() => onMove?.(-1, 0)}
          >
            <ArrowLeft />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t("widget.moveRight")}
            onClick={() => onMove?.(1, 0)}
          >
            <ArrowRight />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t("widget.moveUp")}
            onClick={() => onMove?.(0, -1)}
          >
            <ArrowUp />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t("widget.moveDown")}
            onClick={() => onMove?.(0, 1)}
          >
            <ArrowDown />
          </Button>
          <span className="ml-auto flex items-center gap-1">
            <SizeSelect
              label={t("widget.columns")}
              max={GRID_MAX_COLS}
              value={size.cols}
              onChange={(cols) => onResize?.({ ...size, cols })}
            />
            <span className="text-xs text-ink-faint">×</span>
            <SizeSelect
              label={t("widget.rows")}
              max={GRID_MAX_ROWS}
              value={size.rows}
              onChange={(rows) => onResize?.({ ...size, rows })}
            />
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t("widget.remove", { name: routine.name })}
              className="text-destructive"
              onClick={() => onRemove?.()}
            >
              <X />
            </Button>
          </span>
        </footer>
      ) : (
        <footer className="flex items-center justify-between gap-2 border-t border-border-dim px-2 py-[3px] text-[11px]">
          <span className="truncate text-ink-dim">{routine.name}</span>
          <span className="flex shrink-0 items-center gap-1.5 font-mono text-ink-faint">
            {stale && (
              <Badge
                variant="secondary"
                className="h-[15px] bg-yellow/15 px-1 font-mono text-[10px] text-yellow"
                title={t("widget.staleTitle")}
              >
                {t("widget.stale")}
              </Badge>
            )}
            {ranLabel}
          </span>
        </footer>
      )}
    </article>
  )
}

function SizeSelect({
  label,
  max,
  value,
  onChange,
}: {
  label: string
  max: number
  value: number
  onChange: (value: number) => void
}) {
  return (
    <Select
      value={String(value)}
      onValueChange={(next) => {
        const parsed = Number(next)
        if (Number.isInteger(parsed)) onChange(parsed)
      }}
    >
      <SelectTrigger size="sm" aria-label={label} className="h-6 px-1.5">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Array.from({ length: max }, (_, index) => (
          <SelectItem key={index + 1} value={String(index + 1)}>
            {index + 1}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
