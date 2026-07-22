/**
 * `@devord/steward` — the routines CLI (ADR-0036). The pieces a person needs
 * to *use* Steward: reconcile the routines in their data repo onto their own
 * Claude account (cloud) and this machine (launchd), run one interactively,
 * and mint a routine's API trigger. The web app stays private; this ships.
 *
 * Subcommands mirror the in-repo dev scripts one-to-one:
 *   steward sync    [--apply] [--repo <owner/repo>] [--file <path>]
 *   steward run     <slug> [--dry] [--repo <owner/repo>]
 *   steward trigger <slug> [--repo <owner/repo>] [--file <path>] [--account [<email>]]
 */
import { CLI } from "./cli-name.ts"
import { main as run } from "./routine.ts"
import { main as sync } from "./routines-sync.ts"
import { main as trigger } from "./routine-trigger.ts"

function usage(): void {
  console.log(
    "steward — keep your dashboard's routines in sync (ADR-0036)\n\n" +
      `Usage: ${CLI} <command>\n\n` +
      "Commands:\n" +
      "  sync    [--apply] [--repo <owner/repo>] [--file <path>]  reconcile cloud + launchd\n" +
      "  run     <slug> [--dry] [--repo <owner/repo>]             run a routine interactively\n" +
      "  trigger <slug> [--repo <owner/repo>] [--file <path>]     set up a routine's API trigger\n" +
      "          [--account [<email>]]                            stamp its owning Claude account (ADR-0029)\n\n" +
      "--repo uses a managed clone under ~/.cache/steward; --file targets a\n" +
      "checkout you manage; neither runs from the current data-repo checkout.",
  )
}

const [command, ...rest] = process.argv.slice(2)

switch (command) {
  case "sync":
    // Top-level await (ESM): the apply path streams a headless claude run.
    await sync(rest)
    break
  case "run":
    run(rest)
    break
  case "trigger":
    trigger(rest)
    break
  case "-h":
  case "--help":
  case undefined:
    usage()
    break
  default:
    console.error(`steward: unknown command \`${command}\`\n`)
    usage()
    process.exit(1)
}
