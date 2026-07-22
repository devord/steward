/**
 * Set up (or replace) the API trigger for one cloud routine (ADR-0016) —
 * the thing the widget's Update button fires. Manual cloud routines get
 * theirs during `routines:sync --apply`; this command covers the rest: a
 * trigger riding alongside a scheduled routine's cron, or re-minting a
 * token later.
 *
 * The trigger itself is research preview — it can only be created, and its
 * token minted, in the Claude web UI (shown once). This command walks
 * through that, then commits the pasted pair to the data repo as
 * data/triggers/<slug>.json, where repo read access is exactly the
 * entitlement to fire.
 *
 * Usage: steward trigger <slug> [--repo <owner/repo>]
 *                               [--file <path/to/routines.yaml>]
 *                               [--account [<email>]]
 *
 * --account sets just the owning Claude account on an existing trigger
 * (ADR-0029) and skips the token flow — the backfill for triggers minted
 * before the account field, or an account correction. Bare `--account` prompts
 * (defaulting to this machine's signed-in account); `--account <email>` sets it
 * outright, so it works non-interactively.
 *
 * --repo (the copy-pasteable form the app shows) uses a script-managed
 * clone under ~/.cache/steward/repos/; --file targets your own checkout;
 * neither means "run from a data-repo checkout".
 */
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

import {
  type Routine,
  parseRoutinesFile,
  routineHost,
  triggerPath,
} from "@steward/schema"

import { CLI } from "./cli-name.ts"
import { ghLogin, inferRepo, repoTag, routinesFileFor } from "./data-repo.ts"
import {
  claudeAccountEmail,
  promptTriggerToken,
  question,
  setTriggerAccount,
} from "./trigger-token.ts"

export function main(argv: string[]): void {
  const args = argv
  const fileFlag = args.indexOf("--file")
  const repoFlag = args.indexOf("--repo")
  const accountFlag = args.indexOf("--account")
  // --account's optional value is the next arg when it isn't another flag.
  const accountValue =
    accountFlag !== -1 &&
    args[accountFlag + 1] != null &&
    !args[accountFlag + 1].startsWith("--")
      ? args[accountFlag + 1]
      : null
  const consumed = new Set(
    [
      fileFlag === -1 ? null : fileFlag + 1,
      repoFlag === -1 ? null : repoFlag + 1,
      accountValue == null ? null : accountFlag + 1,
    ].filter((i): i is number => i != null),
  )
  const slug = args.find((arg, i) => !arg.startsWith("--") && !consumed.has(i))

  if (!slug) {
    console.error(
      `Usage: ${CLI} trigger <slug> [--repo <owner/repo>] [--file <path/to/routines.yaml>] [--account [<email>]]`,
    )
    process.exit(1)
  }

  const file = routinesFileFor(
    fileFlag !== -1 ? (args[fileFlag + 1] ?? null) : null,
    repoFlag !== -1 ? (args[repoFlag + 1] ?? null) : null,
  )

  if (!existsSync(file)) {
    console.error(
      `routine-trigger: ${file} not found.\n` +
        "Run from a data-repo checkout, or pass --repo <owner/repo> or" +
        " --file <path/to/routines.yaml>.",
    )
    process.exit(1)
  }

  /** The data repo checkout the file lives in — token commits happen here. */
  const dataRepoDir = path.dirname(path.dirname(file))

  let routines: Routine[]
  try {
    routines = parseRoutinesFile(readFileSync(file, "utf8")).routines
  } catch (error) {
    console.error(
      `routine-trigger: ${file} is not a valid routines file:\n` +
        `  ${error instanceof Error ? error.message : String(error)}`,
    )
    process.exit(1)
  }

  const routine = routines.find((entry) => entry.slug === slug)
  if (!routine) {
    const cloud = routines
      .filter((entry) => routineHost(entry) === "cloud")
      .map((entry) => entry.slug)
    console.error(
      `routine-trigger: no routine \`${slug}\` in ${file}.` +
        (cloud.length > 0 ? `\nCloud routines: ${cloud.join(", ")}` : ""),
    )
    process.exit(1)
  }

  if (routineHost(routine) === "local") {
    console.error(
      `routine-trigger: ${slug} is local — local routines have no API trigger` +
        ` (ADR-0016); run it with \`${CLI} run ${slug}\`.`,
    )
    process.exit(1)
  }

  // Same personal-vs-team classification as routines-sync: the trigger lives
  // on the runner's cloud resource, so only the runner can create it.
  const repo =
    (repoFlag !== -1 ? args[repoFlag + 1] : null) ??
    inferRepo(path.dirname(file))
  const login = ghLogin()
  if (repo != null && login == null) {
    console.error(
      `routine-trigger: can't determine the gh login (is \`gh\` authenticated?),\n` +
        `so ${repo} can't be classified as home or shared. Run \`gh auth login\`.`,
    )
    process.exit(1)
  }
  // Shared repo: not the viewer's home repo (ADR-0023) — runner rule applies.
  const shared =
    repo != null && login != null && repo !== `${login}/steward-data-${login}`
  if (shared && routine.runner !== login) {
    console.error(
      `routine-trigger: ${slug} runs as ${routine.runner ?? "(no runner set)"}` +
        " — the cloud resource is theirs, so only they can mint its trigger" +
        " (ADR-0016).",
    )
    process.exit(1)
  }
  // Must mirror routines-sync's cloudName — the trigger targets that resource.
  const cloudName = shared
    ? `steward-${repoTag(repo ?? "shared")}-${slug}`
    : `steward-${slug}`

  if (!routine.enabled) {
    console.warn(`# ${slug} is disabled — the trigger will sit unused.\n`)
  }

  // --account: stamp the owning account on the existing receipt and stop —
  // no token flow (ADR-0029). An explicit value works non-interactively; a
  // bare flag prompts, defaulting to this machine's signed-in account.
  if (accountFlag !== -1) {
    const detected = claudeAccountEmail()
    const account =
      accountValue ??
      (process.stdin.isTTY
        ? question(
            `${slug} — claude account${detected ? ` [${detected}]` : ""}: `,
          ).trim() || detected
        : detected)
    if (!account) {
      console.error(
        "routine-trigger: no account given and none signed in on this machine" +
          " — pass `--account <email>`.",
      )
      process.exit(1)
    }
    process.exit(setTriggerAccount(slug, dataRepoDir, account) ? 0 : 1)
  }

  if (!process.stdin.isTTY) {
    console.error(
      "routine-trigger: the token is pasted interactively — run in a terminal.",
    )
    process.exit(1)
  }

  console.log(
    "API triggers are research preview: in the Claude web UI, open the cloud" +
      `\nroutine \`${cloudName}\`, create its API trigger, and mint the token` +
      "\n(shown once). Paste both below — they are committed to the data repo," +
      "\nwhere repo read access is exactly the entitlement to fire (ADR-0016)." +
      "\nLeave empty to skip." +
      `\n\nIf \`${cloudName}\` doesn't exist yet, enact it first:` +
      `\n  ${CLI} sync --apply${repo ? ` --repo ${repo}` : ` --file ${file}`}\n`,
  )
  if (existsSync(path.join(dataRepoDir, triggerPath(slug)))) {
    console.log(
      `${triggerPath(slug)} already exists — pasting a new pair replaces it.\n`,
    )
  }

  promptTriggerToken(slug, dataRepoDir)
}
