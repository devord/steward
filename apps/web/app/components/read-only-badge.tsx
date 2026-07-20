import { Eye } from "lucide-react"

import { cn } from "~/lib/utils"
import { useT } from "../lib/i18n.tsx"

/**
 * The quiet read-only signal (ADR-0003/0023): a data repo the viewer can read
 * but not push to can't be edited — every edit is a localStorage draft that
 * could never sync, since the GitHub repo boundary is the whole access model
 * (ADR-0001). Shown beside the now-disabled edit controls so a reader learns it
 * up front, not at the Sync-time "denied". Calm, not loud: ink tones + the `Eye`
 * glyph in the terminal-calm register — honest state, like the freshness
 * footer, never an alarm. Only an explicit `viewerCanPush === false` surfaces
 * it; unknown (null) stays silent and editing stays available.
 *
 * The visible "Read-only" label reads as a mono state chip; the full reason
 * rides as the `title` tooltip and an sr-only echo so assistive tech gets it
 * even though the disabled controls are inert.
 */
export function ReadOnlyBadge({ className }: { className?: string }) {
  const t = useT()
  return (
    <span
      data-testid="read-only-badge"
      title={t("readonly.hint")}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border-dim bg-bg2 px-2 py-1 font-mono text-xs text-ink-dim",
        className,
      )}
    >
      <Eye aria-hidden className="size-3.5 shrink-0 text-ink-faint" />
      {t("readonly.badge")}
      <span className="sr-only"> — {t("readonly.hint")}</span>
    </span>
  )
}
