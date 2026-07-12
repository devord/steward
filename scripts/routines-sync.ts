/**
 * Reconcile data/routines.yaml against the account's enacted state on every
 * host (ADR-0005/0012): cloud routines on the runner's Claude account and
 * launchd agents on this machine. The YAML is the source of truth; every
 * enacted copy is a projection holding a stable pointer prompt, its trigger
 * (cron, API trigger, or launchd calendar), and — for cloud routines — the
 * source repos and MCP connector allowlist the run needs (ADR-0018).
 *
 * Works for the home data repo and for any shared one (ADR-0023): a repo is
 * shared iff it differs from `<login>/steward-data-<login>`. In a shared
 * repo only entries whose `runner` matches the signed-in login are enacted —
 * each collaborator owns the cloud resources for the routines they run.
 * Every pointer prompt names its repo explicitly: with N data repos "the"
 * data repo is ambiguous.
 *
 * Per routine, by host × schedule (ADR-0012/0016):
 *   - cloud + schedule  → a scheduled cloud routine (as before);
 *   - cloud + manual    → a cloud routine with an API trigger; its token is
 *     minted in the web UI (research preview), pasted here once, and
 *     committed to the data repo as data/triggers/<slug>.json;
 *   - local + schedule  → a launchd agent
 *     (~/Library/LaunchAgents/org.devord.steward.<slug>.plist) firing
 *     the identical pointer prompt via headless `claude -p`;
 *   - local + manual    → nothing to enact: run it interactively
 *     (`pnpm routine <slug>`, ADR-0017).
 * Every cloud routine can carry an API trigger — for manual ones it is the
 * only way to run, for scheduled ones it powers the app's Update button
 * between crons — so --apply prompts for every missing token in one sitting
 * (skippable; `pnpm routine:trigger <slug>` mints one later).
 *
 * Cloud routine state has no public read API — it's managed by Claude
 * Code's schedule tooling. So this script:
 *   - default: prints the desired state as a reconciliation plan;
 *   - --apply: hands the cloud plan to a headless `claude -p` run, writes
 *     the launchd plists (deleting orphans), and prompts for missing
 *     trigger tokens.
 *
 * Usage: pnpm routines:sync [--repo <owner/repo>]
 *                           [--file <path/to/routines.yaml>] [--apply]
 *
 * --repo without --file (the copy-pasteable form the app shows) uses a
 * script-managed clone under ~/.cache/steward/repos/; --file targets a
 * checkout you manage; neither means "run from a data-repo checkout".
 */
import { execFileSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import os from "node:os"
import path from "node:path"

import {
  type Routine,
  cloudSources,
  parseRoutinesFile,
  routineHost,
  triggerPath,
} from "@steward/schema"

import { ghLogin, inferRepo, repoTag, routinesFileFor } from "./data-repo.ts"
import { cronToLaunchd, launchdPlist, plistRepo } from "./launchd.ts"
import { promptTriggerToken } from "./trigger-token.ts"

/**
 * Where the contract skills (run-routine, widget-artifact, publish-widget)
 * live — always attached to a cloud run so the pointer prompt resolves,
 * across personal and team repos alike (ADR-0018).
 */
const CONTRACT_REPO = "devord/steward"

const args = process.argv.slice(2)
const apply = args.includes("--apply")
const fileFlag = args.indexOf("--file")
const repoFlag = args.indexOf("--repo")
const repoArg = repoFlag !== -1 ? (args[repoFlag + 1] ?? null) : null
const file = routinesFileFor(
  fileFlag !== -1 ? (args[fileFlag + 1] ?? null) : null,
  repoArg,
)

if (!existsSync(file)) {
  console.error(
    `routines-sync: ${file} not found.\n` +
      "Run from a data-repo checkout, or pass --repo <owner/repo> or" +
      " --file <path/to/routines.yaml>.",
  )
  process.exit(1)
}

/** The data repo checkout the file lives in — launchd cwd, token commits. */
const dataRepoDir = path.dirname(path.dirname(file))

let routines: Routine[]
try {
  routines = parseRoutinesFile(readFileSync(file, "utf8")).routines
} catch (error) {
  console.error(
    `routines-sync: ${file} is not a valid routines file:\n` +
      `  ${error instanceof Error ? error.message : String(error)}`,
  )
  process.exit(1)
}

const repo = repoArg ?? inferRepo(path.dirname(file))
const login = ghLogin()

// Fail closed: with a known target repo but no gh login we cannot tell
// home from shared — guessing home would sync a shared file's every entry
// under the wrong ownership, ignoring runner claims.
if (repo != null && login == null) {
  console.error(
    `routines-sync: can't determine the gh login (is \`gh\` authenticated?),\n` +
      `so ${repo} can't be classified as home or shared. Run \`gh auth login\`.`,
  )
  process.exit(1)
}

// Shared: the target repo is not the signed-in user's own home data repo.
// The naming convention mirrors the app's resolveHomeRepo (ADR-0001/0023).
const shared =
  repo != null && login != null && repo !== `${login}/steward-data-${login}`

if (shared) {
  console.log(`# shared repo: ${repo} (runner: ${login})\n`)
}

/**
 * The data repo to attach as a source and name in prompts. Normally `repo`
 * (the --repo flag or the checkout's inferred origin); when the origin
 * can't be inferred, fall back to the home-repo convention
 * `<login>/steward-data-<login>` (ADR-0001), the same name run-routine
 * resolves at runtime. Null only when neither is known — a `gh`-less run
 * against a remote-less checkout.
 */
const dataRepo =
  repo ?? (login != null ? `${login}/steward-data-${login}` : null)

/** The stable pointer prompt — created once, never edited (ADR-0005).
    Always names the repo: with N data repos (ADR-0023) an unclaused
    prompt is ambiguous, so every command is explicit. */
function pointerPrompt(routine: Routine): string {
  return `Run the steward routine \`${routine.slug}\` in \`${dataRepo ?? "(unknown repo)"}\` — follow the run-routine skill.`
}

/** Cloud routine name; the steward- prefix marks ownership for cleanup,
    and shared repos carry their full repo tag (owner AND name) so no two
    repos' slugs can collide on one Claude account. */
function cloudName(routine: Routine): string {
  if (!shared) return `steward-${routine.slug}`
  return `steward-${repoTag(repo ?? "shared")}-${routine.slug}`
}

/**
 * Source repos to attach to this routine's cloud run (ADR-0018): the
 * contract repo and the data repo, always, plus the routine's declared
 * extras. A cloud session can only reach repos attached as sources.
 */
function sourcesFor(routine: Routine): string[] {
  const base = dataRepo != null ? [CONTRACT_REPO, dataRepo] : [CONTRACT_REPO]
  return cloudSources(routine, base)
}

/** Connector allowlist for this routine's cloud run; empty means none. */
function connectorsFor(routine: Routine): string[] {
  return routine.connectors ?? []
}

/** Comma-joined list, or "(none)" so an empty set reads as intentional. */
function orNone(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "(none)"
}

// In a shared repo each collaborator syncs only the routines they run —
// otherwise every sync would duplicate every schedule onto every account.
let mine = routines
if (shared) {
  const skipped = routines.filter((routine) => routine.runner !== login)
  mine = routines.filter((routine) => routine.runner === login)
  for (const routine of skipped) {
    console.warn(
      routine.runner
        ? `# skipping ${routine.slug} — runner is ${routine.runner}`
        : `# skipping ${routine.slug} — no runner set (add "runner: <login>")`,
    )
  }
  if (skipped.length > 0) console.warn("")
}

const enabled = mine.filter((routine) => routine.enabled)
const disabled = mine.filter((routine) => !routine.enabled)

const cloudScheduled = enabled.filter(
  (routine) => routineHost(routine) === "cloud" && routine.schedule != null,
)
const cloudManual = enabled.filter(
  (routine) => routineHost(routine) === "cloud" && routine.schedule == null,
)
const localScheduled = enabled.filter(
  (routine) => routineHost(routine) === "local" && routine.schedule != null,
)
const localManual = enabled.filter(
  (routine) => routineHost(routine) === "local" && routine.schedule == null,
)

function hasTrigger(routine: Routine): boolean {
  return existsSync(path.join(dataRepoDir, triggerPath(routine.slug)))
}

// --- Cloud half -------------------------------------------------------------

const orphanRule = `# Routines named steward-* whose prompt targets \`${dataRepo}\` and are
# not listed here are orphans and should be deleted — including legacy ones
# whose prompt has no "in \`<owner/repo>\`" clause when this is the home
# repo. Never touch routines whose prompt names a different repo — those
# belong to other repos' syncs.`

const cloudPlan = [
  "# Steward routines — desired cloud state",
  "#",
  "# One cloud routine per enabled cloud entry. The prompt is a stable",
  "# pointer; instructions edits in routines.yaml need no cloud change. The",
  "# cron, the repos, and the connectors below are all reconciled — any of",
  "# them can drift. repos is the exact source set (a cloud run reaches only",
  "# attached repos); connectors is the exact MCP allowlist, empty meaning",
  "# none (ADR-0018). Manual entries have no cron: they carry an API trigger",
  "# instead (ADR-0016).",
  orphanRule,
  "",
  ...cloudScheduled.flatMap((routine) => [
    `routine: ${cloudName(routine)}`,
    `  cron:       ${routine.schedule}`,
    `  prompt:     ${pointerPrompt(routine)}`,
    `  repos:      ${orNone(sourcesFor(routine))}`,
    `  connectors: ${orNone(connectorsFor(routine))}`,
    `  trigger:    ${triggerPath(routine.slug)} ${hasTrigger(routine) ? "(token present)" : "(no token — the app's Update button won't work; see below)"}`,
    "",
  ]),
  ...cloudManual.flatMap((routine) => [
    `routine: ${cloudName(routine)}`,
    "  cron:       none — manual, fired via its API trigger (ADR-0016)",
    `  prompt:     ${pointerPrompt(routine)}`,
    `  repos:      ${orNone(sourcesFor(routine))}`,
    `  connectors: ${orNone(connectorsFor(routine))}`,
    `  trigger:    ${triggerPath(routine.slug)} ${hasTrigger(routine) ? "(token present)" : "(TOKEN MISSING — see below)"}`,
    "",
  ]),
  ...(disabled.length > 0
    ? [
        "# Disabled (must NOT be scheduled — delete if present):",
        ...disabled.map((routine) => `#   ${cloudName(routine)}`),
        "",
      ]
    : []),
]

console.log(cloudPlan.join("\n"))

// The data repo couldn't be determined (no --repo, unascertainable origin,
// no gh login), so every cloud plan above lists only the contract repo —
// its run can't reach routines.yaml. Say so loudly rather than enact a
// half-attached routine.
if (dataRepo == null && cloudScheduled.length + cloudManual.length > 0) {
  console.error(
    "# WARNING: couldn't determine the data repo (no --repo, no inferable\n" +
      "# origin, no gh login), so the cloud repos above omit it — those runs\n" +
      "# can't reach routines.yaml. Pass --repo <owner/repo> or run from a\n" +
      "# checkout with an origin remote.\n",
  )
}

// --- Local half (launchd, ADR-0012) ------------------------------------------

const LABEL_PREFIX = "org.devord.steward."
const agentsDir = path.join(os.homedir(), "Library", "LaunchAgents")
const logsDir = path.join(os.homedir(), "Library", "Logs", "steward")

interface PlistPlan {
  routine: Routine
  label: string
  plistPath: string
  content: string
}

const localRepo = repo ?? "(unknown repo)"
const plistPlans: PlistPlan[] = []
const localErrors: string[] = []
for (const routine of localScheduled) {
  const schedule = cronToLaunchd(routine.schedule ?? "")
  if (!schedule) {
    localErrors.push(
      `${routine.slug}: cron "${routine.schedule}" doesn't translate to a launchd calendar — simplify it or make the routine manual`,
    )
    continue
  }
  const label = `${LABEL_PREFIX}${routine.slug}`
  plistPlans.push({
    routine,
    label,
    plistPath: path.join(agentsDir, `${label}.plist`),
    content: launchdPlist({
      label,
      repo: localRepo,
      prompt: pointerPrompt(routine),
      cwd: dataRepoDir,
      addDir: path.resolve(import.meta.dirname, ".."),
      logFile: path.join(logsDir, `${routine.slug}.log`),
      schedule,
    }),
  })
}

/** Synced plists for this repo that no enabled local-scheduled routine
    claims anymore — including routines moved to cloud, made manual, or
    disabled. Plists owned by other repos' syncs are never touched. */
function findOrphanPlists(): string[] {
  if (!existsSync(agentsDir)) return []
  const desired = new Set(plistPlans.map((plan) => plan.plistPath))
  return readdirSync(agentsDir)
    .filter((name) => name.startsWith(LABEL_PREFIX) && name.endsWith(".plist"))
    .map((name) => path.join(agentsDir, name))
    .filter((plistPath) => {
      if (desired.has(plistPath)) return false
      try {
        return plistRepo(readFileSync(plistPath, "utf8")) === localRepo
      } catch {
        return false
      }
    })
}

const orphanPlists = findOrphanPlists()

console.log("# Steward routines — desired local state (launchd)")
if (localErrors.length > 0) {
  console.error(localErrors.map((e) => `# ERROR ${e}`).join("\n"))
}
if (plistPlans.length === 0 && orphanPlists.length === 0) {
  console.log("# nothing scheduled locally, no orphaned agents\n")
} else {
  for (const plan of plistPlans) {
    console.log(`agent: ${plan.plistPath}`)
    console.log(`  cron:   ${plan.routine.schedule}`)
    console.log(`  prompt: ${pointerPrompt(plan.routine)}`)
    console.log("")
  }
  for (const orphan of orphanPlists) {
    console.log(`orphan: ${orphan} (will be removed)`)
  }
  console.log("")
}
for (const routine of localManual) {
  console.log(
    `# ${routine.slug} is manual + local — nothing to enact; run it with \`pnpm routine ${routine.slug}\` (ADR-0016/0017)`,
  )
}
if (localManual.length > 0) console.log("")

// Every cloud routine wants a trigger: manual ones can't run without it,
// scheduled ones need it for the app's Update button — so set it up at
// enact time rather than as a later chore.
const missingTriggers = [...cloudScheduled, ...cloudManual].filter(
  (routine) => !hasTrigger(routine),
)

if (!apply) {
  if (missingTriggers.length > 0) {
    console.log(
      "# Missing API-trigger tokens (create the trigger in the Claude web",
      "\n# UI, then re-run with --apply — or run `pnpm routine:trigger",
      "\n# <slug>` any time — to paste + commit them):",
    )
    for (const routine of missingTriggers) {
      console.log(`#   ${routine.slug} → ${triggerPath(routine.slug)}`)
    }
    console.log("")
  }
  console.log(
    "Dry run. Apply with `pnpm routines:sync --apply` (drives a headless\n" +
      "claude run for the cloud half and writes the launchd agents), or\n" +
      "reconcile by hand via /schedule in Claude Code.",
  )
  process.exit(localErrors.length > 0 ? 1 : 0)
}

// --- Apply: cloud -------------------------------------------------------------

const instructions = [
  "Reconcile my cloud Claude Code routines with the desired state below,",
  "using your routine/schedule tooling (the claude.ai code-triggers API:",
  "list, get, create, update). Each routine's source repos live at",
  "job_config.ccr.session_context.sources[].git_repository.url and its MCP",
  "connectors at mcp_connections[]; both are settable on create and update.",
  "1. List the current cloud routines (and read one existing routine to see",
  "   the shape of sources[] and mcp_connections[]).",
  "2. Create every listed routine that is missing, with EXACTLY the given",
  "   name, cron, prompt, repos (as sources[]), and connectors (as",
  "   mcp_connections[]). For entries marked manual (no cron): create the",
  "   routine WITHOUT any schedule if your tooling supports that; otherwise",
  "   report it as needing manual creation in the Claude web UI.",
  "3. For each listed routine that already exists, reconcile it to match:",
  "   fix a drifted cron; set sources[] to EXACTLY the listed repos (add",
  "   missing, remove extras); set mcp_connections[] to EXACTLY the listed",
  "   connectors (add missing, remove extras). A routine with connectors",
  "   '(none)' must end up with an empty mcp_connections[]. Never edit an",
  "   existing routine's prompt.",
  "4. To set a connector you must supply its account-specific connector_uuid",
  "   and url. Resolve each connector NAME to its uuid/url from the",
  "   mcp_connections[] of the existing routines you listed in step 1 (they",
  "   already map name → uuid/url on this account). If a listed connector",
  "   name resolves to no uuid anywhere, do NOT guess — report it as",
  "   unresolved and leave that routine's other changes applied.",
  "5. Delete orphans per the rule in the plan (this covers the disabled",
  "   ones). Match on the prompt's repo clause, not just the name.",
  "6. Print a summary table: name, action taken (created/ok/reconciled/",
  "   deleted/needs-web-ui), and what changed (cron/repos/connectors).",
  "Touch nothing that is not named steward-*.",
  "",
  cloudPlan.join("\n"),
].join("\n")

console.log("Applying cloud state via `claude -p`…\n")
try {
  execFileSync("claude", ["-p", instructions], { stdio: "inherit" })
} catch {
  console.error(
    "routines-sync: `claude -p` failed. Is the Claude Code CLI installed" +
      " and authenticated? The plan above can be applied by hand via" +
      " /schedule.",
  )
  process.exit(1)
}

// --- Apply: local (launchd) ---------------------------------------------------

if (plistPlans.length > 0 || orphanPlists.length > 0) {
  if (process.platform !== "darwin") {
    console.error(
      "routines-sync: local routines use launchd — only enactable on macOS.",
    )
  } else {
    mkdirSync(agentsDir, { recursive: true })
    mkdirSync(logsDir, { recursive: true })
    const uid = process.getuid?.() ?? 501
    let launchctlError = ""
    /** True on success; bootout of a not-loaded agent is routine noise,
        so callers decide which failures matter. */
    const launchctl = (argv: string[]): boolean => {
      try {
        execFileSync("launchctl", argv, { stdio: "pipe" })
        return true
      } catch (error) {
        const stderr =
          error instanceof Error && "stderr" in error
            ? String(Reflect.get(error, "stderr")).trim()
            : String(error)
        launchctlError = stderr
        return false
      }
    }
    for (const plan of plistPlans) {
      const current = existsSync(plan.plistPath)
        ? readFileSync(plan.plistPath, "utf8")
        : null
      if (current === plan.content) {
        console.log(`launchd: ${plan.label} ok`)
        continue
      }
      writeFileSync(plan.plistPath, plan.content)
      launchctl(["bootout", `gui/${uid}/${plan.label}`])
      if (launchctl(["bootstrap", `gui/${uid}`, plan.plistPath])) {
        console.log(`launchd: ${plan.label} ${current ? "updated" : "created"}`)
      } else {
        localErrors.push(
          `${plan.label}: launchctl bootstrap failed — ${launchctlError}`,
        )
        console.error(
          `launchd: ${plan.label} FAILED to load — ${launchctlError}`,
        )
      }
    }
    for (const orphan of orphanPlists) {
      const label = path.basename(orphan, ".plist")
      launchctl(["bootout", `gui/${uid}/${label}`])
      rmSync(orphan)
      console.log(`launchd: ${label} removed (orphan)`)
    }
  }
}

// --- Apply: missing trigger tokens (ADR-0016) ----------------------------------

if (missingTriggers.length > 0) {
  if (!process.stdin.isTTY) {
    console.error(
      "routines-sync: cloud routines are missing trigger tokens" +
        ` (${missingTriggers.map((r) => r.slug).join(", ")}) — re-run in a` +
        " terminal to paste them, or use `pnpm routine:trigger <slug>`.",
    )
  } else {
    console.log(
      "\nAPI triggers are research preview: create the trigger and mint its" +
        "\ntoken in the Claude web UI (shown once), then paste both here —" +
        "\nthey are committed to the data repo, where repo read access is" +
        "\nexactly the entitlement to fire (ADR-0016). Manual routines can't" +
        "\nrun without one; scheduled routines need one only for the app's" +
        "\nUpdate button. Leave empty to skip (mint later with" +
        "\n`pnpm routine:trigger <slug>`).\n",
    )
    for (const routine of missingTriggers) {
      promptTriggerToken(routine.slug, dataRepoDir)
    }
  }
}

if (localErrors.length > 0) process.exit(1)
