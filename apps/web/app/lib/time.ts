/** "ran 2h ago"-style compact relative time. Safe on server and client. */
export function formatAgo(iso: string, now: number): string {
  const delta = Math.max(0, now - Date.parse(iso))
  const minutes = Math.floor(delta / 60_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

/**
 * Rough interval of a 5-field cron in milliseconds — enough to judge
 * staleness (overdue vs schedule), not to predict the next fire time.
 */
export function cronIntervalMs(schedule: string): number | null {
  const fields = schedule.trim().split(/\s+/)
  if (fields.length !== 5) return null
  const [minute, hour, dayOfMonth, , dayOfWeek] = fields
  const HOUR = 3_600_000
  const DAY = 24 * HOUR
  if (minute?.startsWith("*/")) return Number(minute.slice(2)) * 60_000
  if (minute === "*") return 60_000
  if (hour?.startsWith("*/")) return Number(hour.slice(2)) * HOUR
  if (hour === "*") return HOUR
  if (dayOfWeek !== "*" && dayOfWeek !== "?") return 7 * DAY
  if (dayOfMonth !== "*" && dayOfMonth !== "?") return 30 * DAY
  return DAY
}
