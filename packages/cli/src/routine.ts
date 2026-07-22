/**
 * Launch one routine run in an interactive claude session (ADR-0017):
 *
 *   steward run <slug>              # manual run → publishes
 *   steward run <slug> --dry        # dry run → local file, opened in browser
 *   steward run <slug> --repo devord/steward-data-team
 *
 * Deliberately dumb: resolve the data-repo checkout, compose the pointer
 * prompt (with the dry clause when --dry), and exec *interactive* claude
 * (not -p) in that cwd — so interactive skills can ask their questions and
 * dry runs land in front of your eyes. All real logic stays in the
 * contract skills; this is prompt assembly + cwd + exec.
 *
 * Checkout resolution, in order: $STEWARD_DATA_DIR; the cwd if it holds
 * data/routines.yaml; otherwise a script-managed clone under
 * ~/.cache/steward (ADR-0036 — an installed CLI has no sibling checkout).
 */
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"

import { slugSchema } from "@steward/schema"

import { CLI } from "./cli-name.ts"
import { ensureDataRepoCheckout, ghLogin } from "./data-repo.ts"
import { contractSkillsDir } from "./skills.ts"

export function main(argv: string[]): void {
  const dry = argv.includes("--dry")
  const repoFlag = argv.indexOf("--repo")
  const repoArg =
    repoFlag !== -1 && argv[repoFlag + 1] ? argv[repoFlag + 1] : null
  const slug = argv.find((arg) => !arg.startsWith("--") && arg !== repoArg)

  if (!slug || !slugSchema.safeParse(slug).success) {
    console.error(
      `usage: ${CLI} run <slug> [--dry] [--repo <owner/repo>]\n` +
        "  <slug> is a kebab-case routine slug from data/routines.yaml",
    )
    process.exit(1)
  }

  const login = ghLogin()
  const personalRepo = login ? `${login}/steward-data-${login}` : null
  const repo = repoArg ?? personalRepo

  // A local checkout wins when present; otherwise clone/fast-forward the
  // managed copy — an installed CLI runs anywhere, not beside a checkout.
  const local = [process.env.STEWARD_DATA_DIR, process.cwd()]
    .filter((dir): dir is string => dir != null)
    .find((dir) => existsSync(path.join(dir, "data", "routines.yaml")))
  const dataRepoDir = local ?? (repo ? ensureDataRepoCheckout(repo) : undefined)
  if (!dataRepoDir) {
    console.error(
      "steward run: no data repo found. Set STEWARD_DATA_DIR, run from a\n" +
        "checkout, or pass --repo <owner/repo> so it can be cloned.",
    )
    process.exit(1)
  }

  // Same clause rule as `steward sync` (ADR-0023): every prompt names its
  // repo — with N data repos "the" data repo is ambiguous. Falls back to the
  // home-repo convention when no repo could be inferred.
  const verb = dry ? "Dry-run" : "Run"
  const clause = repo ? ` in \`${repo}\`` : ""
  const prompt = `${verb} the steward routine \`${slug}\`${clause} — follow the run-routine skill.`

  // The session's cwd is the data repo, where the contract skills don't
  // exist — --add-dir pulls them in from the package (ADR-0036). The prompt
  // must come FIRST: --add-dir is variadic and would swallow a trailing
  // positional as another directory, leaving a session with no prompt.
  const addDir = contractSkillsDir()
  console.log(`> claude "${prompt}" --add-dir ${addDir}`)
  console.log(`  (cwd: ${dataRepoDir})\n`)
  const result = spawnSync("claude", [prompt, "--add-dir", addDir], {
    stdio: "inherit",
    cwd: dataRepoDir,
  })
  if (result.error) {
    console.error(
      "steward run: couldn't launch `claude` — is the Claude Code CLI installed?",
    )
    process.exit(1)
  }
  process.exit(result.status ?? 0)
}
