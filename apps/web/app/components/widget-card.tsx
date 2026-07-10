import { useMemo, useState } from "react"

import type { Routine, Widget, WidgetSize } from "@bulletin/schema"
import { GRID_MAX_COLS, GRID_MAX_ROWS } from "@bulletin/schema"
import { Maximize2, X } from "lucide-react"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"
import { cssVars } from "../lib/css.ts"
import type { ArtifactInfo } from "../lib/dashboard.server.ts"
import { useT } from "../lib/i18n.tsx"
import { frameArtifactHtml } from "../lib/theme.ts"
import { agoParts, cronIntervalMs } from "../lib/time.ts"
import { useResolvedTheme } from "../lib/use-appearance.ts"
import type { DragKind, GridDrag } from "../lib/use-grid-drag.ts"
import { WidgetLightbox } from "./widget-lightbox.tsx"

export interface WidgetCardProps {
  widget: Widget
  routine: Routine
  artifact: ArtifactInfo | undefined
  now: number
  /** Edit mode: drag to move, corner handle to resize, × to remove. */
  editing?: boolean
  /** This card's active drag, if it is the one being dragged. */
  drag?: GridDrag | null
  onDragStart?: (kind: DragKind, event: React.PointerEvent) => void
  /** Keyboard fallbacks — arrows move, shift+arrows resize, del removes. */
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
  drag = null,
  onDragStart,
  onMove,
  onResize,
  onRemove,
}: WidgetCardProps) {
  const t = useT()
  const theme = useResolvedTheme()
  const [expanded, setExpanded] = useState(false)
  const { position, size } = widget
  const html = useMemo(
    () => (artifact?.html ? frameArtifactHtml(artifact.html, theme) : null),
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

  const resizing = drag?.kind === "resize"
  // While resizing, the footer readout tracks the snap target live.
  const shownSize = resizing ? drag.candidate : size

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.target !== event.currentTarget) return
    const step = (dCol: number, dRow: number) => {
      if (event.shiftKey) {
        onResize?.({
          cols: Math.min(GRID_MAX_COLS, Math.max(1, size.cols + dCol)),
          rows: Math.min(GRID_MAX_ROWS, Math.max(1, size.rows + dRow)),
        })
      } else {
        onMove?.(dCol, dRow)
      }
    }
    switch (event.key) {
      case "ArrowLeft":
        step(-1, 0)
        break
      case "ArrowRight":
        step(1, 0)
        break
      case "ArrowUp":
        step(0, -1)
        break
      case "ArrowDown":
        step(0, 1)
        break
      case "Delete":
      case "Backspace":
        onRemove?.()
        break
      default:
        return
    }
    event.preventDefault()
  }

  return (
    <>
      <article
        className={cn(
          "widget-cell group relative flex flex-col overflow-hidden rounded-lg border bg-card",
          editing && "focus-visible:outline-2 focus-visible:-outline-offset-1",
          drag && "shadow-xl shadow-black/50",
        )}
        tabIndex={editing ? 0 : undefined}
        aria-label={
          editing
            ? `${routine.name} — arrow keys move, shift+arrows resize, delete removes`
            : undefined
        }
        onKeyDown={editing ? handleKeyDown : undefined}
        style={{
          ...cssVars({
            "--col": position.col,
            "--row": position.row,
            "--cols": size.cols,
            "--cols-md": Math.min(size.cols, 2),
            "--rows": size.rows,
          }),
          ...(drag?.kind === "move" && {
            transform: `translate(${drag.dx}px, ${drag.dy}px)`,
            zIndex: 20,
          }),
          ...(resizing &&
            drag.sizePx && {
              width: drag.sizePx.width,
              height: drag.sizePx.height,
              zIndex: 20,
            }),
        }}
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
            <span className="font-mono text-xs text-ink-dim">
              {routine.slug}
            </span>
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
          <footer className="relative z-20 flex items-center gap-1.5 border-t bg-bg2 py-0.5 pr-2 pl-1 text-[11px]">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`remove ${routine.name} from grid`}
              className="size-5 shrink-0 text-ink-faint hover:bg-destructive/10 hover:text-destructive pointer-coarse:size-7"
              onClick={() => onRemove?.()}
            >
              <X />
            </Button>
            <span className="truncate font-mono text-ink-dim">
              {routine.slug}
            </span>
            <span
              className={cn(
                "ml-auto shrink-0 pr-3 font-mono text-[10px] tabular-nums",
                resizing ? "text-orange" : "text-ink-faint",
              )}
            >
              {shownSize.cols}×{shownSize.rows}
            </span>
          </footer>
        ) : (
          <footer className="flex items-center gap-2 border-t border-border-dim py-[3px] pr-1 pl-2 text-[11px]">
            <span className="truncate text-ink-dim">{routine.name}</span>
            <span className="ml-auto flex shrink-0 items-center gap-1.5 font-mono text-ink-faint">
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
            {/* Peek at full size. Recedes until the card is hovered/focused
              (fine pointers), always shown on touch where there is no hover;
              the reserved slot means no layout shift on reveal. */}
            {html && (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={t("widget.expand", { name: routine.name })}
                title={t("widget.expandShort")}
                className="size-5 shrink-0 text-ink-faint opacity-0 transition-opacity hover:bg-bg3 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:size-7 pointer-coarse:opacity-100"
                onClick={() => setExpanded(true)}
              >
                <Maximize2 />
              </Button>
            )}
          </footer>
        )}
        {editing && (
          <>
            {/* Drag surface: covers the artifact (iframes swallow pointer
              events) but sits under the footer and resize handle. Remove
              lives in the footer so no control ever floats over the
              artifact — content stays clean while dragging. */}
            <div
              aria-hidden
              className={cn(
                "absolute inset-0 z-10 touch-none",
                drag?.kind === "move" ? "cursor-grabbing" : "cursor-grab",
              )}
              onPointerDown={(event) => onDragStart?.("move", event)}
            />
            {/* Corner resize handle — hidden mid-move so the lifted card is
              just artifact + footer. */}
            {drag?.kind !== "move" && (
              <div
                aria-hidden
                className={cn(
                  "absolute right-[3px] bottom-[3px] z-30 size-3.5 cursor-nwse-resize touch-none rounded-br-[5px] border-r-2 border-b-2",
                  resizing
                    ? "border-orange"
                    : "border-ink-faint hover:border-orange",
                )}
                onPointerDown={(event) => onDragStart?.("resize", event)}
              />
            )}
          </>
        )}
      </article>
      {html && (
        <WidgetLightbox
          open={expanded}
          onOpenChange={setExpanded}
          name={routine.name}
          slug={routine.slug}
          html={html}
          ranLabel={ranLabel}
          stale={stale}
        />
      )}
    </>
  )
}
