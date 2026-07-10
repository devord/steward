import { useMemo, useState } from "react"
import { useFetcher } from "react-router"

import type { Routine, Widget, WidgetSize } from "@bulletin/schema"
import { GRID_MAX_COLS, GRID_MAX_ROWS, routineHost } from "@bulletin/schema"
import { Check, Copy, Maximize2, RefreshCw, X } from "lucide-react"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"
import type { BoardScope } from "../lib/board.ts"
import { cssVars } from "../lib/css.ts"
import type { ArtifactInfo } from "../lib/dashboard.server.ts"
import { useT } from "../lib/i18n.tsx"
import { frameArtifactHtml } from "../lib/theme.ts"
import { agoParts, cronIntervalMs } from "../lib/time.ts"
import { useResolvedTheme } from "../lib/use-appearance.ts"
import type { DragKind, GridDrag } from "../lib/use-grid-drag.ts"
import type { RunResult } from "../routes/run.ts"
import { WidgetLightbox } from "./widget-lightbox.tsx"

export interface WidgetCardProps {
  widget: Widget
  routine: Routine
  artifact: ArtifactInfo | undefined
  now: number
  /** The board's column count — bounds keyboard resize (defaults to the
      grid ceiling for standalone renders like tests). */
  columns?: number
  /** Which board this card sits on — enables the Update action (ADR-0016).
      Standalone renders (tests) omit both and get no Update control. */
  scope?: BoardScope
  dataRepo?: string
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
  columns = GRID_MAX_COLS,
  scope,
  dataRepo,
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
  // Manual routines have no cadence to be stale against (ADR-0016).
  const manual = routine.schedule == null
  const interval = routine.schedule ? cronIntervalMs(routine.schedule) : null
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
          cols: Math.min(columns, Math.max(1, size.cols + dCol)),
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
                  <span className="font-mono">
                    {routine.schedule ?? t("widget.manual")}
                  </span>
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
                  className="h-[15px] border-yellow/45 bg-yellow/10 px-1 font-mono text-[10px] text-ink"
                  title={t("widget.staleTitle")}
                >
                  {t("widget.stale")}
                </Badge>
              )}
              {ranLabel}
              {manual && (
                <span title={t("widget.manualTitle")}>
                  · {t("widget.manual")}
                </span>
              )}
            </span>
            {scope != null && dataRepo != null && routine.enabled && (
              <UpdateAction
                routine={routine}
                scope={scope}
                dataRepo={dataRepo}
              />
            )}
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

/** The reveal-on-hover footer control style the expand button set. */
const FOOTER_ACTION =
  "size-5 shrink-0 text-ink-faint transition-opacity hover:bg-bg3 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:size-7 pointer-coarse:opacity-100"

/**
 * The Update control (ADR-0016). Cloud routines fire their runner-owned API
 * trigger server-side (/run) — the server reads the trigger token from the
 * data repo with the clicker's GitHub token, so repo read access is the
 * whole entitlement. Local routines have no cloud resource to poke: the
 * button degrades honestly to copying the terminal one-liner.
 */
function UpdateAction({
  routine,
  scope,
  dataRepo,
}: {
  routine: Routine
  scope: BoardScope
  dataRepo: string
}) {
  const t = useT()
  const fetcher = useFetcher<RunResult>()
  const [copied, setCopied] = useState(false)

  if (routineHost(routine) === "local") {
    // Works without a bulletin checkout — the raw pointer prompt (ADR-0005);
    // team boards carry the repo clause (ADR-0010).
    const clause = scope === "team" ? ` in \`${dataRepo}\`` : ""
    const command = `claude "Run the bulletin routine \`${routine.slug}\`${clause} — follow the run-routine skill."`
    const label = copied
      ? t("widget.copied")
      : t("widget.copyCommand", { name: routine.name })
    return (
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={label}
        title={label}
        className={cn(FOOTER_ACTION, copied ? "opacity-100" : "opacity-0")}
        onClick={() => {
          void navigator.clipboard.writeText(command)
          setCopied(true)
          window.setTimeout(() => setCopied(false), 2500)
        }}
      >
        {copied ? <Check /> : <Copy />}
        <span role="status" className="sr-only">
          {copied ? t("widget.copied") : ""}
        </span>
      </Button>
    )
  }

  const busy = fetcher.state !== "idle"
  const result = fetcher.data
  const status =
    result == null
      ? null
      : result.ok
        ? t("widget.updateRequested")
        : result.error === "no-trigger"
          ? t("widget.updateNoTrigger")
          : t("widget.updateFailed")
  const label = status ?? t("widget.update", { name: routine.name })
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={label}
      title={label}
      disabled={busy}
      className={cn(
        FOOTER_ACTION,
        busy || status != null ? "opacity-100" : "opacity-0",
        result != null && !result.ok && "text-destructive",
      )}
      onClick={() => {
        void fetcher.submit(JSON.stringify({ scope, slug: routine.slug }), {
          method: "post",
          action: "/run",
          encType: "application/json",
        })
      }}
    >
      {result?.ok ? (
        <Check />
      ) : (
        <RefreshCw className={cn(busy && "animate-spin")} />
      )}
      <span role="status" className="sr-only">
        {status ?? ""}
      </span>
    </Button>
  )
}
