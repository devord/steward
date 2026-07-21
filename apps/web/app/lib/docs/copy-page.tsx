import { Check, Copy, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"

/** Resting, plus the two outcomes a clipboard write can actually have. */
type CopyState = "idle" | "copied" | "failed"

const LABELS: Record<CopyState, string> = {
  idle: "Copy page",
  copied: "Copied",
  failed: "Failed",
}

/**
 * Copy-for-agents: one segmented control pairing the primary action (copy
 * the page's raw markdown to the clipboard, for pasting into a Claude or
 * any agent session) with its `.md` source link. Quiet chrome, mono label,
 * pointer cursor and a hair of press feedback — the app's own button
 * manners, in the docs' fd palette.
 *
 * It lives in the page's utility row (right of the breadcrumb, `ml-auto`),
 * not in the content column: this is chrome, and the page belongs to the
 * reader from the title down.
 */
export function CopyPageButton({ mdUrl }: { mdUrl: string }) {
  const [state, setState] = useState<CopyState>("idle")
  const reset = useRef<ReturnType<typeof setTimeout>>(null)

  useEffect(
    () => () => {
      if (reset.current) clearTimeout(reset.current)
    },
    [],
  )

  function settle(next: CopyState) {
    setState(next)
    if (reset.current) clearTimeout(reset.current)
    reset.current = setTimeout(() => setState("idle"), 2000)
  }

  async function copy() {
    try {
      const response = await fetch(mdUrl)
      if (!response.ok) throw new Error(`${response.status}`)
      await navigator.clipboard.writeText(await response.text())
      settle("copied")
    } catch {
      // Offline, an insecure context, or a denied clipboard permission.
      // Say so rather than sitting there looking unclicked — the `.md`
      // link right beside the button is the reader's way through.
      settle("failed")
    }
  }

  return (
    // `min-h-11` on coarse pointers, not padding on the segments: the row is
    // `items-stretch`, so both halves grow into the 44px floor together and
    // stay one box. Fine pointers keep the compact 34px.
    <div className="ml-auto flex w-fit shrink-0 items-stretch rounded-lg border border-fd-border bg-fd-card font-mono text-[13px] pointer-coarse:min-h-11">
      <button
        type="button"
        onClick={() => {
          void copy()
        }}
        className="inline-flex cursor-pointer items-center gap-2 rounded-l-[7px] py-1.5 pr-3.5 pl-3 text-fd-muted-foreground transition-colors hover:bg-fd-muted hover:text-fd-foreground focus-visible:relative focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-fd-ring active:translate-y-px"
      >
        {state === "copied" ? (
          <Check aria-hidden className="size-3.5 text-fd-success" />
        ) : state === "failed" ? (
          <X aria-hidden className="size-3.5 text-fd-error" />
        ) : (
          <Copy aria-hidden className="size-3.5" />
        )}
        {/* Reserve the widest label's width so `.md` never shifts on copy,
            and announce the outcome — the swap is the only confirmation. */}
        <span aria-live="polite" className="min-w-[4.5rem] text-left">
          {LABELS[state]}
        </span>
      </button>
      <a
        href={mdUrl}
        aria-label="View this page as Markdown"
        title="View this page as Markdown"
        className="inline-flex cursor-pointer items-center rounded-r-[7px] border-l border-fd-border px-2.5 text-fd-muted-foreground transition-colors pointer-coarse:px-3.5 hover:bg-fd-muted hover:text-fd-foreground focus-visible:relative focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-fd-ring"
      >
        .md
      </a>
    </div>
  )
}
