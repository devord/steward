import { useEffect, useMemo, useState } from "react"
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
import {
  setupCommands,
  type WidgetStatus,
  widgetStatus,
} from "../lib/routine-status.ts"
import { frameArtifactHtml } from "../lib/theme.ts"
import { agoParts } from "../lib/time.ts"
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
  /** The signed-in login — team boards note when a routine's runner differs. */
  login?: string
  /** Is the routine synced (on the server), not just added in the draft?
      Drives the "in your draft — sync it" empty state. Defaults true for
      standalone renders. */
  committed?: boolean
  /** When set, a run fired at this epoch hasn't published yet — the tile shows
      a running indicator and the update button is disabled (ADR-0016). */
  pendingFiredAt?: number | null
  /** Called when the update button successfully fires a cloud run. */
  onFired?: () => void
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
 * One grid cell: a title bar (name + freshness + actions), the routine's
 * artifact in a sandboxed srcdoc iframe (scripts allowed, no same-origin, no
 * network — ADR-0002), and a placeholder when nothing was ever published.
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
  login,
  committed = true,
  pendingFiredAt = null,
  onFired,
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
  const status = widgetStatus(routine, {
    committed,
    hasTrigger: artifact?.hasTrigger,
    artifact,
    pendingFiredAt,
    now,
  })
  const stale = status.kind === "live" && status.stale
  const running = status.kind === "running"

  const ago = lastRunAt ? agoParts(lastRunAt, now) : null
  const ranLabel = ago
    ? ago.unit === "now"
      ? t("widget.ran", { ago: t("time.now") })
      : t("widget.ran", { ago: t(`time.${ago.unit}`, { n: ago.n }) })
    : t("widget.never")

  const resizing = drag?.kind === "resize"
  // While resizing, the title-bar readout tracks the snap target live.
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
        {editing ? (
          /* Edit-mode title bar: remove, identity, and the live size readout.
             Controls live in the bar, never floating over the artifact. */
          <header className="relative z-20 flex items-center gap-1.5 border-b bg-bg2 py-1 pr-2.5 pl-1 text-xs">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t("widget.remove", { name: routine.name })}
              className="size-5 shrink-0 text-ink-dim hover:bg-destructive/10 hover:text-destructive pointer-coarse:size-7"
              onClick={() => onRemove?.()}
            >
              <X />
            </Button>
            <span className="truncate font-mono text-ink-dim">
              {routine.slug}
            </span>
            <span
              className={cn(
                "ml-auto shrink-0 pr-1 font-mono tabular-nums",
                resizing ? "text-primary" : "text-ink-dim",
              )}
            >
              {shownSize.cols}×{shownSize.rows}
            </span>
          </header>
        ) : (
          /* View-mode title bar: name (left), then a right-aligned cluster of
             hover-revealed actions followed by the freshness/state readout.
             Actions sit *before* the readout so the timestamp stays pinned to
             the card's edge (symmetric with the title inset) and the reserved
             action width is absorbed by the flex gap — no idle dead space, no
             layout shift on reveal. One slim strip; the artifact keeps a clean
             bottom edge. */
          <header className="flex min-h-8 items-center gap-2 border-b border-border-dim py-1.5 pr-2.5 pl-2.5 text-xs">
            <span className="min-w-0 truncate font-medium text-foreground">
              {routine.name}
            </span>
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              {scope != null && dataRepo != null && routine.enabled && (
                <UpdateAction
                  routine={routine}
                  scope={scope}
                  dataRepo={dataRepo}
                  pending={pendingFiredAt != null}
                  onFired={onFired}
                  forceVisible={status.kind !== "live"}
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
                  className={cn(BAR_ACTION, "opacity-0")}
                  onClick={() => setExpanded(true)}
                >
                  <Maximize2 />
                </Button>
              )}
              <span className="flex items-center gap-1.5 font-mono text-ink-dim">
                {running ? (
                  <span className="flex items-center gap-1 text-primary">
                    <RefreshCw className="size-3 animate-spin" />
                    {t("widget.running")}
                  </span>
                ) : (
                  <>
                    {stale && (
                      <Badge
                        variant="secondary"
                        className="h-[18px] border-yellow/45 bg-yellow/10 px-1.5 font-mono text-xs text-ink"
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
                  </>
                )}
              </span>
            </div>
          </header>
        )}
        {html ? (
          <iframe
            srcDoc={html}
            sandbox="allow-scripts"
            title={routine.name}
            loading="lazy"
            className="min-h-0 w-full flex-1 border-0"
          />
        ) : (
          <WidgetEmptyState
            status={status}
            routine={routine}
            scope={scope}
            login={login}
            now={now}
          />
        )}
        {editing && (
          <>
            {/* Drag surface: covers the artifact (iframes swallow pointer
              events) but sits under the title bar and resize handle. Remove
              lives in the bar so no control ever floats over the
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
                    ? "border-primary"
                    : "border-ink-dim hover:border-primary",
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

/** The reveal-on-hover title-bar action style the expand + update buttons share. */
const BAR_ACTION =
  "size-5 shrink-0 text-ink-dim transition-opacity hover:bg-bg3 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:size-7 pointer-coarse:opacity-100"

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
  pending = false,
  forceVisible = false,
  onFired,
}: {
  routine: Routine
  scope: BoardScope
  dataRepo: string
  /** A fired run hasn't published yet (persists across reloads) — the button
      spins and can't re-fire until it clears (ADR-0016). */
  pending?: boolean
  /** Keep the button visible (not hover-only) — for tiles with no artifact,
      a pending run, or a missing trigger, where it's the primary affordance. */
  forceVisible?: boolean
  onFired?: () => void
}) {
  const t = useT()
  const fetcher = useFetcher<RunResult>()
  const [copied, setCopied] = useState(false)

  // Tell the board a fire landed so it can start the pending/running state.
  // Depend on the fetcher.data object (a fresh response each submit), not a
  // derived boolean — otherwise a second successful run of the same widget
  // leaves the boolean at true and the effect never re-runs.
  useEffect(() => {
    if (fetcher.data?.ok === true) onFired?.()
  }, [fetcher.data, onFired])

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
        className={cn(
          BAR_ACTION,
          copied || forceVisible ? "opacity-100" : "opacity-0",
        )}
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
  const spinning = busy || pending
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
      disabled={spinning}
      className={cn(
        BAR_ACTION,
        spinning || status != null || forceVisible
          ? "opacity-100"
          : "opacity-0",
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
      {result?.ok && !pending ? (
        <Check />
      ) : (
        // Spin only for this button's own in-flight submit. While a run is
        // pending the header already shows the "Running" spinner, so spinning
        // here too would put two spinners on one card; stay a static, disabled
        // icon instead.
        <RefreshCw className={cn(busy && "animate-spin")} />
      )}
      <span role="status" className="sr-only">
        {status ?? ""}
      </span>
    </Button>
  )
}

/** A copyable one-liner for setup steps — mono text plus a copy button. */
export function CopyableCommand({ command }: { command: string }) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      aria-label={t("widget.copyCmd")}
      title={t("widget.copyCmd")}
      className="flex max-w-full items-center gap-1.5 rounded border border-border-dim bg-bg px-1.5 py-1 font-mono text-xs text-ink-dim transition-colors hover:border-primary hover:text-foreground"
      onClick={() => {
        void navigator.clipboard.writeText(command)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 2500)
      }}
    >
      {copied ? (
        <Check className="size-3 shrink-0 text-green" />
      ) : (
        <Copy className="size-3 shrink-0" />
      )}
      <span className="min-w-0 truncate">{command}</span>
    </button>
  )
}

/**
 * The placeholder for a widget with no artifact yet: instead of a dead cell,
 * it says where the routine is in the activation chain and — host- and
 * schedule-specific — exactly what to run to get its first artifact
 * (ADR-0012/0013/0016). It resolves itself the moment a run publishes.
 */
function WidgetEmptyState({
  status,
  routine,
  scope,
  login,
  now,
}: {
  status: WidgetStatus
  routine: Routine
  scope?: BoardScope
  login?: string
  now: number
}) {
  const t = useT()
  const cmds = setupCommands(routine)
  const local = routineHost(routine) === "local"
  const manual = routine.schedule == null

  let hint: React.ReactNode = null
  let command: string | null = null
  let note: string | null = null

  switch (status.kind) {
    case "unreachable":
      hint = t("widget.unreachable")
      break
    case "disabled":
      hint = t("widget.disabled")
      break
    case "draft":
      hint = t("widget.draftHint")
      break
    case "running": {
      const ago = agoParts(new Date(status.firedAt).toISOString(), now)
      hint = t("widget.runningSince", {
        ago:
          ago.unit === "now"
            ? t("time.now")
            : t(`time.${ago.unit}`, { n: ago.n }),
      })
      break
    }
    case "ready-manual":
      hint = t("widget.readyManual")
      break
    case "needs-trigger":
      hint = t("widget.needsTriggerHint")
      command = cmds.enact
      break
    default:
      // awaiting-first-run
      if (local && manual) {
        hint = t("widget.awaitLocalManual")
        command = cmds.runOnce
      } else {
        hint = t("widget.awaitEnact")
        command = cmds.enact
        if (routine.schedule) {
          note = t("widget.firstRunSchedule", { cron: routine.schedule })
        }
      }
  }

  // Team boards: the cloud resource belongs to the runner, so name who must act.
  const runnerNote =
    scope === "team" &&
    routine.runner != null &&
    login != null &&
    routine.runner !== login
      ? t("widget.runnerNote", { runner: routine.runner })
      : null

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 p-3 text-center">
      {status.kind === "running" && (
        <RefreshCw className="size-4 shrink-0 animate-spin text-primary" />
      )}
      <span className="font-mono text-xs text-ink-dim">{routine.slug}</span>
      <span className="text-sm text-ink-dim">{hint}</span>
      {note && <span className="font-mono text-xs text-ink-faint">{note}</span>}
      {command && <CopyableCommand command={command} />}
      {runnerNote && (
        <span className="text-xs text-ink-faint">{runnerNote}</span>
      )}
    </div>
  )
}
