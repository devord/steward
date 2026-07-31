#!/usr/bin/env node
// Read a routine's last publish off the artifacts branch.
// Node built-ins only — a cloud routine has no npm install.

import { spawnSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
const GENERATED_AT = /<meta\s+name="widget-generated-at"\s+content="([^"]*)"/i
const STATE_BLOCK =
  /<script\s+type="application\/json"\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/script>/gi

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
  process.stderr.write(`prior-run: ${message}\n`)
  process.exit(1)
}

function git(cwd, argv, { binary = false } = {}) {
  const res = spawnSync("git", argv, {
    cwd,
    encoding: binary ? "buffer" : "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
  return {
    ok: res.status === 0,
    out: res.stdout ?? (binary ? Buffer.alloc(0) : ""),
    err: String(res.stderr ?? ""),
  }
}

/** The kit escapes `</script>` inside a state payload; undo it before parsing. */
function unescapeJson(text) {
  return text.replace(/<\\\/script/gi, "</script").trim()
}

function readStates(html) {
  const states = []
  for (const [, id, body] of html.matchAll(STATE_BLOCK)) {
    // The context block is markdown in its own script type; only JSON lands here.
    try {
      states.push({ id, data: JSON.parse(unescapeJson(body)) })
    } catch {
      states.push({ id, data: null, unparsed: true })
    }
  }
  return states
}

const opts = args(process.argv.slice(2))
const slug = String(opts.slug ?? "")
if (!SLUG.test(slug))
  die(`--slug must be kebab-case: ${opts.slug ?? "(missing)"}`)
const repoDir = String(opts["repo-dir"] ?? process.cwd())
// Never default into the tree being read (see repo-modules).
const outDir = String(opts.out ?? join(tmpdir(), "steward", "prior-run", slug))
const ref = String(opts.ref ?? "origin/artifacts")
const base = `w/${slug}`

if (!git(repoDir, ["rev-parse", "--git-dir"]).ok)
  die(`${repoDir} is not a git repository`)

// A missing branch is a first run, not an error — every consumer has one.
if (opts.fetch !== "false") git(repoDir, ["fetch", "origin", "artifacts"])
if (!git(repoDir, ["rev-parse", "--verify", "--quiet", ref]).ok) {
  process.stdout.write(
    `## prior-run — ${slug}\n\nfirst run: no artifacts branch yet.\n`,
  )
  process.exit(0)
}

const listing = git(repoDir, [
  "ls-tree",
  "-r",
  "--name-only",
  ref,
  "--",
  `${base}/`,
])
const paths = listing.ok
  ? listing.out
      .split("\n")
      .map((p) => p.trim())
      .filter(Boolean)
  : []
if (!paths.includes(`${base}/index.html`)) {
  process.stdout.write(
    `## prior-run — ${slug}\n\nfirst run: nothing published at ${base}/index.html.\n`,
  )
  process.exit(0)
}

mkdirSync(outDir, { recursive: true })
const files = []
for (const path of paths) {
  const blob = git(repoDir, ["show", `${ref}:${path}`], { binary: true })
  if (!blob.ok) continue
  const target = join(outDir, path.slice(base.length + 1))
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, blob.out)
  files.push({ path, local: target, bytes: blob.out.length })
}

const html = String(git(repoDir, ["show", `${ref}:${base}/index.html`]).out)
const generatedAt = GENERATED_AT.exec(html)?.[1] ?? null
const states = readStates(html)

const receipt = git(repoDir, [
  "log",
  "-1",
  "--format=%H%x09%cI",
  ref,
  "--",
  `${base}/index.html`,
])
const [sha, publishedAt] = receipt.ok
  ? receipt.out.trim().split("\t")
  : [null, null]

const doc = {
  slug,
  ref,
  generatedAt,
  publishedAt: publishedAt ?? null,
  sha: sha ?? null,
  states,
  files,
}
const manifest = join(outDir, "prior.json")
writeFileSync(manifest, `${JSON.stringify(doc, null, 2)}\n`)

const ageHours =
  generatedAt && !Number.isNaN(Date.parse(generatedAt))
    ? Math.round((Date.now() - Date.parse(generatedAt)) / 3_600_000)
    : null

const out = [`## prior-run — ${slug}`, ""]
out.push(
  [
    generatedAt ? `generated ${generatedAt}` : "no generated-at stamp",
    ageHours !== null ? `${ageHours}h ago` : null,
    sha ? `receipt ${sha.slice(0, 7)}` : null,
  ]
    .filter(Boolean)
    .join(" · "),
)
out.push("")
out.push(
  states.length
    ? `State blocks: ${states.map((s) => s.id + (s.unparsed ? " (unparsed)" : "")).join(", ")}`
    : "State blocks: none",
)
const siblings = files.filter((f) => !f.path.endsWith("/index.html"))
out.push(
  siblings.length
    ? `Files: ${siblings.map((f) => f.path.slice(base.length + 1)).join(", ")}`
    : "Files: index.html only",
)
out.push("", `Extracted to: ${outDir}`, `Manifest: ${manifest}`)
process.stdout.write(`${out.join("\n")}\n`)
