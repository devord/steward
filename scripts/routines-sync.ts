/**
 * Reconcile data/routines.yaml against the account's scheduled Claude Code
 * routines (ADR-0005). The YAML is the source of truth; the cloud copy is a
 * projection holding nothing but a stable pointer prompt + cron.
 *
 * Cloud routine state has no public read API — it's managed by Claude
 * Code's schedule tooling. So this script:
 *   - default: prints the desired state as a reconciliation plan
 *     (create/verify/delete, with the exact prompt and cron per routine);
 *   - --apply: hands that plan to a headless `claude -p` run, which uses
 *     its schedule tooling to enact it.
 *
 * Usage: pnpm routines:sync [--file <path/to/routines.yaml>] [--apply]
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

/** The stable pointer prompt — created once, never edited (ADR-0005). */
function pointerPrompt(routine: Routine): string {
  return `Run the bulletin routine \`${routine.slug}\` — follow the run-routine skill.`
}

/** Cloud routine name; the bulletin- prefix marks ownership for cleanup. */
function cloudName(routine: Routine): string {
  return `bulletin-${routine.slug}`
}

const enabled = routines.filter((routine) => routine.enabled)
const disabled = routines.filter((routine) => !routine.enabled)

const plan = [
  "# Bulletin routines — desired cloud state",
  "#",
  "# One scheduled routine per enabled entry. The prompt is a stable",
  "# pointer; instructions/schedule edits in routines.yaml need no cloud",
  "# change except the cron below. Routines named bulletin-* that are not",
  "# listed here are orphans and should be deleted.",
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
  "4. Delete any routine named bulletin-* that is not in the list (this",
  "   covers the disabled ones).",
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
