import type { MessageKey } from "../locales/en.ts"

/**
 * The curated cron vocabulary — one list shared by the add/edit dialog (the
 * picker) and every ledger that names a schedule (ADR-0025/0033), so pick and
 * display speak the same phrase. A cron off this list has no phrase to wear
 * and renders verbatim (terminal manners: machine strings stay honest).
 */
export const SCHEDULE_PRESETS: readonly {
  value: string
  label: MessageKey
}[] = [
  { value: "0 * * * *", label: "dialog.presetHourly" },
  { value: "0 */4 * * *", label: "dialog.presetEvery4h" },
  { value: "0 8 * * *", label: "dialog.presetDaily8" },
  { value: "0 9 * * 1-5", label: "dialog.presetWeekdays9" },
  { value: "0 9 * * 1", label: "dialog.presetWeeklyMon9" },
]

/** The picker phrase for a preset cron, or null for a custom expression. */
export function schedulePhraseKey(cron: string): MessageKey | null {
  return SCHEDULE_PRESETS.find((p) => p.value === cron)?.label ?? null
}
