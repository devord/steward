/**
 * Reconcile data/routines.yaml against the account's scheduled Claude Code
 * routines (ADR-0005). The YAML is the source of truth; the cloud copy is a
 * projection holding nothing but a stable pointer prompt + cron.
 *
 * Works for a personal data repo and for the shared team repo (ADR-0010):
 * team runs are classified by the target repo differing from
 * `<login>/bulletin-data-<login>`. In team mode only entries whose `runner`
 * matches the signed-in login are enacted — each teammate owns the
 * schedules for the routines they created — and prompts carry the repo.
 *
 * Cloud routine state has no public read API — it's managed by Claude
 * Code's schedule tooling. So this script:
 *   - default: prints the desired state as a reconciliation plan
 *     (create/verify/delete, with the exact prompt and cron per routine);
 *   - --apply: hands that plan to a headless `claude -p` run, which uses
 *     its schedule tooling to enact it.
 *
 * Usage: pnpm routines:sync [--file <path/to/routines.yaml>]
 *                           [--repo <owner/repo>] [--apply]
 */
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

import { type Routine, parseRoutinesFile } from "@bulletin/schema"

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

const orphanRule = teamMode
  ? `# Routines named bulletin-team-* whose prompt targets \`${repo}\` and are
# not listed here are orphans and should be deleted. Never touch routines
# whose prompt names a different repo, or has no repo clause.`
  : `# Routines named bulletin-* whose prompt has NO "in \`<owner/repo>\`"
# clause and are not listed here are orphans and should be deleted. Never
# touch routines whose prompt names a repo — those belong to team syncs.`

const plan = [
  "# Bulletin routines — desired cloud state",
  "#",
  "# One scheduled routine per enabled entry. The prompt is a stable",
  "# pointer; instructions/schedule edits in routines.yaml need no cloud",
  "# change except the cron below.",
  orphanRule,
  "",
  ...enabled.flatMap((routine) => [
    `routine: ${cloudName(routine)}`,
    `  cron:   ${routine.schedule}`,
    `  prompt: ${pointerPrompt(routine)}`,
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

console.log(plan.join("\n"))

if (!apply) {
  console.log(
    "Dry run. Apply with `pnpm routines:sync --apply` (drives a headless\n" +
      "claude run), or reconcile by hand via /schedule in Claude Code.",
  )
  process.exit(0)
}

const instructions = [
  "Reconcile my scheduled Claude Code routines (cloud cron jobs) with the",
  "desired state below, using your schedule tooling:",
  "1. List the current scheduled routines.",
  "2. Create every listed routine that is missing, with EXACTLY the given",
  "   name, cron, and prompt.",
  "3. Fix the cron of any listed routine whose schedule drifted. Never",
  "   edit an existing routine's prompt.",
  "4. Delete orphans per the rule in the plan (this covers the disabled",
  "   ones). Match on the prompt's repo clause, not just the name.",
  "5. Print a summary table: name, action taken (created/ok/re-scheduled/",
  "   deleted), cron.",
  "Touch nothing that is not named bulletin-*.",
  "",
  plan.join("\n"),
].join("\n")

console.log("Applying via `claude -p`…\n")
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
