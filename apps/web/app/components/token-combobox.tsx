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

  // Re-filter against the *current* query: the async list can be a stale
  // response for an earlier query, and with `autoHighlight` Enter would
  // commit whatever stale row happens to be first.
  const typed = query.trim()
  const open = suggestions.filter(
    (entry) =>
      !value.includes(entry) &&
      entry.toLowerCase().includes(typed.toLowerCase()),
  )
  const candidate =
    typed.length > 0 &&
    validate(typed) &&
    !value.includes(typed) &&
    !open.includes(typed)
      ? typed
      : null
  // The typed token leads: once the entry passes `validate`, Enter must add
  // exactly what was typed, never a lookalike suggestion above it.
  const items = candidate ? [candidate, ...open] : open

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
      {/* min-h matches the input/select control heights (32px, 40px coarse);
          the inline input is capped at 22px so the empty field's content
          height stays under the floor instead of pushing it to 34px — the
          one field in the form that sat 2px taller than its neighbors. */}
      <Combobox.Chips
        className={cn(
          "flex min-h-8 w-full flex-wrap items-center gap-1 rounded-lg border border-input bg-transparent px-1.5 py-1 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 pointer-coarse:min-h-10 dark:bg-border/30",
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
              className="relative rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground pointer-coarse:after:absolute pointer-coarse:after:-inset-2"
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
          // text-base below md like the input primitive (iOS zooms any
          // focused field under 16px); h-[1.375rem] keeps the empty row's
          // content height at the 32px control floor.
          className="h-[1.375rem] min-w-24 flex-1 bg-transparent font-mono text-base outline-none placeholder:text-muted-foreground md:text-sm"
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
