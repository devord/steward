#!/usr/bin/env node
// Census a checkout's modules and score their entropy, from git and grep alone.
// Node built-ins only — a cloud routine has no npm install, and a run that
// spends ten minutes on a lockfile is a run that never publishes.

import { spawnSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const DAY = 86_400_000
const SOURCE =
  /\.(tsx?|jsx?|mts|cts|mjs|cjs|go|py|rb|rs|java|kt|swift|php|cs|scala|exs?|vue|svelte)$/
const TEST = /\.(test|spec|stories|ui\.test|browser\.test)\./
const NOISE = /\.(figma|generated)\./
const IMPORT = /from\s+['"]([^'"]+)['"]/g

// Exactly 15 and exactly 3, not "about". A floor the next run resolves
// differently is not a floor, and the trend would be noise rather than entropy.
const SWEEP_FILES = 15
const PAIR_FLOOR = 3

const DEFAULT_WEIGHTS = {
  "hidden coupling": 25,
  "no test seam": 20,
  "wide interface": 15,
  churn: 15,
  "stated-rule breach": 15,
  "single author": 10,
}

const DROP_PATTERNS = [
  {
    re: /(^|\/)(docs?|website|marketing|www)(\/|$)/,
    why: "docs or marketing site",
  },
  {
    re: /(^|\/)(prototypes?|sandbox|playground|examples?|scratch)(\/|$)/,
    why: "prototype or sandbox",
  },
  {
    re: /(^|\/)(locales?|assets?|styles?|public|static|fixtures-generated)(\/|$)/,
    why: "generated or vendored tree",
  },
  { re: /-config$|(^|\/)config(\/|$)/, why: "config-only package" },
]

const MIRROR =
  /(^|\/)(__mocks__|mocks|__fixtures__|fixtures|factories|handlers)(\/|$)/

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

/** A flag's value, or null when it was passed bare — `args` yields `true`. */
function flagValue(v) {
  return v === true || v === undefined ? null : v
}

function die(message) {
  process.stderr.write(`repo-modules: ${message}\n`)
  process.exit(1)
}

function git(cwd, argv, { allowFail = true } = {}) {
  const res = spawnSync("git", argv, {
    cwd,
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
  })
  if (res.status !== 0 && !allowFail)
    die(`git ${argv.slice(0, 2).join(" ")} failed: ${res.stderr}`)
  return res.status === 0 ? String(res.stdout) : ""
}

const lines = (text) =>
  text
    .split("\n")
    .map((l) => l.trimEnd())
    .filter(Boolean)
const isSource = (p) => SOURCE.test(p) && !NOISE.test(p)
const isTest = (p) => TEST.test(p)
// `**` crosses directory separators, `*` does not. Both are matched in one
// pass so neither rewrite can land inside the other's output — the two-pass
// version needed a placeholder character to keep them apart.
const globToRe = (glob) =>
  new RegExp(
    `^${glob
      .trim()
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*\*|\*/g, (m) => (m === "**" ? ".*" : "[^/]*"))}`,
  )

// ── roots ────────────────────────────────────────────────────────────────────

function workspaces(repo, ref, files) {
  const pnpm = git(repo, ["show", `${ref}:pnpm-workspace.yaml`])
  const globs = []
  if (pnpm) {
    let inPackages = false
    for (const line of pnpm.split("\n")) {
      if (/^packages:/.test(line)) {
        inPackages = true
        continue
      }
      if (inPackages) {
        const m = /^\s*-\s*["']?([^"'\s#]+)/.exec(line)
        if (m) globs.push(m[1])
        else if (/^\S/.test(line)) break
      }
    }
  }
  if (!globs.length) {
    try {
      const pkg = JSON.parse(git(repo, ["show", `${ref}:package.json`]) || "{}")
      const ws = Array.isArray(pkg.workspaces)
        ? pkg.workspaces
        : pkg.workspaces?.packages
      if (Array.isArray(ws)) globs.push(...ws)
    } catch {
      /* no root package.json — the repo root is the only workspace */
    }
  }
  if (!globs.length) return [""]

  const dirs = new Set()
  const res = globs.map(globToRe)
  for (const file of files) {
    const parts = file.split("/")
    for (let depth = 1; depth <= Math.min(parts.length - 1, 4); depth += 1) {
      const dir = parts.slice(0, depth).join("/")
      if (res.some((re) => re.test(dir))) dirs.add(dir)
    }
  }
  return dirs.size ? [...dirs].sort() : [""]
}

function sourceDir(workspace, files) {
  const under = (sub) => {
    const prefix = workspace ? `${workspace}/${sub}/` : `${sub}/`
    return files.some((f) => f.startsWith(prefix) && isSource(f))
  }
  for (const sub of ["app", "src"])
    if (under(sub)) return workspace ? `${workspace}/${sub}` : sub
  return workspace
}

function resolveRoots(repo, ref, files, opts) {
  const dropped = []
  let candidates

  if (opts.roots.length) {
    const res = opts.roots.map(globToRe)
    const dirs = new Set()
    for (const file of files) {
      if (!isSource(file)) continue
      const parts = file.split("/")
      for (let depth = 1; depth < parts.length; depth += 1) {
        const dir = parts.slice(0, depth).join("/")
        if (res.some((re) => re.test(dir))) dirs.add(dir)
      }
    }
    candidates = [...dirs].sort()
  } else {
    const dirs = new Set()
    for (const workspace of workspaces(repo, ref, files)) {
      const src = sourceDir(workspace, files)
      const prefix = src ? `${src}/` : ""
      const children = new Map()
      let loose = 0
      for (const file of files) {
        if (!file.startsWith(prefix) || !isSource(file)) continue
        const rest = file.slice(prefix.length)
        if (!rest.includes("/")) {
          loose += 1
          continue
        }
        const child = rest.split("/")[0]
        children.set(child, (children.get(child) ?? 0) + 1)
      }
      for (const [child, n] of children)
        if (n >= 3) dirs.add(`${prefix}${child}`)
      if (loose >= 3 && src) dirs.add(src)
    }
    candidates = [...dirs].sort()

    // Inference's own clean-up: a workspace list is not a codebase, and every
    // docs site or config package it hands over dilutes the ranking.
    candidates = candidates.filter((root) => {
      const hit = DROP_PATTERNS.find((p) => p.re.test(root))
      if (hit) dropped.push({ root, why: hit.why })
      return !hit
    })
  }

  // The reader's own exclude applies whichever way the roots arrived — naming
  // roots must not quietly take them off the path that reads it.
  if (opts.exclude.length) {
    const res = opts.exclude.map(globToRe)
    candidates = candidates.filter((root) => {
      const hit = res.some((re) => re.test(root))
      if (hit) dropped.push({ root, why: "params.exclude" })
      return !hit
    })
  }

  return { roots: candidates, dropped }
}

// ── modules ──────────────────────────────────────────────────────────────────

function isConventionRoot(root, files, own) {
  const marker = ["routes.ts", "routes.tsx", "routes.js"].some((f) =>
    files.includes(root ? `${root}/../${f}`.replace(/[^/]+\/\.\.\//, "") : f),
  )
  if (marker) return true
  const dotted = own.filter((f) =>
    f
      .slice(root.length + 1)
      .replace(/\.[^.]+$/, "")
      .includes("."),
  )
  return own.length >= 4 && dotted.length / own.length > 0.5
}

function flatKey(name) {
  const base = name
    .replace(TEST, ".")
    .replace(NOISE, ".")
    .replace(/\.[^.]+$/, "")
  const parts = base.split("-")
  return parts.length > 1 ? parts.slice(0, -1).join("-") : base
}

function enumerate(root, files, { siblings, dropped }) {
  // A root owns only what no more specific root claims, and nothing under a
  // tree that was dropped. Without the first a file is censused twice and both
  // rows carry the same churn; without the second a dropped tree walks back in
  // as modules of its parent.
  const claimed = [
    ...siblings.filter((r) => r !== root && r.startsWith(`${root}/`)),
    ...dropped.map((d) => d.root).filter((r) => r.startsWith(`${root}/`)),
  ]
  const own = files.filter(
    (f) =>
      f.startsWith(`${root}/`) &&
      isSource(f) &&
      !claimed.some((r) => f.startsWith(`${r}/`)),
  )
  if (!own.length) return []

  const nested = new Map()
  const loose = []
  for (const file of own) {
    const rest = file.slice(root.length + 1)
    if (!rest.includes("/")) {
      loose.push(file)
      continue
    }
    const child = rest.split("/")[0]
    if (!nested.has(child)) nested.set(child, [])
    nested.get(child).push(file)
  }

  const modules = []

  // A child directory is a module, named in the domain word the repo chose —
  // subject to the same clean-up a root gets.
  for (const [child, list] of [...nested].sort()) {
    const hit = DROP_PATTERNS.find((p) => p.re.test(`${root}/${child}`))
    if (hit) {
      dropped.push({ root: `${root}/${child}`, why: hit.why })
      continue
    }
    modules.push({
      id: `${root}#${child}`,
      root,
      name: child,
      layout: "nested",
      paths: [`${root}/${child}`],
      files: list,
    })
  }

  if (!loose.length) return modules.sort((a, b) => a.id.localeCompare(b.id))

  // Convention root: the framework's own unit. Clustering it by hyphen-prefix
  // would invent a finding out of a layout the framework requires.
  if (isConventionRoot(root, files, loose)) {
    const families = new Map()
    for (const file of loose) {
      const base = file.slice(root.length + 1).replace(/\.[^.]+$/, "")
      const head = base.split(/\.(?![^[]*\])/)[0].replace(/_$/, "")
      if (!families.has(head)) families.set(head, [])
      families.get(head).push(file)
    }
    for (const [name, list] of [...families].sort()) {
      modules.push({
        id: `${root}#${name}`,
        root,
        name,
        layout: "route",
        paths: list,
        files: list,
        entryPoint: true, // nothing imports a route; the router mounts it
      })
    }
    return modules.sort((a, b) => a.id.localeCompare(b.id))
  }

  // Loose files cluster by filename, then collapse hyphen-prefixes.
  const keyed = new Map()
  for (const file of loose) {
    const key = flatKey(file.slice(root.length + 1))
    if (!keyed.has(key)) keyed.set(key, [])
    keyed.get(key).push(file)
  }
  const merged = new Map()
  for (const key of [...keyed.keys()].sort((a, b) => a.length - b.length)) {
    const into = [...merged.keys()].find(
      (k) => key !== k && key.startsWith(`${k}-`),
    )
    const target = into ?? key
    if (!merged.has(target)) merged.set(target, [])
    merged.get(target).push(...keyed.get(key))
  }

  const other = []
  for (const [name, list] of merged) {
    if (list.filter((f) => !isTest(f)).length < 2) {
      other.push(...list)
      continue
    }
    modules.push({
      id: `${root}#${name}`,
      root,
      name,
      layout: "flat",
      paths: list,
      files: list,
    })
  }
  // Never silently drop a file: everything lands in a module or in `other`.
  if (other.length)
    modules.push({
      id: `${root}#other`,
      root,
      name: "other",
      layout: "other",
      paths: other,
      files: other,
    })
  return modules.sort((a, b) => a.id.localeCompare(b.id))
}

// ── measurement ──────────────────────────────────────────────────────────────

function moduleOf(path, index) {
  for (let depth = path.split("/").length; depth > 0; depth -= 1) {
    const hit = index.get(path.split("/").slice(0, depth).join("/"))
    if (hit) return hit
  }
  return index.get(path) ?? null
}

function measure(repo, ref, modules, files, { since, until }) {
  const index = new Map()
  for (const mod of modules)
    for (const path of mod.files) index.set(path, mod.id)
  for (const mod of modules)
    if (mod.layout === "nested") index.set(mod.paths[0], mod.id)

  const stats = new Map(
    modules.map((m) => [
      m.id,
      {
        commits: 0,
        authors: new Map(),
        sourceFiles: m.files.filter((f) => !isTest(f)).length,
        testFiles: m.files.filter((f) => isTest(f)).length,
        exports: 0,
        fanIn: new Set(),
        fanOut: new Set(),
      },
    ]),
  )

  // One log for churn, authors and co-change together.
  const log = git(repo, [
    "log",
    `--since=${since}`,
    `--until=${until}`,
    "--format=%x01%H%x09%an",
    "--name-only",
    ref,
  ])
  const pairs = new Map()
  let sweeps = 0
  let commitsSeen = 0

  for (const chunk of log.split("\x01").slice(1)) {
    const [head, ...rest] = chunk.split("\n")
    const author = head.split("\t")[1] ?? "unknown"
    const touched = rest.map((l) => l.trim()).filter(Boolean)
    commitsSeen += 1
    // A repo-wide rename couples everything to everything and is evidence of nothing.
    if (touched.length > SWEEP_FILES) {
      sweeps += 1
      continue
    }

    const ids = new Set()
    for (const path of touched) {
      const id = moduleOf(path, index)
      if (id) ids.add(id)
    }
    for (const id of ids) {
      const stat = stats.get(id)
      if (!stat) continue
      stat.commits += 1
      stat.authors.set(author, (stat.authors.get(author) ?? 0) + 1)
    }
    const sorted = [...ids].sort()
    for (let i = 0; i < sorted.length; i += 1) {
      for (let j = i + 1; j < sorted.length; j += 1) {
        const key = `${sorted[i]}\0${sorted[j]}`
        pairs.set(key, (pairs.get(key) ?? 0) + 1)
      }
    }
  }

  // TS/JS layer: one grep for exports, one for imports.
  const jsFiles = files.filter(
    (f) => /\.(tsx?|jsx?|mts|cts|mjs|cjs)$/.test(f) && !NOISE.test(f),
  )
  const hasPackageJson =
    files.includes("package.json") ||
    files.some((f) => f.endsWith("/package.json"))
  const tsLayer = hasPackageJson && jsFiles.length > 0

  if (tsLayer) {
    for (const line of lines(
      git(repo, [
        "grep",
        "-cE",
        "^export ",
        ref,
        "--",
        "*.ts",
        "*.tsx",
        "*.js",
        "*.jsx",
        "*.mjs",
      ]),
    )) {
      const [, path, count] = /^[^:]*:(.+):(\d+)$/.exec(line) ?? []
      if (!path) continue
      const id = moduleOf(path, index)
      if (id) stats.get(id).exports += Number(count)
    }

    const aliases = new Map() // alias prefix -> real dir
    try {
      const tsconfig = git(repo, ["show", `${ref}:tsconfig.json`])
      for (const [, alias, target] of tsconfig.matchAll(
        /"([^"]+)\/\*"\s*:\s*\[\s*"\.?\/?([^"*]+)\/\*"/g,
      )) {
        aliases.set(`${alias}/`, `${target.replace(/^\.\//, "")}/`)
      }
    } catch {
      /* no tsconfig — relative imports only */
    }

    const grep = git(repo, [
      "grep",
      "-hoE",
      "from ['\"][^'\"]+['\"]",
      ref,
      "--",
      "*.ts",
      "*.tsx",
      "*.js",
      "*.jsx",
      "*.mjs",
    ])
    const withFiles = git(repo, [
      "grep",
      "-noE",
      "from ['\"][^'\"]+['\"]",
      ref,
      "--",
      "*.ts",
      "*.tsx",
      "*.js",
      "*.jsx",
      "*.mjs",
    ])
    void grep
    for (const line of lines(withFiles)) {
      const [, path, rest] = /^[^:]*:([^:]+):\d+:(.*)$/.exec(line) ?? []
      if (!path) continue
      const from = moduleOf(path, index)
      if (!from) continue
      for (const [, target] of rest.matchAll(IMPORT)) {
        let resolved = null
        if (target.startsWith(".")) {
          const base = path.split("/").slice(0, -1)
          for (const part of target.split("/")) {
            if (part === ".") continue
            else if (part === "..") base.pop()
            else base.push(part)
          }
          resolved = base.join("/")
        } else {
          for (const [alias, dir] of aliases) {
            if (target.startsWith(alias)) {
              resolved = dir + target.slice(alias.length)
              break
            }
          }
        }
        // External (node_modules, a bare package name) counts toward neither side.
        if (!resolved) continue
        const to =
          moduleOf(resolved, index) ?? moduleOf(`${resolved}/index.ts`, index)
        if (!to || to === from) continue
        stats.get(from).fanOut.add(to)
        stats.get(to).fanIn.add(from)
      }
    }
  }

  return { stats, pairs, sweeps, commitsSeen, tsLayer }
}

// ── scoring ──────────────────────────────────────────────────────────────────

function score(modules, measured, { weights, rules, ruleBreaches, shallow }) {
  const { stats, pairs, tsLayer } = measured

  const exportRates = modules
    .map((m) => {
      const s = stats.get(m.id)
      return s.sourceFiles ? s.exports / s.sourceFiles : null
    })
    .filter((v) => v != null && v > 0)
    .sort((a, b) => a - b)
  const median = exportRates.length
    ? exportRates[Math.floor(exportRates.length / 2)]
    : 0

  const churns = modules
    .map((m) => stats.get(m.id).commits)
    .sort((a, b) => a - b)
  const percentile = (v) =>
    churns.length ? churns.filter((c) => c <= v).length / churns.length : 0

  // A pair below the floor is a coincidence the window is too short to tell
  // from a pattern — not weak evidence to be shaded lighter.
  const qualified = []
  let droppedPairs = 0
  for (const [key, shared] of pairs) {
    const [a, b] = key.split("\0")
    if (shared < PAIR_FLOOR) {
      droppedPairs += 1
      continue
    }
    const min = Math.min(stats.get(a)?.commits ?? 0, stats.get(b)?.commits ?? 0)
    if (!min) continue
    const strength = shared / min
    const imports = stats.get(a).fanOut.has(b) || stats.get(b).fanOut.has(a)
    const mirror = MIRROR.test(a) || MIRROR.test(b)
    qualified.push({ a, b, shared, strength, imports, mirror })
  }

  const available = {
    "hidden coupling": tsLayer && !shallow,
    "no test seam": true,
    "wide interface": tsLayer,
    churn: !shallow,
    "stated-rule breach": rules.length > 0,
    "single author": !shallow,
  }

  const scored = modules.map((mod) => {
    const s = stats.get(mod.id)
    const penalties = []
    const add = (name, raw, note) => {
      if (!available[name]) return
      const max = weights[name]
      penalties.push({
        name,
        value: Math.min(raw, max),
        max,
        capped: raw > max,
        note,
      })
    }

    const hidden = available["hidden coupling"]
      ? qualified.filter(
          (p) =>
            (p.a === mod.id || p.b === mod.id) &&
            p.strength >= 0.4 &&
            !p.imports &&
            !p.mirror,
        )
      : []
    add(
      "hidden coupling",
      hidden.length * 8,
      hidden.length ? `×${hidden.length}` : null,
    )

    const total = s.sourceFiles + s.testFiles
    const testedShare = total ? s.testFiles / total : 0
    add(
      "no test seam",
      weights["no test seam"] * (1 - testedShare),
      `${Math.round(testedShare * 100)}% tested`,
    )

    const rate = s.sourceFiles ? s.exports / s.sourceFiles : 0
    const wide = median > 0 ? Math.max(0, (rate - median) / median) : 0
    add(
      "wide interface",
      weights["wide interface"] * Math.min(1, wide),
      `${rate.toFixed(1)}/file vs ${median.toFixed(1)} median`,
    )

    add("churn", weights.churn * percentile(s.commits), `${s.commits} commits`)

    const breached = ruleBreaches.get(mod.id) ?? []
    add(
      "stated-rule breach",
      breached.length * 8,
      breached.length ? breached.join("; ") : null,
    )

    const authors = s.authors.size
    add(
      "single author",
      authors <= 1 ? 10 : authors === 2 ? 5 : 0,
      `${authors || 0} author${authors === 1 ? "" : "s"}`,
    )

    // Normalize to percent-of-available-max: a repo must never score higher
    // merely for being unmeasurable, nor lower.
    const raised = penalties.reduce((n, p) => n + p.value, 0)
    const ceiling = penalties.reduce((n, p) => n + p.max, 0)
    const top = [...s.authors].sort((a, b) => b[1] - a[1])[0] ?? null

    return {
      id: mod.id,
      root: mod.root,
      name: mod.name,
      // `census.json` is a published contract: routine templates in data repos
      // read it, and a renamed key hands them `undefined` with no error. The
      // internal name is `layout`; the emitted one stays what it has always
      // been. The rule below matches the bare substring "shape" and offers no
      // allowlist, so a naming lint would otherwise rewrite a wire format.
      // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names
      shape: mod.layout,
      score: ceiling ? Math.round((100 * raised) / ceiling) : 0,
      penalties,
      commits: s.commits,
      authors,
      topAuthor: top
        ? { name: top[0], share: s.commits ? top[1] / s.commits : 0 }
        : null,
      sourceFiles: s.sourceFiles,
      testFiles: s.testFiles,
      testedShare,
      exports: s.exports,
      fanIn: mod.entryPoint ? null : s.fanIn.size,
      fanOut: s.fanOut.size,
      hiddenCoupling: hidden.map((p) => ({
        with: p.a === mod.id ? p.b : p.a,
        shared: p.shared,
        strength: p.strength,
      })),
    }
  })

  scored.sort(
    (a, b) =>
      b.score - a.score || b.commits - a.commits || a.id.localeCompare(b.id),
  )
  return { scored, pairs: qualified, droppedPairs, available }
}

function checkRules(repo, ref, rules, modules, files) {
  const index = new Map()
  for (const mod of modules)
    for (const path of mod.files) index.set(path, mod.id)
  const breaches = new Map()
  for (const rule of rules) {
    const pathspec = rule.pathspec ? [rule.pathspec] : []
    const hits = lines(
      git(repo, ["grep", "-lE", rule.pattern, ref, "--", ...pathspec]),
    )
    for (const line of hits) {
      const path = line.replace(/^[^:]*:/, "")
      const id = moduleOf(path, index)
      if (!id) continue
      if (!breaches.has(id)) breaches.set(id, [])
      if (!breaches.get(id).includes(rule.text))
        breaches.get(id).push(rule.text)
    }
  }
  void files
  return breaches
}

// ── one scored point ─────────────────────────────────────────────────────────

function censusAt(repo, ref, opts) {
  const files = lines(git(repo, ["ls-tree", "-r", "--name-only", ref]))
  if (!files.length) die(`no files at ${ref}`)

  const { roots, dropped } = resolveRoots(repo, ref, files, opts)
  if (!roots.length) return null

  const modules = roots.flatMap((root) =>
    enumerate(root, files, { siblings: roots, dropped }),
  )
  if (!modules.length) return null

  const until = git(repo, ["log", "-1", "--format=%cI", ref]).trim()
  // Never a relative date: a historical point would silently reuse today's window.
  const since = new Date(Date.parse(until) - opts.window * DAY).toISOString()

  const measured = measure(repo, ref, modules, files, { since, until })
  const ruleBreaches = checkRules(repo, ref, opts.rules, modules, files)
  const shallow =
    git(repo, ["rev-parse", "--is-shallow-repository"]).trim() === "true"
  const result = score(modules, measured, {
    weights: opts.weights,
    rules: opts.rules,
    ruleBreaches,
    shallow,
  })

  return {
    ref,
    sha: git(repo, ["rev-parse", ref]).trim(),
    at: until,
    window: { since, until, days: opts.window },
    roots,
    dropped,
    shallow,
    sweeps: measured.sweeps,
    commitsSeen: measured.commitsSeen,
    ...result,
  }
}

// ── main ─────────────────────────────────────────────────────────────────────

const opts = args(process.argv.slice(2))
const repo = String(opts.repo ?? process.cwd())
if (!git(repo, ["rev-parse", "--git-dir"]))
  die(`${repo} is not a git repository`)

const csv = (v) =>
  String(flagValue(v) ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
const weights = { ...DEFAULT_WEIGHTS }
for (const pair of csv(opts.weights)) {
  const [name, value] = pair.split("=").map((s) => s.trim())
  const key = Object.keys(weights).find(
    (k) => k.replace(/\s/g, "") === name.replace(/\s/g, ""),
  )
  if (key) weights[key] = Number(value)
}
const sum = Object.values(weights).reduce((a, b) => a + b, 0)
if (Math.round(sum) !== 100) die(`weights must sum to 100, got ${sum}`)

const rules = []
const rulesArg = flagValue(opts.rules)
if (rulesArg) {
  const text = String(rulesArg).includes("::")
    ? String(rulesArg)
    : readFileSync(String(rulesArg), "utf8")
  for (const line of text.split("\n")) {
    const parts = line.split("::").map((s) => s.trim())
    if (parts.length < 2 || !parts[0]) continue
    rules.push({
      text: parts[0],
      pattern: parts[1],
      pathspec: parts[2] ?? null,
    })
  }
}

const config = {
  window: Number(opts.window ?? 90),
  history: Number(opts.history ?? 8),
  roots: csv(opts.roots),
  exclude: csv(opts.exclude),
  weights,
  rules,
}
if (!Number.isFinite(config.window) || config.window <= 0)
  die(`--window must be positive`)

const head = String(opts.ref ?? "HEAD")
const now = censusAt(repo, head, config)
if (!now) die("no modules found — check --roots and --exclude")

// The trend is recomputed from git at each point, never read from a stored
// file: run 1 ships with a full trend, a skipped week leaves no hole, and
// changing the weights re-bases the whole history instead of comparing two
// different formulas.
const trend = []
if (!now.shallow && config.history > 1) {
  const headAt = Date.parse(now.at)
  for (let i = config.history - 1; i >= 1; i -= 1) {
    const boundary = new Date(headAt - i * 7 * DAY).toISOString()
    const sha = git(repo, [
      "rev-list",
      "-1",
      `--before=${boundary}`,
      head,
    ]).trim()
    if (!sha) continue
    if (trend.some((p) => p.sha === sha)) continue
    const point = censusAt(repo, sha, config)
    if (point)
      trend.push({
        sha,
        at: point.at,
        scores: Object.fromEntries(point.scored.map((m) => [m.id, m.score])),
      })
  }
}
trend.push({
  sha: now.sha,
  at: now.at,
  scores: Object.fromEntries(now.scored.map((m) => [m.id, m.score])),
})

for (const mod of now.scored) {
  mod.series = trend.map((p) => p.scores[mod.id] ?? null)
  const seen = mod.series.filter((v) => v != null)
  const delta = seen.length > 1 ? seen[seen.length - 1] - seen[0] : 0
  mod.direction = delta > 2 ? "worsening" : delta < -2 ? "improving" : "steady"
  mod.arrow = delta > 2 ? "↗" : delta < -2 ? "↘" : "→"
}

// Never default into the tree being read: a primitive that dirties its own
// subject can get its scratch output committed by accident.
const outDir = String(opts.out ?? join(tmpdir(), "steward", "repo-modules"))
mkdirSync(outDir, { recursive: true })
const file = join(outDir, "census.json")
const doc = {
  generatedAt: new Date().toISOString(),
  repo,
  ...now,
  weights,
  rules: rules.map((r) => r.text),
  trendPoints: trend.length,
  hot: now.scored.slice(0, 5).map((m) => m.id),
}
writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`)

const worst = now.scored[0]
const unavailable = Object.entries(now.available)
  .filter(([, ok]) => !ok)
  .map(([k]) => k)
const out = [
  `## repo-modules — ${now.scored.length} modules across ${now.roots.length} roots`,
  "",
]
out.push(
  `worst: ${worst.name} (${worst.root}) ${worst.score} ${worst.arrow} · ${worst.commits} commits · ${worst.authors} author${worst.authors === 1 ? "" : "s"} · ${Math.round(worst.testedShare * 100)}% tested`,
  "",
)
out.push("### Top by score")
for (const mod of now.scored.slice(0, 8)) {
  const bits = [
    `${mod.score} ${mod.arrow}`,
    `${mod.commits} commits`,
    `${Math.round(mod.testedShare * 100)}% tested`,
  ]
  if (mod.fanIn !== null) bits.push(`in ${mod.fanIn} / out ${mod.fanOut}`)
  if (mod.hiddenCoupling.length)
    bits.push(`${mod.hiddenCoupling.length} hidden coupling`)
  out.push(`- ${mod.root} · ${mod.name} — ${bits.join(" · ")}`)
}
out.push("")
out.push(
  `Signals unavailable: ${unavailable.length ? unavailable.join(", ") : "none"}`,
)
out.push(
  `Window ${config.window}d · ${now.commitsSeen} commits · ${now.sweeps} sweeps ignored · ${now.droppedPairs} pairs below the ${PAIR_FLOOR}-commit floor`,
)
if (now.dropped.length)
  out.push(
    `Roots dropped: ${now.dropped.map((d) => `${d.root} (${d.why})`).join(", ")}`,
  )
out.push(
  `Trend: ${trend.length} point${trend.length === 1 ? "" : "s"}${now.shallow ? " — shallow clone, no history" : ""}`,
)
out.push("", `Full census: ${file}`)
process.stdout.write(`${out.join("\n")}\n`)
