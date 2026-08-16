#!/usr/bin/env node
// Normalize a Jira dump and tally it. Node built-ins only.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

const DAY = 86_400_000
const CATEGORIES = ["To Do", "In Progress", "Done"]

function args(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) continue
    const key = argv[i].slice(2)
    const next = argv[i + 1]
    out[key] = next && !next.startsWith("--") ? ((i += 1), next) : true
  }
  return out
}

/**
 * A JSON object: not null, not an array. `Object(v) === v` is the object test
 * that needs no `typeof` — a primitive boxes to a new object and fails it.
 */
function isRecord(v) {
  return v !== null && v !== undefined && Object(v) === v && !Array.isArray(v)
}

/** A flag's value, or null when it was passed bare — `args` yields `true`. */
function flagValue(v) {
  return v === true || v === undefined ? null : v
}

function die(message) {
  process.stderr.write(`jira-issues: ${message}\n`)
  process.exit(1)
}

const list = (v) => (Array.isArray(v) ? v : [])
const days = (from, to) => {
  const t = Date.parse(from ?? "")
  return Number.isNaN(t) ? null : Math.floor((to - t) / DAY)
}

/**
 * The category's NAME, never its lowercase key. Two consumers have disagreed
 * about this field, and `done` vs `Done` is a silent miscount either way.
 */
function category(fields) {
  const raw = fields?.status?.statusCategory
  const name = raw?.name ?? raw?.key ?? ""
  const match = CATEGORIES.find(
    (c) => c.toLowerCase() === String(name).toLowerCase(),
  )
  return match ?? (name ? String(name) : null)
}

/** When `label` was added, per the changelog — the only reason to pay for one. */
function labelledAt(issue, label) {
  if (!label) return null
  for (const history of list(issue?.changelog?.histories)) {
    for (const item of list(history?.items)) {
      if (String(item?.field ?? "").toLowerCase() !== "labels") continue
      const added = String(item?.toString ?? "")
        .split(/\s+/)
        .filter(Boolean)
      const before = String(item?.fromString ?? "")
        .split(/\s+/)
        .filter(Boolean)
      if (added.includes(label) && !before.includes(label))
        return history?.created ?? null
    }
  }
  return null
}

function tally(rows, pick) {
  const counts = new Map()
  for (const row of rows) {
    const key = pick(row)
    if (key == null) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return Object.fromEntries(
    [...counts].sort(
      (a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])),
    ),
  )
}

function enrich(raw, { now, label, base }) {
  const rows = []
  for (const [key, issue] of Object.entries(raw)) {
    if (key === "reachable") continue
    const fields = issue?.fields ?? {}
    const cat = category(fields)
    const fixVersion = list(fields.fixVersions)[0] ?? null
    rows.push({
      key: issue?.key ?? key,
      href: base
        ? `${String(base).replace(/\/+$/, "")}/browse/${issue?.key ?? key}`
        : null,
      summary: fields.summary ?? null,
      status: fields.status?.name ?? null,
      statusCategory: cat,
      resolved: cat === "Done",
      type: fields.issuetype?.name ?? null,
      project: fields.project?.key ?? null,
      assignee: fields.assignee
        ? {
            name: fields.assignee.displayName ?? null,
            accountId: fields.assignee.accountId ?? null,
          }
        : null,
      fixVersion: fixVersion
        ? {
            name: fixVersion.name ?? null,
            releaseDate: fixVersion.releaseDate ?? null,
          }
        : null,
      labels: list(fields.labels),
      created: fields.created ?? null,
      updated: fields.updated ?? null,
      dueDate: fields.duedate ?? null,
      ageDays: days(fields.created, now),
      staleDays: days(fields.updated, now),
      daysToDue: fields.duedate ? -days(fields.duedate, now) : null,
      labelled: label ? list(fields.labels).includes(label) : null,
      labelledAt: labelledAt(issue, label),
      waitingDays: label ? days(labelledAt(issue, label), now) : null,
    })
  }

  rows.sort((a, b) => Date.parse(a.created ?? 0) - Date.parse(b.created ?? 0))
  const open = rows.filter((r) => !r.resolved)

  return {
    generatedAt: new Date(now).toISOString(),
    label: label ?? null,
    counts: {
      total: rows.length,
      open: open.length,
      resolved: rows.length - open.length,
      overdue: open.filter((r) => r.daysToDue !== null && r.daysToDue < 0)
        .length,
      unassigned: open.filter((r) => !r.assignee).length,
      oldestOpenDays: open.length
        ? Math.max(...open.map((r) => r.ageDays ?? 0))
        : null,
    },
    byCategory: tally(rows, (r) => r.statusCategory),
    byProject: tally(open, (r) => r.project),
    byAssignee: tally(open, (r) => r.assignee?.name),
    issues: rows,
  }
}

const opts = args(process.argv.slice(2))
if (!opts.raw) die("--raw <file> is required")
const outDir = opts.out ?? dirname(String(opts.raw))
const now = opts.now ? Date.parse(String(opts.now)) : Date.now()
if (Number.isNaN(now)) die(`--now is not a date: ${opts.now}`)

let raw
try {
  raw = JSON.parse(readFileSync(String(opts.raw), "utf8"))
} catch (error) {
  die(`cannot read ${opts.raw}: ${error.message}`)
}
if (!isRecord(raw)) {
  die("raw.json must be an object keyed by issue key")
}
if (raw.reachable === false) {
  process.stdout.write(
    "## jira-issues\n\nJira unreachable this run — no issues gathered.\n",
  )
  process.exit(0)
}

const doc = enrich(raw, {
  now,
  label: flagValue(opts.label),
  base: flagValue(opts.base),
})

const file = join(String(outDir), "issues.json")
mkdirSync(String(outDir), { recursive: true })
writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`)

const c = doc.counts
const out = [`## jira-issues — ${c.total} issue${c.total === 1 ? "" : "s"}`, ""]
out.push(
  [
    `${c.open} open`,
    `${c.resolved} done`,
    c.overdue ? `${c.overdue} overdue` : null,
    c.unassigned ? `${c.unassigned} unassigned` : null,
    c.oldestOpenDays !== null ? `oldest ${c.oldestOpenDays}d` : null,
  ]
    .filter(Boolean)
    .join(" · "),
  "",
)
const cats = Object.entries(doc.byCategory)
if (cats.length)
  out.push(`By category: ${cats.map(([k, v]) => `${k} ${v}`).join(" · ")}`)
const projects = Object.entries(doc.byProject)
if (projects.length > 1)
  out.push(`By project: ${projects.map(([k, v]) => `${k} ${v}`).join(" · ")}`)
const people = Object.entries(doc.byAssignee).slice(0, 6)
if (people.length)
  out.push(`By assignee: ${people.map(([k, v]) => `${k} ${v}`).join(" · ")}`)
if (doc.label) {
  const waiting = doc.issues.filter(
    (r) => r.labelled && !r.resolved && r.waitingDays !== null,
  )
  out.push(
    waiting.length
      ? `Labelled \`${doc.label}\`: ${waiting.length} open, longest waiting ${Math.max(...waiting.map((r) => r.waitingDays))}d`
      : `Labelled \`${doc.label}\`: none open`,
  )
}
out.push("", `Full issues: ${file}`)
process.stdout.write(`${out.join("\n")}\n`)
