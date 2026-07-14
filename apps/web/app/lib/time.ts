/** Compact relative time, split for the translation layer to phrase. */
export interface AgoParts {
  unit: "now" | "minutes" | "hours" | "days"
  n: number
}

export function agoParts(iso: string, now: number): AgoParts {
  return durationParts(now - Date.parse(iso))
}

/** The same compact vocabulary for a bare duration (a run's gap to the
    previous one) — "now" means under a minute. */
export function durationParts(deltaMs: number): AgoParts {
  const minutes = Math.floor(Math.max(0, deltaMs) / 60_000)
  if (minutes < 1) return { unit: "now", n: 0 }
  if (minutes < 60) return { unit: "minutes", n: minutes }
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return { unit: "hours", n: hours }
  return { unit: "days", n: Math.floor(hours / 24) }
}

/** "ran 2h ago"-style compact relative time. Safe on server and client. */
export function formatAgo(iso: string, now: number): string {
  const { unit, n } = agoParts(iso, now)
  if (unit === "now") return "just now"
  return `${n}${unit === "minutes" ? "m" : unit === "hours" ? "h" : "d"} ago`
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
