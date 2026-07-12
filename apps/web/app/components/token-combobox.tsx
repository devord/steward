import { useEffect, useState } from "react"

import { Combobox } from "@base-ui/react/combobox"
import { XIcon } from "lucide-react"

import { cn } from "~/lib/utils"
import { useT } from "../lib/i18n.tsx"

/**
 * A list-of-identifiers field (ADR-0020): values render as removable mono
 * chips; the inline input adds more, either from async suggestions
 * (`suggest`, e.g. the viewer's GitHub repos via /repos) or free-typed —
 * any `validate`-passing entry appears as an "Add …" row, so an unknown
 * value is always reachable and a dead suggestion source degrades to
 * typing. Built on Base UI Combobox: the popup portals into the top layer,
 * so the dialog's scroll box never clips it.
 */
export function TokenCombobox({
  id,
  value,
  onChange,
  validate,
  suggest,
  placeholder,
  emptyHint,
  invalid,
  onBlur,
}: {
  id?: string
  value: string[]
  onChange: (next: string[]) => void
  /** Gate for free-typed tokens (e.g. owner/repo shape). */
  validate: (token: string) => boolean
  /** Async suggestion source for the current query. Must be referentially
      stable — it re-arms the debounce effect. */
  suggest?: (query: string, signal: AbortSignal) => Promise<string[]>
  placeholder?: string
  /** Popup line when there's nothing to suggest and nothing valid typed. */
  emptyHint?: string
  invalid?: boolean
  /** Fires when the inline input blurs — validate-on-blur hook. */
  onBlur?: () => void
}) {
  const t = useT()
  const [query, setQuery] = useState("")
  const [suggestions, setSuggestions] = useState<string[]>([])

  useEffect(() => {
    if (!suggest) return
    const controller = new AbortController()
    // 150ms debounce: fast enough to feel live, slow enough to skip
    // intermediate keystrokes. Abort + swallow: a stale or failed fetch
    // must neither clobber newer suggestions nor surface an error — the
    // field still accepts typed tokens.
    const timer = setTimeout(() => {
      suggest(query, controller.signal)
        .then(setSuggestions)
        .catch(() => {})
    }, 150)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [suggest, query])

  const open = suggestions.filter((entry) => !value.includes(entry))
  const typed = query.trim()
  const candidate =
    typed.length > 0 &&
    validate(typed) &&
    !value.includes(typed) &&
    !open.includes(typed)
      ? typed
      : null
  const items = candidate ? [...open, candidate] : open

  return (
    <Combobox.Root
      multiple
      items={items}
      value={value}
      inputValue={query}
      onInputValueChange={setQuery}
      onValueChange={(next) => {
        onChange(next)
        setQuery("")
      }}
      // The pool is already query-filtered (server-side or the candidate
      // gate above); re-filtering here would fight the "Add …" row.
      filter={() => true}
      autoHighlight
      openOnInputClick
    >
      <Combobox.Chips
        className={cn(
          "flex min-h-8 w-full flex-wrap items-center gap-1 rounded-lg border border-input bg-transparent px-1.5 py-1 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30",
          invalid &&
            "border-destructive ring-3 ring-destructive/20 dark:border-destructive/50 dark:ring-destructive/40",
        )}
      >
        {value.map((token) => (
          <Combobox.Chip
            key={token}
            className="flex items-center gap-1 rounded-md bg-muted py-0.5 pr-1 pl-1.5 font-mono text-xs text-foreground data-highlighted:bg-secondary"
          >
            {token}
            <Combobox.ChipRemove
              className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label={t("dialog.removeToken", { value: token })}
            >
              <XIcon className="size-3" />
            </Combobox.ChipRemove>
          </Combobox.Chip>
        ))}
        <Combobox.Input
          id={id}
          placeholder={value.length === 0 ? placeholder : undefined}
          onBlur={onBlur}
          aria-invalid={invalid || undefined}
          className="h-6 min-w-24 flex-1 bg-transparent font-mono text-sm outline-none placeholder:text-muted-foreground"
        />
      </Combobox.Chips>
      <Combobox.Portal>
        <Combobox.Positioner
          side="bottom"
          sideOffset={4}
          className="isolate z-50"
        >
          <Combobox.Popup className="isolate z-50 max-h-[min(18rem,var(--available-height))] w-(--anchor-width) origin-(--transform-origin) overflow-y-auto rounded-lg border border-border bg-popover text-popover-foreground shadow-md duration-100 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95">
            {emptyHint && (
              <Combobox.Empty className="px-2.5 py-1.5 text-xs text-muted-foreground not-empty:block">
                {emptyHint}
              </Combobox.Empty>
            )}
            <Combobox.List className="p-1 data-empty:p-0">
              {(item: string) => (
                <Combobox.Item
                  key={item}
                  value={item}
                  className="flex w-full cursor-default items-center rounded-md px-1.5 py-1 font-mono text-xs outline-hidden select-none pointer-coarse:py-2 data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                >
                  {item === candidate
                    ? t("dialog.addToken", { value: item })
                    : item}
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  )
}
