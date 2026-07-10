/**
 * Reconcile data/routines.yaml against the account's enacted state on every
 * host (ADR-0005/0012): cloud routines on the runner's Claude account and
 * launchd agents on this machine. The YAML is the source of truth; every
 * enacted copy is a projection holding nothing but a stable pointer prompt
 * plus its trigger (cron, API trigger, or launchd calendar).
 *
 * Works for a personal data repo and for the shared team repo (ADR-0010):
 * team runs are classified by the target repo differing from
 * `<login>/bulletin-data-<login>`. In team mode only entries whose `runner`
 * matches the signed-in login are enacted — each teammate owns the cloud
 * resources for the routines they created — and prompts carry the repo.
 *
 * Per routine, by host × schedule (ADR-0012/0016):
 *   - cloud + schedule  → a scheduled cloud routine (as before);
 *   - cloud + manual    → a cloud routine with an API trigger; its token is
 *     minted in the web UI (research preview), pasted here once, and
 *     committed to the data repo as data/triggers/<slug>.json;
 *   - local + schedule  → a launchd agent
 *     (~/Library/LaunchAgents/co.formfactory.bulletin.<slug>.plist) firing
 *     the identical pointer prompt via headless `claude -p`;
 *   - local + manual    → nothing to enact: run it interactively
 *     (`pnpm routine <slug>`, ADR-0017).
 *
 * Cloud routine state has no public read API — it's managed by Claude
 * Code's schedule tooling. So this script:
 *   - default: prints the desired state as a reconciliation plan;
 *   - --apply: hands the cloud plan to a headless `claude -p` run, writes
 *     the launchd plists (deleting orphans), and prompts for missing
 *     trigger tokens.
 *
 * Usage: pnpm routines:sync [--file <path/to/routines.yaml>]
 *                           [--repo <owner/repo>] [--apply]
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
import { createInterface } from "node:readline/promises"

import {
  type Routine,
  parseRoutinesFile,
  routineHost,
  triggerFileSchema,
  triggerPath,
} from "@bulletin/schema"

import { cronToLaunchd, launchdPlist, plistRepo } from "./launchd.ts"

const args = process.argv.slice(2)
const apply = args.includes("--apply")
const fileFlag = args.indexOf("--file")
const file =
  fileFlag !== -1 && args[fileFlag + 1]
    ? path.resolve(args[fileFlag + 1])
    : path.resolve("data", "routines.yaml")

if (!existsSync(file)) {
  console.error(
    `routines-sync: ${file} not found.\n` +
      "Run from a data-repo checkout, or pass --file <path/to/routines.yaml>.",
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

/** `owner/name` of the checkout's origin remote, or null. */
function inferRepo(dir: string): string | null {
  try {
    const url = execFileSync(
      "git",
      ["-C", dir, "remote", "get-url", "origin"],
      { encoding: "utf8" },
    ).trim()
    const match = /github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/.exec(url)
    return match ? `${match[1]}/${match[2]}` : null
  } catch {
    return null
  }
}

function ghLogin(): string | null {
  try {
    return execFileSync("gh", ["api", "user", "--jq", ".login"], {
      encoding: "utf8",
    }).trim()
  } catch {
    return null
  }
}

const repoFlag = args.indexOf("--repo")
const repo =
  repoFlag !== -1 && args[repoFlag + 1]
    ? args[repoFlag + 1]
    : inferRepo(path.dirname(file))
const login = ghLogin()

// Fail closed: with a known target repo but no gh login we cannot tell
// personal from team mode — guessing personal would sync a team file's
// every entry as unclaused personal schedules under the wrong ownership.
if (repo != null && login == null) {
  console.error(
    `routines-sync: can't determine the gh login (is \`gh\` authenticated?),\n` +
      `so ${repo} can't be classified as personal or team. Run \`gh auth login\`.`,
  )
  process.exit(1)
}

// Team mode: the target repo is not the signed-in user's own data repo.
// The naming convention mirrors the app's resolveDataRepo (ADR-0001).
const teamMode =
  repo != null && login != null && repo !== `${login}/bulletin-data-${login}`

if (teamMode) {
  console.log(`# team repo: ${repo} (runner: ${login})\n`)
}

/** The stable pointer prompt — created once, never edited (ADR-0005).
    Team prompts carry the repo so the dispatcher targets it (ADR-0010). */
function pointerPrompt(routine: Routine): string {
  return teamMode
    ? `Run the bulletin routine \`${routine.slug}\` in \`${repo}\` — follow the run-routine skill.`
    : `Run the bulletin routine \`${routine.slug}\` — follow the run-routine skill.`
}

/** Cloud routine name; the bulletin- prefix marks ownership for cleanup. */
function cloudName(routine: Routine): string {
  return teamMode ? `bulletin-team-${routine.slug}` : `bulletin-${routine.slug}`
}

// In team mode each teammate syncs only the routines they run — otherwise
// every sync would duplicate every schedule onto every account.
let mine = routines
if (teamMode) {
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

const orphanRule = teamMode
  ? `# Routines named bulletin-team-* whose prompt targets \`${repo}\` and are
# not listed here are orphans and should be deleted. Never touch routines
# whose prompt names a different repo, or has no repo clause.`
  : `# Routines named bulletin-* whose prompt has NO "in \`<owner/repo>\`"
# clause and are not listed here are orphans and should be deleted. Never
# touch routines whose prompt names a repo — those belong to team syncs.`

const cloudPlan = [
  "# Bulletin routines — desired cloud state",
  "#",
  "# One cloud routine per enabled cloud entry. The prompt is a stable",
  "# pointer; instructions edits in routines.yaml need no cloud change —",
  "# only the cron below ever drifts. Manual entries have no cron: they",
  "# carry an API trigger instead (ADR-0016).",
  orphanRule,
  "",
  ...cloudScheduled.flatMap((routine) => [
    `routine: ${cloudName(routine)}`,
    `  cron:   ${routine.schedule}`,
    `  prompt: ${pointerPrompt(routine)}`,
    "",
  ]),
  ...cloudManual.flatMap((routine) => [
    `routine: ${cloudName(routine)}`,
    "  cron:   none — manual, fired via its API trigger (ADR-0016)",
    `  prompt: ${pointerPrompt(routine)}`,
    `  trigger: ${triggerPath(routine.slug)} ${hasTrigger(routine) ? "(token present)" : "(TOKEN MISSING — see below)"}`,
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

// --- Local half (launchd, ADR-0012) ------------------------------------------

const LABEL_PREFIX = "co.formfactory.bulletin."
const agentsDir = path.join(os.homedir(), "Library", "LaunchAgents")
const logsDir = path.join(os.homedir(), "Library", "Logs", "bulletin")

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

console.log("# Bulletin routines — desired local state (launchd)")
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

if (!apply) {
  const missing = cloudManual.filter((routine) => !hasTrigger(routine))
  if (missing.length > 0) {
    console.log(
      "# Missing API-trigger tokens (create the trigger in the Claude web",
      "\n# UI, then re-run with --apply to paste + commit them):",
    )
    for (const routine of missing) {
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
  "using your schedule tooling:",
  "1. List the current cloud routines.",
  "2. Create every listed routine that is missing, with EXACTLY the given",
  "   name, cron, and prompt. For entries marked manual (no cron): create",
  "   the routine WITHOUT any schedule if your tooling supports that;",
  "   otherwise report it as needing manual creation in the Claude web UI.",
  "3. Fix the cron of any listed routine whose schedule drifted. Never",
  "   edit an existing routine's prompt.",
  "4. Delete orphans per the rule in the plan (this covers the disabled",
  "   ones). Match on the prompt's repo clause, not just the name.",
  "5. Print a summary table: name, action taken (created/ok/re-scheduled/",
  "   deleted/needs-web-ui), cron.",
  "Touch nothing that is not named bulletin-*.",
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
    const launchctl = (argv: string[]) => {
      try {
        execFileSync("launchctl", argv, { stdio: "pipe" })
      } catch {
        // bootout of a not-loaded agent is routine; bootstrap failures
        // surface via the summary below when the plist is bad.
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
      launchctl(["bootstrap", `gui/${uid}`, plan.plistPath])
      console.log(`launchd: ${plan.label} ${current ? "updated" : "created"}`)
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

const missingTriggers = cloudManual.filter((routine) => !hasTrigger(routine))
if (missingTriggers.length > 0) {
  if (!process.stdin.isTTY) {
    console.error(
      "routines-sync: manual cloud routines are missing trigger tokens" +
        ` (${missingTriggers.map((r) => r.slug).join(", ")}) — re-run in a` +
        " terminal to paste them.",
    )
  } else {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    console.log(
      "\nAPI triggers are research preview: create the trigger and mint its" +
        "\ntoken in the Claude web UI (shown once), then paste both here —" +
        "\nthey are committed to the data repo, where repo read access is" +
        "\nexactly the entitlement to fire (ADR-0016). Leave empty to skip.\n",
    )
    for (const routine of missingTriggers) {
      const id = (
        await rl.question(`${routine.slug} — cloud routine id: `)
      ).trim()
      if (!id) {
        console.log(`  skipped ${routine.slug}`)
        continue
      }
      const token = (
        await rl.question(`${routine.slug} — trigger token: `)
      ).trim()
      if (!token) {
        console.log(`  skipped ${routine.slug}`)
        continue
      }
      const relPath = triggerPath(routine.slug)
      const absPath = path.join(dataRepoDir, relPath)
      mkdirSync(path.dirname(absPath), { recursive: true })
      writeFileSync(
        absPath,
        JSON.stringify(
          triggerFileSchema.parse({ routine: id, token }),
          null,
          2,
        ) + "\n",
      )
      try {
        execFileSync("git", ["-C", dataRepoDir, "add", relPath])
        execFileSync("git", [
          "-C",
          dataRepoDir,
          "commit",
          "-m",
          `config: add API trigger for ${routine.slug}`,
        ])
        execFileSync("git", ["-C", dataRepoDir, "push"], { stdio: "pipe" })
        console.log(`  committed + pushed ${relPath}`)
      } catch {
        console.error(
          `  wrote ${relPath} but the commit/push failed — commit it by hand.`,
        )
      }
    }
    rl.close()
  }
}

if (localErrors.length > 0) process.exit(1)
