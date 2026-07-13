import { useEffect, useMemo, useState } from "react"
import { useFetcher } from "react-router"

import type { Routine, Widget, WidgetSize } from "@steward/schema"
import { GRID_MAX_COLS, GRID_MAX_ROWS, routineHost } from "@steward/schema"
import {
  Check,
  Copy,
  Maximize2,
  Pencil,
  Power,
  PowerOff,
  RefreshCw,
  X,
} from "lucide-react"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"
import { cssVars } from "../lib/css.ts"
import type { ArtifactInfo } from "../lib/dashboard.server.ts"
import { useT } from "../lib/i18n.tsx"
import {
  claudeRoutineUrl,
  setupCommands,
  type WidgetStatus,
  widgetStatus,
} from "../lib/routine-status.ts"
import { artifactFontStyle, frameArtifactHtml } from "../lib/theme.ts"
import { agoParts } from "../lib/time.ts"
import { useResolvedTheme } from "../lib/use-appearance.ts"
import type { DragKind, GridDrag } from "../lib/use-grid-drag.ts"
import type { RunResult } from "../routes/run.ts"
import { WidgetLightbox } from "./widget-lightbox.tsx"

// The chrome mono, inlined for the sandboxed iframes (ADR-0031): the frame
// has an opaque origin, so a URL-based @font-face would be blocked as a
// cross-origin fetch — the data URI ships the face with the document. Latin
// subset only (~30 kB base64, in-memory per frame, never published).
import geistMonoWoff2 from "@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2?inline"

const ARTIFACT_FONT_STYLE = artifactFontStyle(geistMonoWoff2)

export interface WidgetCardProps {
  widget: Widget
  routine: Routine
  artifact: ArtifactInfo | undefined
  now: number
  /** The board's column count — bounds keyboard resize (defaults to the
      grid ceiling for standalone renders like tests). */
  columns?: number
  /** Which data repo this card's board lives in — enables the Update action
      (ADR-0016). Standalone renders (tests) omit it and get no Update
      control. */
  dataRepo?: string
  /** The board's repo isn't the viewer's home repo — shared-repo cards note
      when a routine's runner differs from the viewer (ADR-0023). */
  shared?: boolean
  /** The signed-in login — shared boards note when a routine's runner differs. */
  login?: string
  /** Is the routine synced (on the server), not just added in the draft?
      Drives the "in your draft — sync it" empty state. Defaults true for
      standalone renders. */
  committed?: boolean
  /** When set, a run fired at this epoch hasn't published yet — the tile shows
      the running indicator and the update control steps aside (ADR-0016). */
  pendingFiredAt?: number | null
  /** Called when the update button successfully fires a cloud run. */
  onFired?: () => void
  /** Edit mode: drag to move, corner handle to resize, × to remove. */
  editing?: boolean
  /** Open the routine editor for this card (edit-mode title bar pencil). */
  onEdit?: () => void
  /** Flip the routine's `enabled` flag — powers the edit-mode toggle and the
      disabled tile's Enable button. A disabled routine never runs (ADR-0016);
      this is the only in-app way back on (or off). */
  onToggleEnabled?: () => void
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
 * artifact in a sandboxed srcdoc iframe (scripts allowed, links escape to
 * real tabs — ADR-0028 — no same-origin, no network — ADR-0002), and a
 * placeholder when nothing was ever published.
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
  dataRepo,
  shared = false,
  login,
  committed = true,
  pendingFiredAt = null,
  onFired,
  editing = false,
  onEdit,
  onToggleEnabled,
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
    () =>
      artifact?.html
        ? frameArtifactHtml(artifact.html, theme, "tile", ARTIFACT_FONT_STYLE)
        : null,
    [artifact?.html, theme],
  )
  // The lightbox is the full-data surface (ADR-0019): same artifact, framed
  // without the tile overflow guard so every row is reachable by scrolling.
  const fullHtml = useMemo(
    () =>
      artifact?.html
        ? frameArtifactHtml(artifact.html, theme, "full", ARTIFACT_FONT_STYLE)
        : null,
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
              ...(drag.sizePx.width != null && { width: drag.sizePx.width }),
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
            {onToggleEnabled && (
              /* Enable/disable lives here because `enabled` isn't a form field
                 in the editor — the toggle is the only in-app way to flip a
                 committed routine on or off. A disabled routine never runs, so
                 the "off" icon stays lit (not hover-only) to read at a glance. */
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={t(
                  routine.enabled ? "routine.disable" : "routine.enable",
                  { name: routine.name },
                )}
                title={t(
                  routine.enabled ? "routine.disable" : "routine.enable",
                  { name: routine.name },
                )}
                className={cn(
                  "ml-auto size-5 shrink-0 hover:bg-bg3 hover:text-foreground pointer-coarse:size-7",
                  routine.enabled ? "text-ink-dim" : "text-primary",
                )}
                onClick={() => onToggleEnabled()}
              >
                {routine.enabled ? <PowerOff /> : <Power />}
              </Button>
            )}
            {onEdit && (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={t("routine.edit", { name: routine.name })}
                title={t("routine.edit", { name: routine.name })}
                className={cn(
                  "size-5 shrink-0 text-ink-dim hover:bg-bg3 hover:text-foreground pointer-coarse:size-7",
                  onToggleEnabled ? "" : "ml-auto",
                )}
                onClick={() => onEdit()}
              >
                <Pencil />
              </Button>
            )}
            <span
              className={cn(
                "shrink-0 pr-1 font-mono tabular-nums",
                onEdit || onToggleEnabled ? "" : "ml-auto",
                // Red while an invalid drop is pending — on the narrow grids
                // this readout is the only collision signal (no ghost cell).
                resizing
                  ? drag.valid
                    ? "text-primary"
                    : "text-destructive"
                  : "text-ink-dim",
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
             layout shift on reveal. The name is the board's two-second glance
             target, so it rides a step above the 12px metadata floor in the
             mono terminal voice; state reads as pills, not prose (ADR-0009). */
          <header className="flex min-h-8 items-center gap-2 border-b border-border-dim py-1.5 pr-2.5 pl-2.5">
            <span className="min-w-0 truncate font-mono text-sm font-medium text-foreground">
              {routine.name}
            </span>
            <div className="ml-auto flex shrink-0 items-center gap-1.5 font-mono text-xs text-ink-dim">
              {/* The Update control is a re-run affordance; while a run is in
                  flight it can't fire and the "Running" readout already owns
                  the state, so it steps aside — one run glyph per card, never
                  a disabled refresh arrow beside the running one. Same rule
                  when the empty state shows the run-now button (ready-*):
                  one affordance per action. */}
              {dataRepo != null &&
                routine.enabled &&
                !running &&
                status.kind !== "ready-manual" &&
                status.kind !== "ready-scheduled" && (
                  <UpdateAction
                    routine={routine}
                    dataRepo={dataRepo}
                    onFired={onFired}
                    forceVisible={status.kind !== "live"}
                  />
                )}
              {/* Open the routine editor. Config (name, schedule, params) is
                  a routines.yaml draft, not a layout edit, so it lives here in
                  view mode — edit mode stays purely layout. Also kept in the
                  edit-mode bar for reach while rearranging. */}
              {onEdit && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("routine.edit", { name: routine.name })}
                  title={t("routine.edit", { name: routine.name })}
                  className={cn(BAR_ACTION, "opacity-0")}
                  onClick={() => onEdit()}
                >
                  <Pencil />
                </Button>
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
              <span className="flex items-center gap-1.5">
                {running ? (
                  /* When the trigger file gave us the cloud routine's id, the
                     pill links to its claude.ai page — the only place to watch
                     the in-flight run. Without an id (local routine, legacy
                     trigger) it stays a plain readout. */
                  <StatusPill
                    tone="running"
                    title={
                      artifact?.routineId != null
                        ? t("widget.runningTitle")
                        : t("widget.running")
                    }
                    href={
                      artifact?.routineId != null
                        ? claudeRoutineUrl(artifact.routineId)
                        : undefined
                    }
                  >
                    <span
                      aria-hidden
                      className="run-pulse size-1.5 shrink-0 rounded-full bg-primary"
                    />
                    {t("widget.running")}
                  </StatusPill>
                ) : (
                  <>
                    {stale && (
                      <StatusPill tone="stale" title={t("widget.staleTitle")}>
                        {t("widget.stale")}
                      </StatusPill>
                    )}
                    {manual && (
                      <StatusPill
                        tone="neutral"
                        title={t("widget.manualTitle")}
                      >
                        {t("widget.manual")}
                      </StatusPill>
                    )}
                    <span className="tabular-nums">{ranLabel}</span>
                  </>
                )}
              </span>
            </div>
          </header>
        )}
        {html ? (
          <iframe
            srcDoc={html}
            sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
            title={routine.name}
            loading="lazy"
            className="min-h-0 w-full flex-1 border-0"
          />
        ) : (
          <WidgetEmptyState
            status={status}
            routine={routine}
            shared={shared}
            dataRepo={dataRepo}
            login={login}
            now={now}
            onFired={onFired}
            onEnable={onToggleEnabled}
          />
        )}
        {editing && (
          <>
            {/* Drag surface: covers the artifact (iframes swallow pointer
              events) but sits under the title bar and resize handle. Remove
              lives in the bar so no control ever floats over the
              artifact — content stays clean while dragging. Move only exists
              on the full ≥1100px grid, so below it the surface keeps
              touch-action free — a finger on the card must still pan the
              page in edit mode. */}
            <div
              aria-hidden
              className={cn(
                "absolute inset-0 z-10 min-[1100px]:touch-none",
                drag?.kind === "move"
                  ? "min-[1100px]:cursor-grabbing"
                  : "min-[1100px]:cursor-grab",
              )}
              onPointerDown={(event) => onDragStart?.("move", event)}
            />
            {/* Corner resize handle — hidden mid-move so the lifted card is
              just artifact + footer. The pointer target is a padded hitbox
              around the small L-shaped visual so a finger can grab it. */}
            {drag?.kind !== "move" && (
              <div
                aria-hidden
                className="group/resize absolute right-0 bottom-0 z-30 flex cursor-nwse-resize touch-none items-end justify-end p-[3px] pointer-coarse:pt-7 pointer-coarse:pl-7"
                onPointerDown={(event) => onDragStart?.("resize", event)}
              >
                <div
                  className={cn(
                    "size-3.5 rounded-br-[5px] border-r-2 border-b-2",
                    resizing
                      ? "border-primary"
                      : "border-ink-dim group-hover/resize:border-primary",
                  )}
                />
              </div>
            )}
          </>
        )}
      </article>
      {fullHtml && (
        <WidgetLightbox
          open={expanded}
          onOpenChange={setExpanded}
          name={routine.name}
          slug={routine.slug}
          html={fullHtml}
          ranLabel={ranLabel}
          stale={stale}
        />
      )}
    </>
  )
}

/**
 * One title-bar state pill — the tile's tag vocabulary. Compact, mono, one
 * step tighter than the base Badge. Tones are the only semantic color the
 * chrome spends here: accent for a live run, yellow for staleness, a neutral
 * well for descriptors like "manual" (DESIGN.md — color only when it means
 * something, so a fresh tile carries no pill at all).
 */
function StatusPill({
  tone,
  title,
  href,
  children,
}: {
  tone: "running" | "stale" | "neutral"
  title?: string
  /** Renders the pill as an external link (new tab) — e.g. the running pill
      pointing at the claude.ai routine page. */
  href?: string
  children: React.ReactNode
}) {
  return (
    <Badge
      variant="secondary"
      title={title}
      render={
        href != null ? (
          <a href={href} target="_blank" rel="noreferrer" />
        ) : undefined
      }
      className={cn(
        "h-[18px] gap-1 border px-1.5 font-mono text-xs font-normal",
        tone === "running" && "border-primary/40 bg-primary/10 text-primary",
        tone === "stale" && "border-yellow/45 bg-yellow/10 text-ink",
        tone === "neutral" && "border-border-dim bg-bg2 text-ink-dim",
        href != null && "hover:border-primary hover:bg-primary/20",
      )}
    >
      {children}
    </Badge>
  )
}

/** The reveal-on-hover title-bar action style the expand + update buttons share. */
const BAR_ACTION =
  "size-5 shrink-0 text-ink-dim transition-opacity hover:bg-bg3 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:size-7 pointer-coarse:opacity-100"

/** Shared fire plumbing for the run controls (ADR-0016): submit to /run and
    tell the board when a fire lands so it can start the running state. */
function useFireRoutine(
  routine: Routine,
  dataRepo: string,
  onFired?: () => void,
) {
  const fetcher = useFetcher<RunResult>()

  // Depend on the fetcher.data object (a fresh response each submit), not a
  // derived boolean — otherwise a second successful run of the same widget
  // leaves the boolean at true and the effect never re-runs.
  useEffect(() => {
    if (fetcher.data?.ok === true) onFired?.()
  }, [fetcher.data, onFired])

  return {
    fire: () => {
      void fetcher.submit(
        { repo: dataRepo, slug: routine.slug },
        { method: "post", action: "/run", encType: "application/json" },
      )
    },
    busy: fetcher.state !== "idle",
    result: fetcher.data,
  }
}

/**
 * The Update control (ADR-0016). Cloud routines fire their runner-owned API
 * trigger server-side (/run) — the server reads the trigger token from the
 * data repo with the clicker's GitHub token, so repo read access is the
 * whole entitlement. Local routines have no cloud resource to poke: the
 * button degrades honestly to copying the terminal one-liner.
 */
function UpdateAction({
  routine,
  dataRepo,
  forceVisible = false,
  onFired,
}: {
  routine: Routine
  dataRepo: string
  /** Keep the button visible (not hover-only) — for tiles with no artifact
      or a missing trigger, where it's the primary affordance. */
  forceVisible?: boolean
  onFired?: () => void
}) {
  const t = useT()
  const { fire, busy, result } = useFireRoutine(routine, dataRepo, onFired)
  const [copied, setCopied] = useState(false)

  if (routineHost(routine) === "local") {
    // Works without a steward checkout — the raw pointer prompt (ADR-0005).
    // Always name the repo: with N data repos (ADR-0023) "the" data repo is
    // ambiguous, so every command is explicit.
    const command = `claude "Run the steward routine \`${routine.slug}\` in \`${dataRepo}\` — follow the run-routine skill."`
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

  const status =
    result == null
      ? null
      : result.ok
        ? t("widget.updateRequested")
        : result.error === "no-trigger"
          ? t("widget.updateNoTrigger", { slug: routine.slug })
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
        BAR_ACTION,
        busy || status != null || forceVisible ? "opacity-100" : "opacity-0",
        result != null && !result.ok && "text-destructive",
      )}
      onClick={fire}
    >
      {result?.ok ? (
        <Check />
      ) : (
        // Spins only for this button's own in-flight submit; the moment the
        // fire lands the tile flips to Running and this control unmounts, so
        // the spinning arrow hands off to the header's run dot — never both.
        <RefreshCw className={cn(busy && "animate-spin")} />
      )}
      <span role="status" className="sr-only">
        {status ?? ""}
      </span>
    </Button>
  )
}

/**
 * The never-run tile's primary affordance (ADR-0016): a real button that
 * fires the routine's API trigger, so the user confirms the pipeline works
 * in a minute instead of waiting on the cron. Rendered only when the
 * trigger exists (ready-* states) — never a dead end — and it owns the
 * action: the title-bar refresh icon steps aside while it is shown.
 */
function RunNowButton({
  routine,
  dataRepo,
  label,
  onFired,
}: {
  routine: Routine
  dataRepo: string
  label: string
  onFired?: () => void
}) {
  const t = useT()
  const { fire, busy, result } = useFireRoutine(routine, dataRepo, onFired)
  const error =
    result != null && !result.ok
      ? result.error === "no-trigger"
        ? t("widget.updateNoTrigger", { slug: routine.slug })
        : t("widget.updateFailed")
      : null
  return (
    <>
      <Button disabled={busy} onClick={fire}>
        <RefreshCw className={cn(busy && "animate-spin")} />
        {label}
      </Button>
      <span
        role="status"
        className={cn("text-xs text-destructive", !error && "sr-only")}
      >
        {error ?? ""}
      </span>
    </>
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
      className="flex max-w-full cursor-pointer items-center gap-1.5 rounded border border-border-dim bg-bg px-1.5 py-1 font-mono text-xs text-ink-dim transition-colors hover:border-primary hover:text-foreground"
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
  shared = false,
  dataRepo,
  login,
  now,
  onFired,
  onEnable,
}: {
  status: WidgetStatus
  routine: Routine
  /** The board's repo isn't the viewer's home repo (ADR-0023). */
  shared?: boolean
  /** Repo slug of the board's data repo — makes setup commands
      copy-pasteable (`--repo` instead of a --file placeholder). Absent on
      standalone renders (tests), which can't fire runs. */
  dataRepo?: string
  login?: string
  now: number
  /** Called when the run-now button successfully fires a cloud run. */
  onFired?: () => void
  /** Flip the routine back on — the disabled tile's escape hatch. */
  onEnable?: () => void
}) {
  const t = useT()
  const cmds = setupCommands(routine, dataRepo)
  const local = routineHost(routine) === "local"
  const manual = routine.schedule == null

  let hint: React.ReactNode = null
  let command: string | null = null
  let note: string | null = null
  let cta: string | null = null

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
      // The trigger exists, so the run affordance is a real button in the
      // body — not prose pointing at the title-bar icon. Standalone renders
      // (no repo) can't fire and keep the prose.
      if (dataRepo != null) cta = t("widget.runNow")
      else hint = t("widget.readyManual")
      break
    case "ready-scheduled":
      // Enacted and armed: offer the first run now so the user confirms the
      // pipeline works in a minute instead of waiting on the cron — which
      // stays the no-cost fallback.
      if (dataRepo != null) {
        cta = t("widget.runFirst")
        note = t("widget.orWaitSchedule", { cron: routine.schedule ?? "" })
      } else {
        hint = t("widget.firstRunSchedule", { cron: routine.schedule ?? "" })
      }
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

  // Shared boards: the cloud resource belongs to the runner, so name who must act.
  const runnerNote =
    shared &&
    routine.runner != null &&
    login != null &&
    routine.runner !== login
      ? t("widget.runnerNote", { runner: routine.runner })
      : null

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 p-3 text-center">
      {status.kind === "running" && (
        <span
          aria-hidden
          className="run-pulse size-2 shrink-0 rounded-full bg-primary"
        />
      )}
      <span className="font-mono text-xs text-ink-dim">{routine.slug}</span>
      {hint && <span className="text-sm text-ink-dim">{hint}</span>}
      {/* A disabled tile is otherwise a dead end — offer the way back on
          right here, so re-enabling doesn't mean hunting through edit mode or
          hand-editing routines.yaml. */}
      {status.kind === "disabled" && onEnable && (
        <Button variant="outline" onClick={() => onEnable()}>
          <Power />
          {t("widget.enable")}
        </Button>
      )}
      {cta && dataRepo != null && (
        <RunNowButton
          routine={routine}
          dataRepo={dataRepo}
          label={cta}
          onFired={onFired}
        />
      )}
      {note && <span className="font-mono text-xs text-ink-faint">{note}</span>}
      {command && <CopyableCommand command={command} />}
      {runnerNote && (
        <span className="text-xs text-ink-faint">{runnerNote}</span>
      )}
    </div>
  )
}
