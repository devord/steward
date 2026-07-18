import { useEffect, useMemo, useRef, useState } from "react"
import { useFetcher } from "react-router"

import type { Routine, Widget } from "@steward/schema"
import { routineHost } from "@steward/schema"
import {
  Check,
  Copy,
  Maximize2,
  MoreHorizontal,
  Pencil,
  Power,
  PowerOff,
  RefreshCw,
  X,
} from "lucide-react"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { cn } from "~/lib/utils"
import type { ArtifactInfo } from "../lib/dashboard.server.ts"
import { useT } from "../lib/i18n.tsx"
import {
  claudeRoutineUrl,
  setupCommands,
  type WidgetStatus,
  widgetStatus,
} from "../lib/routine-status.ts"
import { ARTIFACT_FONT_STYLE } from "../lib/artifact-font.ts"
import { frameArtifactHtml } from "../lib/theme.ts"
import { agoParts } from "../lib/time.ts"
import { useResolvedTheme } from "../lib/use-appearance.ts"
import type { RunResult } from "../routes/run.ts"
import { WidgetLightbox } from "./widget-lightbox.tsx"
import { WidgetSkeletonBody } from "./widget-skeleton.tsx"

export interface WidgetCardProps {
  widget: Widget
  routine: Routine
  artifact: ArtifactInfo | undefined
  now: number
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
  /** Open the Sync panel — powers the draft tile's "Sync to commit" button,
      the same action as the header's unsynced chip (ADR-0003). */
  onSync?: () => void
  /** Edit mode: drag the title bar to move (ADR-0041), corner handle to
      resize, × to remove. The grid (react-grid-layout) owns the drag/resize
      mechanics; the card only supplies the drag-handle surface and the ×. */
  editing?: boolean
  /** Open the routine editor for this card (edit-mode title bar pencil). */
  onEdit?: () => void
  /** Flip the routine's `enabled` flag — powers the edit-mode toggle and the
      disabled tile's Enable button. A disabled routine never runs (ADR-0016);
      this is the only in-app way back on (or off). */
  onToggleEnabled?: () => void
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
  dataRepo,
  shared = false,
  login,
  committed = true,
  pendingFiredAt = null,
  onFired,
  onSync,
  editing = false,
  onEdit,
  onToggleEnabled,
  onRemove,
}: WidgetCardProps) {
  const t = useT()
  const theme = useResolvedTheme()
  const [expanded, setExpanded] = useState(false)
  const [painted, setPainted] = useState(false)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const { size } = widget
  // The veil lifts when the artifact reports real content (the tile guard's
  // "steward:tile-painted" message, matched by source — an opaque-origin
  // sandbox has no origin to check). `onLoad` alone lied: big or script-built
  // artifacts finish loading long before they have anything to show, and the
  // unveiled flush-bg document reads as a void.
  useEffect(() => {
    if (painted) return
    const onMessage = (e: MessageEvent<unknown>) => {
      const data = e.data
      if (
        e.source != null &&
        e.source === frameRef.current?.contentWindow &&
        typeof data === "object" &&
        data !== null &&
        "type" in data &&
        data.type === "steward:tile-painted"
      ) {
        setPainted(true)
      }
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [painted])
  // The signed-in viewer resolves person-relative content at render time
  // (ADR-0039): repo-pulse's "needs your review" / "yours" enhance against
  // this login instead of the routine runner's. Absent on standalone renders
  // → the artifact stays viewer-neutral.
  const html = useMemo(
    () =>
      artifact?.html
        ? frameArtifactHtml(
            artifact.html,
            theme,
            "tile",
            ARTIFACT_FONT_STYLE,
            login ? { login } : undefined,
          )
        : null,
    [artifact?.html, theme, login],
  )
  // The lightbox is the full-data surface (ADR-0019): same artifact, framed
  // without the tile overflow guard so every row is reachable by scrolling.
  const fullHtml = useMemo(
    () =>
      artifact?.html
        ? frameArtifactHtml(
            artifact.html,
            theme,
            "full",
            ARTIFACT_FONT_STYLE,
            login ? { login } : undefined,
          )
        : null,
    [artifact?.html, theme, login],
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

  // One eligibility check shared by the fine-pointer UpdateAction and the
  // touch menu's Update item — see the UpdateAction comment for the "one run
  // affordance per card" rule it encodes.
  const updateEligible =
    dataRepo != null &&
    routine.enabled &&
    !running &&
    status.kind !== "ready-manual" &&
    status.kind !== "ready-scheduled"

  return (
    <>
      <article
        className={cn(
          // `isolate` keeps the card's internal z-layering (edit-mode header
          // z-20, resize handle z-30) inside its own stacking context. Without
          // it the article isn't a stacking context in the static edit state,
          // so the header's z-20 leaks to the root and — tying the app header's
          // own z-20 but later in the DOM — paints over the sticky page header
          // when a tall card scrolls up under it.
          "group relative isolate flex size-full flex-col overflow-hidden rounded-lg border",
          // The widget reads as a section of the page, not an elevated card:
          // the artifact is repainted flush to the board (TILE_FLUSH_STYLE) and
          // the title/freshness float frameless over it (see the view header),
          // so the border is the widget's *only* frame. View mode reveals that
          // border on hover/focus — the cell tracing back into a thing you act
          // on; edit mode keeps it lit, since there you handle widgets as
          // tangible objects. No surface fill in either mode (the flush artifact
          // is the surface). The border is present-but-transparent at rest so
          // revealing it never shifts layout. `hover:`/`focus-within:` sit on
          // the article itself (not `group-hover:`, which only styles a group's
          // *descendants* — an element is never its own descendant, so it would
          // never fire on the article that carries the class).
          editing
            ? "border-border"
            : "border-transparent transition-colors hover:border-border focus-within:border-border",
        )}
      >
        {editing ? (
          /* Edit-mode title bar: doubles as react-grid-layout's drag handle
             (`.widget-drag-handle`, ADR-0041) — grab it to move the card. Its
             buttons are excluded from the drag via the grid's `cancel`
             selector. Controls live in the bar, never floating over the
             artifact; resize is RGL's own corner grip. */
          <header className="widget-drag-handle relative z-20 flex items-center gap-1.5 border-b bg-bg2 py-1 pr-2.5 pl-1 text-xs">
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
                "shrink-0 pr-1 font-mono tabular-nums text-ink-dim",
                onEdit || onToggleEnabled ? "" : "ml-auto",
              )}
            >
              {size.cols}×{size.rows}
            </span>
          </header>
        ) : (
          /* View-mode section header: name (left), then a right-aligned cluster
             of hover-revealed actions followed by the freshness/state readout.
             Frameless — no divider, no fill — so it reads as a heading over the
             board rather than a widget's title bar, floating above the bg1
             content panel below. Freshness and state stay put at rest (the
             product's core signal, glanceable in two seconds); only the actions
             reveal on hover. Actions sit *before* the readout so the timestamp
             stays pinned to the card's edge (symmetric with the title inset)
             and the reserved action width is absorbed by the flex gap — no idle
             dead space, no layout shift on reveal. The name is the board's
             two-second glance target and each widget is a section of the page,
             so it sits at the section-heading tier (16px mono semibold) and
             owns the top of the cell — a full step above the 13px freshness
             beside it, which stays quiet in ink-dim. Whitespace and that
             weight/size jump are the block's separation; there is no divider.
             State reads as pills, not prose (ADR-0009). */
          <header className="flex min-h-8 items-center gap-2 py-1.5 pr-2.5 pl-2.5">
            <span className="min-w-0 truncate font-mono text-base font-semibold text-foreground">
              {routine.name}
            </span>
            <div className="ml-auto flex shrink-0 items-center gap-1.5 font-mono text-xs text-ink-dim">
              {/* The Update control is a re-run affordance; while a run is in
                  flight it can't fire and the "Running" readout already owns
                  the state, so it steps aside — one run glyph per card, never
                  a disabled refresh arrow beside the running one. Same rule
                  when the empty state shows the run-now button (ready-*):
                  one affordance per action. */}
              {updateEligible && dataRepo != null && (
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
                (fine pointers); on touch it lives in the ⋯ menu below. The
                reserved slot means no layout shift on reveal. */}
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
              {/* Touch: the three hover-revealed icons above collapse into
                  one ⋯ menu so the title keeps its bar (BAR_ACTION hides
                  them on coarse pointers, this trigger only shows there). */}
              <WidgetTouchMenu
                routine={routine}
                dataRepo={updateEligible ? dataRepo : undefined}
                onEdit={onEdit}
                onExpand={html ? () => setExpanded(true) : undefined}
                onFired={onFired}
              />
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
          /* Eager srcdoc, veiled until first paint. Never `loading="lazy"`
             here: Chromium defers a lazy srcdoc iframe even in-viewport, so
             tiles sat blank until a scroll nudged them. Even eager, the
             document takes a beat to parse — the skeleton body holds the cell
             so a titled void never renders. `painted` latches on first load;
             theme swaps reload the doc in place without re-veiling. */
          <div className="relative min-h-0 w-full flex-1">
            <iframe
              ref={frameRef}
              srcDoc={html}
              sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
              title={routine.name}
              // Fallback latch only: the real unveil is the tile guard's
              // painted message above. The delay covers a guard that never
              // runs (a pathological artifact) without defeating the veil for
              // ones that render just after load.
              onLoad={() => {
                window.setTimeout(() => setPainted(true), 2500)
              }}
              className={cn("size-full border-0", !painted && "opacity-0")}
            />
            {!painted && (
              <WidgetSkeletonBody
                rows={size.rows}
                className="absolute inset-0"
              />
            )}
          </div>
        ) : (
          <WidgetEmptyState
            status={status}
            routine={routine}
            shared={shared}
            dataRepo={dataRepo}
            login={login}
            now={now}
            onFired={onFired}
            onSync={onSync}
            onEnable={onToggleEnabled}
          />
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

/**
 * The reveal-on-hover title-bar action style the expand + update buttons
 * share. Coarse pointers never see these: three always-visible icons crowded
 * the title out of its own bar on phones, so touch gets the single ⋯ menu
 * (WidgetTouchMenu) instead.
 */
const BAR_ACTION =
  "size-5 shrink-0 text-ink-dim transition-opacity hover:bg-bg3 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:hidden"

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
  const [runLocalOpen, setRunLocalOpen] = useState(false)

  if (routineHost(routine) === "local") {
    // A local routine has no cloud resource the board can fire (ADR-0012), so
    // the update control opens the how-to-run-it modal rather than silently
    // copying a command or dead-ending on the cloud "no trigger" message.
    const label = t("widget.runLocalOpen", { name: routine.name })
    return (
      <>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={label}
          title={label}
          className={cn(BAR_ACTION, forceVisible ? "opacity-100" : "opacity-0")}
          onClick={() => setRunLocalOpen(true)}
        >
          <RefreshCw />
        </Button>
        <RunLocallyDialog
          routine={routine}
          dataRepo={dataRepo}
          open={runLocalOpen}
          onOpenChange={setRunLocalOpen}
        />
      </>
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
 * The touch counterpart of the bar's hover-revealed actions: coarse pointers
 * get one ⋯ menu (Update / Edit / Expand) instead of three 20px icons
 * crowding the title out of its own bar — BAR_ACTION hides the individual
 * icons on coarse, this trigger renders only there. The trigger stays a
 * 32px square so the bar keeps its height; the `after` inset extends the
 * touch target past 44px without inflating the visual.
 */
function WidgetTouchMenu({
  routine,
  dataRepo,
  onEdit,
  onExpand,
  onFired,
}: {
  routine: Routine
  /** Present only when the Update action is eligible — mirrors UpdateAction's
      "one run affordance per card" gate in WidgetCard. */
  dataRepo?: string
  onEdit?: () => void
  onExpand?: () => void
  onFired?: () => void
}) {
  if (dataRepo == null && onEdit == null && onExpand == null) return null
  // The fetcher-bearing variant mounts only with a repo to fire against —
  // standalone renders (tests, previews) have no data router, and useFetcher
  // throws outside one. The split keeps the hook unconditional per component.
  return dataRepo != null ? (
    <TouchMenuWithUpdate
      routine={routine}
      dataRepo={dataRepo}
      onEdit={onEdit}
      onExpand={onExpand}
      onFired={onFired}
    />
  ) : (
    <TouchMenuFrame routine={routine} onEdit={onEdit} onExpand={onExpand} />
  )
}

/**
 * The menu plus its Update item. The fire plumbing lives here — a card-lifetime
 * component — not inside the menu popup, which unmounts on close: a run fired
 * from a closing menu must keep its fetcher alive to flip the tile to Running.
 */
function TouchMenuWithUpdate({
  routine,
  dataRepo,
  onEdit,
  onExpand,
  onFired,
}: {
  routine: Routine
  dataRepo: string
  onEdit?: () => void
  onExpand?: () => void
  onFired?: () => void
}) {
  const t = useT()
  const local = routineHost(routine) === "local"
  const { fire, busy } = useFireRoutine(routine, dataRepo, onFired)
  const [runLocalOpen, setRunLocalOpen] = useState(false)
  return (
    <>
      <TouchMenuFrame
        routine={routine}
        onEdit={onEdit}
        onExpand={onExpand}
        updateItem={
          <DropdownMenuItem
            disabled={busy}
            className="min-h-11"
            onClick={() => (local ? setRunLocalOpen(true) : fire())}
          >
            <RefreshCw className={cn(busy && "animate-spin")} />
            {t("widget.updateShort")}
          </DropdownMenuItem>
        }
      />
      {local && (
        <RunLocallyDialog
          routine={routine}
          dataRepo={dataRepo}
          open={runLocalOpen}
          onOpenChange={setRunLocalOpen}
        />
      )}
    </>
  )
}

/** The ⋯ trigger and popup shared by both variants — no router hooks here. */
function TouchMenuFrame({
  routine,
  onEdit,
  onExpand,
  updateItem,
}: {
  routine: Routine
  onEdit?: () => void
  onExpand?: () => void
  updateItem?: React.ReactNode
}) {
  const t = useT()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("widget.menuLabel", { name: routine.name })}
            className="relative hidden size-8 shrink-0 text-ink-dim after:absolute after:-inset-2 hover:bg-bg3 hover:text-foreground aria-expanded:bg-bg3 aria-expanded:text-foreground pointer-coarse:inline-flex"
          />
        }
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={4} className="w-44">
        {updateItem}
        {onEdit && (
          <DropdownMenuItem className="min-h-11" onClick={onEdit}>
            <Pencil />
            {t("widget.editShort")}
          </DropdownMenuItem>
        )}
        {onExpand && (
          <DropdownMenuItem className="min-h-11" onClick={onExpand}>
            <Maximize2 />
            {t("widget.expandShort")}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
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
 * How to run a local routine (ADR-0012): the board can't fire it — it lives on
 * the user's machine — so instead of a dead update button this modal names the
 * two honest ways in. The Steward CLI one-liner, and the raw pointer prompt
 * that works from any Claude Code session without a checkout (ADR-0005). The
 * repo is always named: with N data repos (ADR-0023) "the data repo" is
 * ambiguous, so every command is explicit.
 */
export function RunLocallyDialog({
  routine,
  dataRepo,
  open,
  onOpenChange,
}: {
  routine: Routine
  dataRepo: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useT()
  const cli = setupCommands(routine, dataRepo).runOnce
  const prompt = `claude "Run the steward routine \`${routine.slug}\` in \`${dataRepo}\` — follow the run-routine skill."`
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("widget.runLocalTitle")}</DialogTitle>
          <DialogDescription>
            {t("widget.runLocalDescription", { name: routine.name })}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {cli && (
            <div className="grid gap-2">
              <span className="text-xs font-medium text-ink-dim">
                {t("widget.runLocalCliLabel")}
              </span>
              <CopyableCommand command={cli} />
            </div>
          )}
          <div className="grid gap-2">
            <span className="text-xs font-medium text-ink-dim">
              {t("widget.runLocalPromptLabel")}
            </span>
            <CopyableCommand command={prompt} />
          </div>
        </div>
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
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
  onSync,
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
  /** Open the Sync panel — the draft tile's "Sync to commit" button. */
  onSync?: () => void
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
      {/* A fresh draft's only path forward is committing it — surface that as a
          button here (same action as the header's unsynced chip, ADR-0003)
          instead of prose pointing at the toolbar. */}
      {status.kind === "draft" && onSync && (
        <Button variant="outline" onClick={() => onSync()}>
          <RefreshCw />
          {t("widget.draftSync")}
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
