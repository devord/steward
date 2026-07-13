import { useEffect } from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { X } from "lucide-react"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { DialogOverlay } from "~/components/ui/dialog"
import { cn } from "~/lib/utils"
import { useT } from "../lib/i18n.tsx"

/**
 * Escape inside the artifact never reaches the parent: the iframe is
 * sandboxed with a null origin, so its keydowns fire in its own document and
 * Base UI's dialog handler (which listens on the parent) can't see them. This
 * appended listener forwards Escape back out via postMessage — the only
 * channel a no-same-origin sandbox leaves open — so the key closes the
 * lightbox whether focus sits on the chrome or inside the artifact.
 */
const CLOSE_MESSAGE = "steward:lightbox:close"
const ESCAPE_BRIDGE = `<script>document.addEventListener("keydown",function(e){if(e.key==="Escape"){e.preventDefault();parent.postMessage(${JSON.stringify(
  CLOSE_MESSAGE,
)},"*")}})</script>`

export interface WidgetLightboxProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Routine display name — the panel's accessible title. */
  name: string
  slug: string
  /** Theme-injected artifact HTML framed for the full view — no tile
      overflow guard, so the page scrolls to every row (ADR-0019). */
  html: string
  /** "ran 2h ago" / "never ran" — the same freshness readout as the card. */
  ranLabel: string
  stale: boolean
}

/**
 * The artifact at full size. A widget cell shows the KPI essence; this
 * renders the same published file — sandboxed and theme-injected the same way
 * (ADR-0002/0009) — in a full-viewport iframe so every line of data is
 * legible. No new tab, so the theme and the no-network sandbox both survive
 * the zoom. It's a second, fresh iframe (the cell's stays put); the artifact
 * is a self-contained, statelessly-regenerated report, so there is no
 * in-frame session state to carry over.
 *
 * Base UI's Dialog carries the modal mechanics: focus trap, scroll lock,
 * backdrop dismiss, and focus restoration to the trigger on close. Escape is
 * split — Base UI handles it on the chrome, the bridge above on the iframe.
 */
export function WidgetLightbox({
  open,
  onOpenChange,
  name,
  slug,
  html,
  ranLabel,
  stale,
}: WidgetLightboxProps) {
  const t = useT()
  // The artifact can't call onOpenChange directly; it posts CLOSE_MESSAGE and
  // we translate that into the same close the chrome triggers.
  useEffect(() => {
    if (!open) return
    const onMessage = (event: MessageEvent) => {
      if (event.data === CLOSE_MESSAGE) onOpenChange(false)
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [open, onOpenChange])

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogOverlay />
        <DialogPrimitive.Popup
          data-slot="widget-lightbox"
          // Fills the viewport minus a margin, capped so the artifact reads
          // like a page — not stretched edge-to-edge — on ultrawide monitors.
          // `translate` (centering) and `transform` (zoom animation) are
          // separate CSS properties, so they compose without fighting.
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
            <div className="ml-auto flex shrink-0 items-center gap-2 font-mono text-ink-dim">
              {stale && (
                <Badge
                  variant="secondary"
                  className="h-[18px] border-yellow/45 bg-yellow/10 px-1.5 font-mono text-xs text-ink"
                  title={t("widget.staleTitle")}
                >
                  {t("widget.stale")}
                </Badge>
              )}
              <span className="tabular-nums">{ranLabel}</span>
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
          <iframe
            srcDoc={html + ESCAPE_BRIDGE}
            sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
            title={name}
            className="min-h-0 w-full flex-1 border-0 bg-bg1"
          />
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
