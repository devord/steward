import { Link } from "~/components/ui/link"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { useT } from "../lib/i18n.tsx"

/**
 * The `?` sheet: the keymap, spoken once (tmux's `?`, lazygit's help pane).
 * Keys in mono, actions in sentence-case sans — the per-string rule. The
 * sheet is also the layer's discoverability: nothing else in the chrome
 * advertises the keys, so this list is where they're learned. The footer
 * names the off switch (Settings) — the layer must be disableable
 * (WCAG 2.1.4), and the sheet is where someone bitten by it will look.
 */
export function KeymapSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useT()
  const rows: { keys: string; label: string }[] = [
    { keys: "1–9", label: t("keymap.boards") },
    { keys: "e", label: t("keymap.edit") },
    { keys: "a", label: t("keymap.add") },
    { keys: "s", label: t("keymap.sync") },
    { keys: "r", label: t("keymap.routines") },
    { keys: "esc", label: t("keymap.escEdit") },
    { keys: "?", label: t("keymap.sheet") },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("keymap.title")}</DialogTitle>
          <DialogDescription className="sr-only">
            {t("keymap.title")}
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1.5">
          {rows.map((row) => (
            <div key={row.keys} className="contents">
              <dt className="justify-self-end font-mono text-xs text-ink-dim">
                {row.keys}
              </dt>
              <dd className="text-sm text-foreground">{row.label}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-ink-dim">
          {t("keymap.settingsHintBefore")}
          <Link
            to="/settings"
            className="underline decoration-dotted underline-offset-2 outline-none hover:text-foreground focus-visible:text-foreground"
          >
            {t("keymap.settingsHintLink")}
          </Link>
          {t("keymap.settingsHintAfter")}
        </p>
      </DialogContent>
    </Dialog>
  )
}
