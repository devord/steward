import { useEffect } from "react"

import { cn } from "~/lib/utils"

/**
 * Escape inside the artifact never reaches the parent: the iframe is sandboxed
 * with a null origin, so its keydowns fire in its own document and Base UI's
 * dialog handler (which listens on the parent) can't see them. The bridge
 * forwards Escape back out via postMessage — the only channel a no-same-origin
 * sandbox leaves open — so the key closes any dialog whether focus sits on the
 * chrome or inside the artifact.
 */
export const CLOSE_MESSAGE = "steward:lightbox:close"
export const ESCAPE_BRIDGE = `<script>document.addEventListener("keydown",function(e){if(e.key==="Escape"){e.preventDefault();parent.postMessage(${JSON.stringify(
  CLOSE_MESSAGE,
)},"*")}})</script>`

/**
 * Listen for the escape bridge's postMessage while `open`, translating it into
 * the same close the dialog chrome triggers. Any dialog that mounts a
 * {@link SandboxedArtifact} pairs it with this hook.
 */
export function useArtifactEscape(open: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!open) return
    const onMessage = (event: MessageEvent) => {
      if (event.data === CLOSE_MESSAGE) onClose()
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [open, onClose])
}

/**
 * The one full-size artifact surface: a published HTML file rendered in a
 * sandboxed iframe (ADR-0002/0028). `html` is already theme-injected and
 * framed for the "full" view (frameArtifactHtml); this appends the escape
 * bridge and sets the sandbox flags — the security contract that lets a link
 * open a real tab (`allow-popups*`) while the network, same-origin, and
 * in-frame navigation stay blocked. Kept in one place so both the board
 * lightbox and the version dialogs can never drift on those flags.
 */
export function SandboxedArtifact({
  html,
  title,
  className,
}: {
  html: string
  title: string
  className?: string
}) {
  return (
    <iframe
      srcDoc={html + ESCAPE_BRIDGE}
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
      title={title}
      className={cn("w-full border-0 bg-bg1", className)}
    />
  )
}
