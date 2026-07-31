#!/usr/bin/env node
// Resolve the window, count what moved in it, and band what comes next.
// Node built-ins only — a cloud routine has no npm install.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

const DAY = 86_400_000
const FAIL = ["FAILURE", "ERROR", "TIMED_OUT", "STARTUP_FAILURE", "CANCELLED"]
const TICKET = /\b[A-Z][A-Z0-9]+-\d+\b/g
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

function die(message) {
  process.stderr.write(`github-history: ${message}\n`)
  process.exit(1)
}

const list = (v) => (Array.isArray(v) ? v : [])
const iso = (ms) => new Date(ms).toISOString()
const day = (v) =>
  new Date(v).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })

function title(raw) {
  const stripped = String(raw ?? "")
    .replace(CONVENTIONAL, "")
    .trim()
  return stripped || String(raw ?? "").trim()
}

function tickets(text) {
  return [...new Set(String(text ?? "").match(TICKET) ?? [])]
}

/** Approved with nothing red is nearly landed; a draft is not. */
function band(pr) {
  if (pr?.isDraft) return "in flight"
  const checks = list(pr?.statusCheckRollup)
  const red = checks.some((c) =>
    FAIL.includes(String(c?.conclusion ?? c?.state ?? "").toUpperCase()),
  )
  const pending = checks.some(
    (c) => String(c?.status ?? "").toUpperCase() !== "COMPLETED",
  )
  const approved = String(pr?.reviewDecision ?? "").toUpperCase() === "APPROVED"
  return approved && !red && !pending ? "committed" : "in flight"
}

/**
 * The person who led an item set: most merged PRs, ties on lines changed,
 * then most recent merge. Everyone else is a count — a movement has one face.
 */
function principal(items) {
  const by = new Map()
  for (const item of items) {
    const login = item?.author?.login
    if (!login) continue
    const seen = by.get(login) ?? { login, prs: 0, lines: 0, last: 0 }
    seen.prs += 1
    seen.lines += (item?.additions ?? 0) + (item?.deletions ?? 0)
    seen.last = Math.max(
      seen.last,
      Date.parse(item?.mergedAt ?? item?.updatedAt ?? 0) || 0,
    )
    by.set(login, seen)
  }
  const ranked = [...by.values()].sort(
    (a, b) => b.prs - a.prs || b.lines - a.lines || b.last - a.last,
  )
  return ranked.length
    ? { login: ranked[0].login, others: ranked.length - 1 }
    : null
}

function derive(raw, { now, days, jira }) {
  const since = now - days * DAY
  const until = now + days * DAY
  const window = {
    days,
    behind: { from: iso(since), to: iso(now) },
    ahead: { from: iso(now), to: iso(until) },
    label: `${day(since)} → ${day(now)} → ${day(until)}`,
  }

  const repos = []
  const merged = []
  const open = []
  const releases = []
  const milestones = []
  let issuesOpened = 0
  let issuesClosed = 0
  let runsTotal = 0
  let runsRed = 0

  for (const [name, entry] of Object.entries(raw)) {
    if (!entry || entry.reachable === false) {
      repos.push({ name, reachable: false })
      continue
    }

    for (const pr of list(entry.merged)) {
      merged.push({
        repo: name,
        number: pr?.number ?? null,
        title: title(pr?.title),
        url: pr?.url ?? null,
        author: pr?.author?.login ?? null,
        mergedAt: pr?.mergedAt ?? null,
        additions: pr?.additions ?? 0,
        deletions: pr?.deletions ?? 0,
        labels: list(pr?.labels)
          .map((l) => l?.name)
          .filter(Boolean),
        tickets: tickets(pr?.title),
      })
    }

    for (const pr of list(entry.open)) {
      open.push({
        repo: name,
        number: pr?.number ?? null,
        title: title(pr?.title),
        url: pr?.url ?? null,
        author: pr?.author?.login ?? null,
        band: band(pr),
        updatedAt: pr?.updatedAt ?? null,
        tickets: tickets(pr?.title),
      })
    }

    for (const r of list(entry.releases)) {
      releases.push({
        repo: name,
        tag: r?.tagName ?? null,
        publishedAt: r?.publishedAt ?? null,
        url: r?.url ?? null,
      })
    }

    for (const m of list(entry.milestones)) {
      const due = Date.parse(m?.dueOn ?? "")
      milestones.push({
        repo: name,
        title: m?.title ?? null,
        dueOn: m?.dueOn ?? null,
        // A dated milestone inside the window is the only thing here that is a fact with a date.
        band:
          !Number.isNaN(due) && due > now && due <= until
            ? "committed"
            : "in flight",
        open: m?.openIssues ?? 0,
        closed: m?.closedIssues ?? 0,
      })
    }

    const runs = list(entry.runs)
    runsTotal += runs.length
    runsRed += runs.filter((r) =>
      FAIL.includes(String(r?.conclusion ?? "").toUpperCase()),
    ).length

    issuesOpened += list(entry.issuesOpened).length
    issuesClosed += list(entry.issuesClosed).length

    repos.push({
      name,
      reachable: true,
      merged: list(entry.merged).length,
      open: list(entry.open).length,
      issuesOpened: list(entry.issuesOpened).length,
      issuesClosed: list(entry.issuesClosed).length,
      releases: list(entry.releases).length,
      commitsSinceTag: entry.commitsSinceTag ?? null,
      lastTag: entry.lastTag ?? null,
    })
  }

  merged.sort(
    (a, b) => Date.parse(b.mergedAt ?? 0) - Date.parse(a.mergedAt ?? 0),
  )
  open.sort(
    (a, b) => Date.parse(b.updatedAt ?? 0) - Date.parse(a.updatedAt ?? 0),
  )

  const committed = [
    ...open.filter((p) => p.band === "committed"),
    ...milestones.filter((m) => m.band === "committed"),
  ]

  return {
    generatedAt: iso(now),
    window,
    counts: {
      repos: repos.length,
      unreachable: repos.filter((r) => !r.reachable).length,
      merged: merged.length,
      open: open.length,
      issuesOpened,
      issuesClosed,
      releases: releases.length,
      committed: committed.length,
      inFlight: open.length - open.filter((p) => p.band === "committed").length,
    },
    // A rate, not a snapshot: today's green dot is not a finding.
    ci: runsTotal
      ? { total: runsTotal, red: runsRed, rate: runsRed / runsTotal }
      : null,
    principals: {
      behind: principal(merged),
      ahead: principal(open),
    },
    jira: jira ?? null,
    repos,
    merged,
    open,
    releases,
    milestones,
  }
}

function reading(doc, file) {
  const { counts, window } = doc
  const out = [`## github-history — ${window.label}`, ""]

  const headline = [
    `${counts.merged} merged`,
    `${counts.issuesClosed} issues closed`,
    `${counts.releases} release${counts.releases === 1 ? "" : "s"}`,
    `${counts.open} open ahead`,
  ]
  if (doc.ci) headline.push(`CI red ${doc.ci.red} of ${doc.ci.total}`)
  out.push(headline.join(" · "), "")

  if (doc.principals.behind) {
    const p = doc.principals.behind
    out.push(`Led behind: @${p.login}${p.others ? ` +${p.others}` : ""}`)
  }
  if (doc.principals.ahead) {
    const p = doc.principals.ahead
    out.push(`Moving ahead: @${p.login}${p.others ? ` +${p.others}` : ""}`)
  }
  if (doc.principals.behind || doc.principals.ahead) out.push("")

  if (doc.merged.length) {
    out.push(`### Merged · ${doc.merged.length}`)
    for (const pr of doc.merged.slice(0, 8)) {
      const keys = pr.tickets.length ? ` [${pr.tickets.join(" ")}]` : ""
      out.push(`- ${pr.repo}#${pr.number} ${pr.title}${keys} — @${pr.author}`)
    }
    if (doc.merged.length > 8) out.push(`- +${doc.merged.length - 8} more`)
    out.push("")
  }

  out.push(
    `### Ahead · committed ${counts.committed} · in flight ${counts.inFlight}`,
  )
  const dated = doc.milestones.filter((m) => m.band === "committed")
  for (const m of dated)
    out.push(
      `- ${m.repo} ${m.title} due ${day(m.dueOn)} — ${m.open} open, ${m.closed} closed`,
    )
  for (const pr of doc.open.filter((p) => p.band === "committed").slice(0, 5)) {
    out.push(`- ${pr.repo}#${pr.number} ${pr.title} — approved, checks green`)
  }
  // An honest "nothing is committed" is itself a finding worth an executive's attention.
  if (!counts.committed)
    out.push(`- nothing is committed for the next ${window.days} days`)
  out.push("")

  const unreachable = doc.repos.filter((r) => !r.reachable).map((r) => r.name)
  if (unreachable.length) out.push(`Unreachable: ${unreachable.join(", ")}`, "")
  out.push(`Full window: ${file}`)
  return out.join("\n")
}

const opts = args(process.argv.slice(2))
if (!opts.raw) die("--raw <file> is required")
const outDir = opts.out ?? dirname(String(opts.raw))
const now = opts.now ? Date.parse(String(opts.now)) : Date.now()
if (Number.isNaN(now)) die(`--now is not a date: ${opts.now}`)
const days = opts.days ? Number(opts.days) : 7
if (!Number.isFinite(days) || days <= 0)
  die(`--days must be a positive number: ${opts.days}`)

let raw
try {
  raw = JSON.parse(readFileSync(String(opts.raw), "utf8"))
} catch (error) {
  die(`cannot read ${opts.raw}: ${error.message}`)
}
if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
  die("raw.json must be an object keyed by owner/repo")
}
if (Object.keys(raw).length === 0) die("raw.json names no repos")

const doc = derive(raw, {
  now,
  days,
  jira: typeof opts.jira === "string" ? opts.jira : null,
})
if (doc.counts.unreachable === doc.counts.repos) {
  die("every repo was unreachable — nothing to report")
}

const file = join(String(outDir), "history.json")
mkdirSync(String(outDir), { recursive: true })
writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`)
process.stdout.write(`${reading(doc, file)}\n`)
