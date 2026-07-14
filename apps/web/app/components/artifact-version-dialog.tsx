import { useMemo } from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { ExternalLink, X } from "lucide-react"

import { Button } from "~/components/ui/button"
import { DialogOverlay } from "~/components/ui/dialog"
import { cn } from "~/lib/utils"
import { useT, type Translate } from "../lib/i18n.tsx"
import { frameArtifactHtml } from "../lib/theme.ts"
import { agoParts } from "../lib/time.ts"
import { useResolvedTheme } from "../lib/use-appearance.ts"
import { ARTIFACT_FONT_STYLE } from "../lib/artifact-font.ts"
import { SandboxedArtifact, useArtifactEscape } from "./artifact-frame.tsx"

/** One version's fetch state — the resource route body, or where it is in the
    round trip. Kept dumb: the runs view owns the cache, the dialog just paints. */
export type VersionState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ok"; html: string | null }

export interface VersionPane {
  sha: string
  /** ISO commit date of the run that published this version. */
  at: string
  state: VersionState
}

/**
 * A run's artifact at full size — the same sandboxed, theme-injected render
 * the board lightbox shows (ADR-0002/0028), but pulled from the artifacts
 * branch at a past commit so any run can be browsed. Given two panes it splits
 * the surface, older left / newer right, for a side-by-side of what the render
 * looked like then versus now; the raw text diff stays one click away on
 * GitHub (`diffHref`), where git already renders it.
 */
export function ArtifactVersionDialog({
  open,
  onOpenChange,
  name,
  slug,
  panes,
  now,
  diffHref,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Routine display name — the dialog's accessible title. */
  name: string
  slug: string
  /** One pane to browse, or two (older, newer) to compare. */
  panes: VersionPane[]
  now: number
  /** GitHub compare URL for the two panes — the text-diff escape hatch. */
  diffHref?: string
}) {
  const t = useT()
  // The artifact posts CLOSE_MESSAGE from inside its sandbox; the bridge hook
  // turns that into the same close the chrome triggers.
  useArtifactEscape(open, () => onOpenChange(false))
  const compare = panes.length > 1

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogOverlay />
        <DialogPrimitive.Popup
          data-slot="artifact-version-dialog"
          className={cn(
            "fixed inset-y-3 left-1/2 z-50 flex -translate-x-1/2 flex-col overflow-hidden rounded-lg border bg-card ring-1 ring-foreground/10 outline-none sm:inset-y-6",
            "w-[calc(100%-1.5rem)] max-w-[1500px] sm:w-[calc(100%-3rem)]",
            "duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          )}
        >
          <header className="flex shrink-0 items-center gap-2 border-b border-border-dim bg-bg2 py-1.5 pr-1.5 pl-3 text-xs">
            <DialogPrimitive.Title className="truncate text-sm text-foreground">
              {name}
            </DialogPrimitive.Title>
            <span
              aria-hidden
              className="hidden truncate font-mono text-ink-dim sm:inline"
            >
              {slug}
            </span>
            <div className="ml-auto flex shrink-0 items-center gap-3 font-mono text-ink-dim">
              {compare && diffHref != null && (
                <a
                  href={diffHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 underline decoration-dotted underline-offset-2 outline-none hover:text-foreground focus-visible:text-foreground"
                >
                  <ExternalLink aria-hidden className="size-3.5" />
                  {t("runs.textDiff")}
                </a>
              )}
              <DialogPrimitive.Close
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-ink-dim hover:text-foreground"
                    aria-label={t("widget.collapse")}
                  />
                }
              >
                <X />
              </DialogPrimitive.Close>
            </div>
          </header>

          <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
            {panes.map((pane, index) => (
              <Pane
                key={pane.sha}
                pane={pane}
                name={name}
                now={now}
                t={t}
                // Only compare needs per-pane labels; a lone pane is unlabeled,
                // its timestamp implicit in the run it was opened from.
                role={compare ? (index === 0 ? "older" : "newer") : null}
                // A vertical rule between the two panes (a horizontal one when
                // they stack on narrow screens).
                divide={compare && index === 1}
              />
            ))}
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function Pane({
  pane,
  name,
  now,
  t,
  role,
  divide,
}: {
  pane: VersionPane
  name: string
  now: number
  t: Translate
  role: "older" | "newer" | null
  divide: boolean
}) {
  const theme = useResolvedTheme()
  const framed = useMemo(
    () =>
      pane.state.status === "ok" && pane.state.html != null
        ? frameArtifactHtml(pane.state.html, theme, "full", ARTIFACT_FONT_STYLE)
        : null,
    [pane.state, theme],
  )
  const ago = agoParts(pane.at, now)
  const agoLabel =
    ago.unit === "now" ? t("time.now") : t(`time.${ago.unit}`, { n: ago.n })

  return (
    <section
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col",
        divide && "border-border-dim max-sm:border-t sm:border-l",
      )}
    >
      {role != null && (
        <div className="flex shrink-0 items-baseline gap-2 border-b border-border-dim bg-bg1 px-3 py-1 font-mono text-xs text-ink-dim">
          <span className="rounded border border-border-dim px-1 text-ink-faint">
            {t(role === "older" ? "runs.compareOlder" : "runs.compareNewer")}
          </span>
          <time dateTime={pane.at} title={pane.at} className="tabular-nums">
            {agoLabel}
          </time>
        </div>
      )}
      {framed != null ? (
        <SandboxedArtifact
          html={framed}
          title={name}
          className="min-h-0 flex-1"
        />
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center">
          {pane.state.status === "loading" ? (
            <div role="status" className="w-full max-w-sm space-y-2">
              <span className="sr-only">{t("runs.versionLoading")}</span>
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-4 animate-pulse rounded bg-bg3" />
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-dim">
              {pane.state.status === "error"
                ? t("runs.versionError")
                : t("runs.versionGone")}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
