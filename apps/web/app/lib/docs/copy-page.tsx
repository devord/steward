import { Check, Copy } from "lucide-react"
import { useRef, useState } from "react"

/**
 * Copy-for-agents: one segmented control pairing the primary action (copy
 * the page's raw markdown to the clipboard, for pasting into a Claude or
 * any agent session) with its `.md` source link. Quiet chrome, mono label,
 * pointer cursor and a hair of press feedback — the app's own button
 * manners, in the docs' fd palette.
 */
export function CopyPageButton({ mdUrl }: { mdUrl: string }) {
  const [copied, setCopied] = useState(false)
  const reset = useRef<ReturnType<typeof setTimeout>>(null)

  async function copy() {
    const markdown = await (await fetch(mdUrl)).text()
    await navigator.clipboard.writeText(markdown)
    setCopied(true)
    if (reset.current) clearTimeout(reset.current)
    reset.current = setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="not-prose mt-4 mb-6 flex w-fit items-stretch self-start overflow-hidden rounded-lg border border-fd-border bg-fd-card font-mono text-[13px] shadow-sm">
      <button
        type="button"
        onClick={() => {
          void copy()
        }}
        className="inline-flex cursor-pointer items-center gap-2 py-1.5 pr-3.5 pl-3 text-fd-muted-foreground transition-colors hover:bg-fd-muted hover:text-fd-foreground focus-visible:relative focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-fd-ring active:translate-y-px"
      >
        {copied ? (
          <Check className="size-3.5 text-fd-primary" />
        ) : (
          <Copy className="size-3.5" />
        )}
        {/* Reserve the wider label's width so `.md` never shifts on copy. */}
        <span className="min-w-[4.5rem] text-left">
          {copied ? "Copied" : "Copy page"}
        </span>
      </button>
      <a
        href={mdUrl}
        title="View this page as Markdown"
        className="inline-flex cursor-pointer items-center border-l border-fd-border px-2.5 text-fd-muted-foreground/70 transition-colors hover:bg-fd-muted hover:text-fd-foreground focus-visible:relative focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-fd-ring"
      >
        .md
      </a>
    </div>
  )
}
