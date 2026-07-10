/**
 * Cron → launchd translation for scheduled-local routines (ADR-0012).
 * launchd's StartCalendarInterval coalesces missed schedules on wake —
 * the semantic that made it win over crontab — but each dict holds single
 * values, so cron lists/ranges/steps expand to an array of dicts.
 */

interface CalendarEntry {
  Minute?: number
  Hour?: number
  Day?: number
  Month?: number
  Weekday?: number
}

export type LaunchdSchedule =
  // StartCalendarInterval dicts.
  | { calendar: CalendarEntry[] }
  // StartInterval seconds — the `*/n * * * *` shape.
  | { interval: number }

/** Expand one cron field: "*" stays a wildcard; numbers, lists, ranges and
    steps become explicit values. null → syntax we don't translate. */
function expand(
  field: string,
  min: number,
  max: number,
): number[] | "*" | null {
  if (field === "*" || field === "?") return "*"
  const step = /^\*\/(\d+)$/.exec(field)
  if (step) {
    const by = Number(step[1])
    if (by < 1) return null
    const values = []
    for (let v = min; v <= max; v += by) values.push(v)
    return values
  }
  const values: number[] = []
  for (const part of field.split(",")) {
    const range = /^(\d+)-(\d+)$/.exec(part)
    if (range) {
      const from = Number(range[1])
      const to = Number(range[2])
      if (from > to) return null
      for (let v = from; v <= to; v++) values.push(v)
    } else if (/^\d+$/.test(part)) {
      values.push(Number(part))
    } else {
      return null
    }
  }
  return values.every((v) => v >= min && v <= max) ? values : null
}

/** Cap on expanded dicts — past this the cron is too dense for the
    per-entry calendar model and should stay a cloud routine. */
const MAX_ENTRIES = 60

export function cronToLaunchd(schedule: string): LaunchdSchedule | null {
  const fields = schedule.trim().split(/\s+/)
  if (fields.length !== 5) return null
  const [minuteF = "", hourF = "", domF = "", monthF = "", dowF = ""] = fields

  // A step-minute cron (`*/n` with everything else `*`) → a plain
  // interval; calendar dicts can't say "every n minutes" without 60/n
  // entries.
  if (
    /^\*(?:\/\d+)?$/.test(minuteF) &&
    [hourF, domF, monthF, dowF].every((f) => f === "*")
  ) {
    return { interval: Number(minuteF.slice(2) || 1) * 60 }
  }

  const minute = expand(minuteF, 0, 59)
  const hour = expand(hourF, 0, 23)
  const day = expand(domF, 1, 31)
  const month = expand(monthF, 1, 12)
  // Cron 0/7 = Sunday; launchd Weekday 0 = Sunday too (7 also accepted,
  // but normalize).
  const weekdayRaw = expand(dowF, 0, 7)
  const weekday =
    weekdayRaw === "*" || weekdayRaw === null
      ? weekdayRaw
      : [...new Set(weekdayRaw.map((v) => (v === 7 ? 0 : v)))]
  if (
    minute === null ||
    hour === null ||
    day === null ||
    month === null ||
    weekday === null
  ) {
    return null
  }
  // A wildcard minute alongside a set hour would need 60 dicts per hour —
  // out of the calendar model's reach.
  if (minute === "*") return null

  const axes: Array<[keyof CalendarEntry, number[] | "*"]> = [
    ["Minute", minute],
    ["Hour", hour],
    ["Day", day],
    ["Month", month],
    ["Weekday", weekday],
  ]
  let entries: CalendarEntry[] = [{}]
  for (const [key, values] of axes) {
    if (values === "*") continue
    const next: CalendarEntry[] = []
    for (const entry of entries) {
      for (const value of values) next.push({ ...entry, [key]: value })
    }
    entries = next
    if (entries.length > MAX_ENTRIES) return null
  }
  return { calendar: entries }
}

function xmlEscape(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

/**
 * The launch agent for one scheduled-local routine. The job runs headless
 * `claude -p` with the same stable pointer prompt every host fires
 * (ADR-0005), from the data repo checkout, under a login shell so `claude`
 * and `gh` resolve from the user's PATH. The bulletin-repo comment is the
 * ownership marker orphan cleanup keys on.
 */
export function launchdPlist(options: {
  label: string
  repo: string
  prompt: string
  cwd: string
  logFile: string
  schedule: LaunchdSchedule
}): string {
  const calendarXml = (entry: CalendarEntry) =>
    [
      "    <dict>",
      ...Object.entries(entry).map(
        ([key, value]) =>
          `      <key>${key}</key>\n      <integer>${value}</integer>`,
      ),
      "    </dict>",
    ].join("\n")

  const scheduleXml =
    "interval" in options.schedule
      ? [
          "  <key>StartInterval</key>",
          `  <integer>${options.schedule.interval}</integer>`,
        ].join("\n")
      : [
          "  <key>StartCalendarInterval</key>",
          "  <array>",
          ...options.schedule.calendar.map(calendarXml),
          "  </array>",
        ].join("\n")

  // The prompt sits inside single quotes in a zsh -c string; the slug and
  // repo it interpolates are schema-validated (kebab / owner-name), so no
  // quoting surprises.
  const command = `exec claude -p '${options.prompt}'`

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!-- bulletin-repo: ${xmlEscape(options.repo)} — written by pnpm routines:sync; edits are overwritten -->
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xmlEscape(options.label)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-l</string>
    <string>-c</string>
    <string>${xmlEscape(command)}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${xmlEscape(options.cwd)}</string>
  <key>StandardOutPath</key>
  <string>${xmlEscape(options.logFile)}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(options.logFile)}</string>
${scheduleXml}
</dict>
</plist>
`
}

/** The repo a synced plist belongs to, from its ownership comment. */
export function plistRepo(plist: string): string | null {
  return /<!-- bulletin-repo: (.+?) —/.exec(plist)?.[1] ?? null
}
