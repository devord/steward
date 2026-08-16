#!/usr/bin/env node
// Derive the PR queue from a raw gather, and print the reading.
// Node built-ins only — a cloud routine has no npm install.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

const FAIL = [
  "FAILURE",
  "ERROR",
  "TIMED_OUT",
  "STARTUP_FAILURE",
  "ACTION_REQUIRED",
  "CANCELLED",
]
const WAIT = [
  "PENDING",
  "EXPECTED",
  "QUEUED",
  "IN_PROGRESS",
  "WAITING",
  "REQUESTED",
]
const CI_RANK = { failing: 3, pending: 2, passing: 1, none: 0 }
const CI_WORD = {
  failing: "failing",
  pending: "pending",
  passing: "passing",
  none: "no checks",
}

const GROUPS = [
  { id: "blocked", label: "Blocked" },
  { id: "review", label: "In review" },
  { id: "open", label: "Open" },
]

const TICKET = /\b[A-Z][A-Z0-9]+-\d+\b/
const CONVENTIONAL = /^\s*[a-z]+(\([^)]*\))?!?:\s*/

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
  process.stderr.write(`github-prs: ${message}\n`)
  process.exit(1)
}

/** One check's verdict. Handles both CheckRun (status+conclusion) and StatusContext (state). */
function checkState(entry) {
  const status = String(entry?.status ?? "").toUpperCase()
  const verdict = String(entry?.conclusion ?? entry?.state ?? "").toUpperCase()
  if (status && status !== "COMPLETED") return "pending"
  if (!verdict) return "pending"
  if (FAIL.includes(verdict)) return "failing"
  if (WAIT.includes(verdict)) return "pending"
  return "passing"
}

function worst(states) {
  return states.reduce(
    (acc, s) => (CI_RANK[s] > CI_RANK[acc] ? s : acc),
    "none",
  )
}

function rollup(pr) {
  const checks = pr?.statusCheckRollup
  if (!Array.isArray(checks) || checks.length === 0) return "none"
  return worst(checks.map(checkState))
}

/** Directly-requested human reviewers. A team-only request is nobody's "needs me". */
function reviewers(pr) {
  const requests = Array.isArray(pr?.reviewRequests) ? pr.reviewRequests : []
  return requests.map((r) => r?.login ?? r?.user?.login).filter(Boolean)
}

function reviewState(pr) {
  if (pr?.isDraft) return "draft"
  const decision = String(pr?.reviewDecision ?? "").toUpperCase()
  if (decision === "CHANGES_REQUESTED") return "changes requested"
  if (decision === "APPROVED") return "approved"
  return "review required"
}

function group(state, ci) {
  if (state === "changes requested" || ci === "failing") return "blocked"
  if (state === "review required" || ci === "pending") return "review"
  return "open"
}

function displayTitle(raw) {
  const stripped = String(raw ?? "")
    .replace(CONVENTIONAL, "")
    .trim()
  return stripped || String(raw ?? "").trim()
}

function ageDays(createdAt, now) {
  const started = Date.parse(createdAt)
  if (Number.isNaN(started)) return null
  return Math.max(0, Math.floor((now - started) / 86_400_000))
}

function derive(raw, { now, jira }) {
  const repos = []
  const rows = []

  for (const [name, entry] of Object.entries(raw)) {
    if (!entry || entry.reachable === false) {
      repos.push({ name, reachable: false, open: 0, newIssues: 0, ci: null })
      continue
    }

    const prs = Array.isArray(entry.prs) ? entry.prs : []
    const issues = (Array.isArray(entry.issues) ? entry.issues : []).filter(
      (i) => !i?.pull_request,
    )

    for (const pr of prs) {
      const state = reviewState(pr)
      const ci = rollup(pr)
      const ticket = TICKET.exec(pr?.title ?? "")?.[0] ?? null
      rows.push({
        id: `${name}#${pr?.number}`,
        repo: name,
        number: pr?.number ?? null,
        title: displayTitle(pr?.title),
        rawTitle: String(pr?.title ?? "").trim(),
        url: pr?.url ?? null,
        author: pr?.author?.login ?? null,
        reviewers: reviewers(pr),
        state,
        ci,
        ageDays: ageDays(pr?.createdAt, now),
        createdAt: pr?.createdAt ?? null,
        additions: pr?.additions ?? null,
        deletions: pr?.deletions ?? null,
        ticket,
        ticketHref:
          ticket && jira
            ? `${String(jira).replace(/\/+$/, "")}/browse/${ticket}`
            : null,
        group: group(state, ci),
      })
    }

    const branchCi = entry.ci ? checkState(entry.ci) : null
    repos.push({
      name,
      reachable: true,
      open: prs.length,
      newIssues: issues.length,
      issues,
      ci: branchCi,
      defaultBranch: entry.ci?.branch ?? null,
    })
  }

  // Worst first, oldest first inside a group: old AND waiting on someone is the emergency.
  const order = Object.fromEntries(GROUPS.map((g, i) => [g.id, i]))
  rows.sort(
    (a, b) =>
      order[a.group] - order[b.group] ||
      Date.parse(a.createdAt ?? 0) - Date.parse(b.createdAt ?? 0) ||
      String(a.id).localeCompare(String(b.id)),
  )

  const grouped = GROUPS.map((g) => ({
    ...g,
    rows: rows.filter((r) => r.group === g.id),
  })).filter((g) => g.rows.length > 0)

  const reachable = repos.filter((r) => r.reachable)
  const counts = {
    repos: repos.length,
    unreachable: repos.length - reachable.length,
    open: rows.length,
    blocked: rows.filter((r) => r.group === "blocked").length,
    review: rows.filter((r) => r.group === "review").length,
    idle: rows.filter((r) => r.group === "open").length,
    newIssues: reachable.reduce((n, r) => n + r.newIssues, 0),
  }

  const branchStates = reachable.map((r) => r.ci).filter(Boolean)
  return {
    generatedAt: new Date(now).toISOString(),
    counts,
    worstPrCi: worst(rows.map((r) => r.ci)),
    worstBranchCi: branchStates.length ? worst(branchStates) : null,
    repos,
    groups: grouped,
    prs: rows,
  }
}

function line(row) {
  const bits = [row.state]
  if (row.ci !== "none") bits.push(`CI ${row.ci}`)
  if (row.ageDays !== null) bits.push(`${row.ageDays}d`)
  const who = [
    row.author && `@${row.author}`,
    row.reviewers.length && `→ ${row.reviewers.map((r) => `@${r}`).join(" ")}`,
  ]
    .filter(Boolean)
    .join(" ")
  if (who) bits.push(who)
  return `- ${row.repo}#${row.number} ${row.title} — ${bits.join(" · ")}`
}

function reading(doc, file) {
  const { counts } = doc
  const out = []
  out.push(
    `## github-prs — ${counts.repos} repo${counts.repos === 1 ? "" : "s"}`,
    "",
  )

  const headline = [
    `${counts.open} open PR${counts.open === 1 ? "" : "s"}`,
    `${counts.blocked} blocked`,
    `${counts.review} in review`,
  ]
  if (doc.worstBranchCi)
    headline.push(`default branch ${CI_WORD[doc.worstBranchCi]}`)
  if (counts.newIssues)
    headline.push(
      `${counts.newIssues} new issue${counts.newIssues === 1 ? "" : "s"}`,
    )
  out.push(headline.join(" · "), "")

  // Blocked in full — it is the actionable end. The rest is capped; the file has every row.
  const caps = { blocked: 10, review: 5, open: 0 }
  for (const g of doc.groups) {
    out.push(`### ${g.label} · ${g.rows.length}`)
    const cap = caps[g.id]
    for (const row of g.rows.slice(0, cap)) out.push(line(row))
    // A capped-to-nothing group is a count, not a list: the heading already said it.
    const hidden = g.rows.length - Math.min(cap, g.rows.length)
    if (cap > 0 && hidden > 0) out.push(`- +${hidden} more`)
    out.push("")
  }

  const unreachable = doc.repos.filter((r) => !r.reachable).map((r) => r.name)
  if (unreachable.length) out.push(`Unreachable: ${unreachable.join(", ")}`, "")
  if (doc.counts.open === 0 && !unreachable.length)
    out.push("No open pull requests.", "")

  out.push(`Full rows: ${file}`)
  return out.join("\n")
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
  die("raw.json must be an object keyed by owner/repo")
}
if (Object.keys(raw).length === 0) die("raw.json names no repos")

const doc = derive(raw, {
  now,
  jira: flagValue(opts.jira),
})

// Every repo unreachable is a degraded reading, not a failure: the caller still
// gets zero rows and the unreachable names for its provenance line (ADR-0053).
const file = join(String(outDir), "prs.json")
mkdirSync(String(outDir), { recursive: true })
writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`)
process.stdout.write(`${reading(doc, file)}\n`)
