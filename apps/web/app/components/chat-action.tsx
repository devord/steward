import { Check, MessageSquare } from "lucide-react"
import { useState } from "react"

import { Button } from "~/components/ui/button"
import { artifactContextMessage } from "../lib/artifact-context.ts"
import { useT } from "../lib/i18n.tsx"

/**
 * Hand the artifact's briefing to Claude (ADR-0043).
 *
 * A widget is a compressed view — 15 of 61 rows, a bar standing in for 200
 * tickets — so acting on what it shows has meant restating it by hand. This
 * copies the fuller markdown the run already wrote, paste-ready.
 *
 * Rendered only when the artifact carries a block: the convention is a
 * SHOULD, and a button that copies nothing is worse than no button.
 *
 * Its own module rather than a corner of widget-card because the lightbox
 * needs it too, and widget-card already imports the lightbox.
 */
export function ChatAction({
  name,
  ranLabel,
  context,
  className,
}: {
  name: string
  ranLabel: string
  context: string
  /** The tile bar reveals it on hover; the lightbox shows it outright. */
  className?: string
}) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={t("widget.chat", { name })}
      title={copied ? t("widget.chatCopied") : t("widget.chatShort")}
      className={className}
      // Host-side and same-origin, so the plain async clipboard works — none
      // of the hidden-textarea fallback the artifact's own copy buttons need
      // from inside the sandbox.
      onClick={() => {
        void navigator.clipboard.writeText(
          artifactContextMessage(context, { name, ranLabel }),
        )
        setCopied(true)
        window.setTimeout(() => setCopied(false), 2500)
      }}
    >
      {copied ? <Check className="text-green" /> : <MessageSquare />}
    </Button>
  )
}
