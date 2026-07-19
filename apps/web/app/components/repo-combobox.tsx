import { useEffect, useState } from "react"

import { Combobox } from "@base-ui/react/combobox"

import { cn } from "~/lib/utils"
import type { RepoSearchResult } from "../routes/repos.ts"

/**
 * A single-value `owner/repo` field with type-ahead over the viewer's own
 * repos (via /repos, the same pool the routine wizard uses). Suggestions
 * only — any typed `owner/repo` is accepted verbatim, so a repo the search
 * misses (or an anonymous/rate-limited call) still registers by typing.
 * Built on Base UI Combobox: the popup portals into the top layer, so the
 * dialog's scroll box never clips it.
 */
export function RepoCombobox({
  id,
  value,
  onChange,
  placeholder,
  invalid,
  autoFocus,
}: {
  id?: string
  value: string
  onChange: (next: string) => void
  placeholder?: string
  invalid?: boolean
  autoFocus?: boolean
}) {
  const [suggestions, setSuggestions] = useState<string[]>([])

  useEffect(() => {
    const controller = new AbortController()
    // 150ms debounce, matching the wizard's repo picker. Abort + swallow: a
    // stale or failed fetch must neither clobber newer results nor error —
    // the field still accepts whatever was typed.
    const timer = setTimeout(() => {
      fetch(`/repos?q=${encodeURIComponent(value)}`, {
        signal: controller.signal,
      })
        .then((res) => (res.ok ? res.json() : { repos: [] }))
        .then((body: RepoSearchResult) => setSuggestions(body.repos))
        .catch(() => {})
    }, 150)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [value])

  // Drop the exact current value from the list — offering it as a row is
  // noise when it's already in the input.
  const items = suggestions.filter((repo) => repo !== value.trim())

  return (
    <Combobox.Root
      items={items}
      inputValue={value}
      onInputValueChange={onChange}
      // Picking a suggestion commits it as the value.
      onValueChange={(next) => {
        if (typeof next === "string") onChange(next)
      }}
      // The pool is already server-filtered by ?q=; re-filtering here would
      // hide valid suggestions.
      filter={() => true}
      autoHighlight
      openOnInputClick
    >
      <Combobox.Input
        id={id}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        // h/text match the input primitive (32px, 40px coarse; text-base
        // below md so iOS doesn't auto-zoom the focused field) — this field
        // sits beside Inputs and Selects and must not break the row rhythm.
        className={cn(
          "flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 font-mono text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:h-10 md:text-sm dark:bg-input/30",
          invalid &&
            "border-destructive ring-3 ring-destructive/20 dark:border-destructive/50 dark:ring-destructive/40",
        )}
      />
      <Combobox.Portal>
        <Combobox.Positioner
          side="bottom"
          sideOffset={4}
          className="isolate z-50"
        >
          <Combobox.Popup className="isolate z-50 max-h-[min(18rem,var(--available-height))] w-(--anchor-width) origin-(--transform-origin) overflow-y-auto rounded-lg border border-border bg-popover text-popover-foreground shadow-md duration-100 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95">
            <Combobox.List className="p-1 data-empty:p-0">
              {(item: string) => (
                <Combobox.Item
                  key={item}
                  value={item}
                  className="flex w-full cursor-default items-center rounded-md px-1.5 py-1 font-mono text-xs outline-hidden select-none pointer-coarse:py-2 data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                >
                  {item}
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  )
}
