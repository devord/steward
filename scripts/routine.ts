/**
 * Launch one routine run in an interactive claude session (ADR-0017):
 *
 *   pnpm routine <slug>              # manual run → publishes
 *   pnpm routine <slug> --dry        # dry run → local file, opened in browser
 *   pnpm routine <slug> --repo Form-Factory/bulletin-data-team
 *
 * Deliberately dumb: resolve the data-repo checkout, compose the pointer
 * prompt (with the dry clause when --dry), and exec *interactive* claude
 * (not -p) in that cwd — so interactive skills can ask their questions and
 * dry runs land in front of your eyes. All real logic stays in the
 * contract skills; this is prompt assembly + cwd + exec.
 *
 * Checkout resolution, in order: $BULLETIN_DATA_DIR; the cwd if it holds
 * data/routines.yaml; a sibling of the bulletin repo named after the
 * target repo (`../bulletin-data-<login>` by convention).
 */
import { execFileSync, spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"

import { slugSchema } from "@bulletin/schema"

const args = process.argv.slice(2)
const dry = args.includes("--dry")
const repoFlag = args.indexOf("--repo")
const repoArg =
  repoFlag !== -1 && args[repoFlag + 1] ? args[repoFlag + 1] : null
const slug = args.find((arg) => !arg.startsWith("--") && arg !== repoArg)

if (!slug || !slugSchema.safeParse(slug).success) {
  console.error(
    "usage: pnpm routine <slug> [--dry] [--repo <owner/repo>]\n" +
      "  <slug> is a kebab-case routine slug from data/routines.yaml",
  )
  process.exit(1)
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

const login = ghLogin()
const personalRepo = login ? `${login}/bulletin-data-${login}` : null
const repo = repoArg ?? personalRepo

const root = path.resolve(import.meta.dirname, "..")
const candidates = [
  process.env.BULLETIN_DATA_DIR,
  process.cwd(),
  // Sibling checkout by convention: ~/work/bulletin + ~/work/bulletin-data-x.
  repo ? path.resolve(root, "..", repo.split("/")[1] ?? "") : undefined,
].filter((dir) => dir != null)

const dataRepoDir = candidates.find((dir) =>
  existsSync(path.join(dir, "data", "routines.yaml")),
)
if (!dataRepoDir) {
  console.error(
    `routine: no data-repo checkout found (looked for data/routines.yaml in:\n` +
      candidates.map((dir) => `  ${dir}`).join("\n") +
      `)\nClone it first (gh repo clone ${repo ?? "<owner/repo>"}), or set BULLETIN_DATA_DIR.`,
  )
  process.exit(1)
}

// Same clause rule as routines:sync (ADR-0010): team prompts carry the
// repo; personal ones stay unclaused so the dispatcher resolves the
// runner's own data repo.
const teamMode = repo != null && personalRepo != null && repo !== personalRepo
const verb = dry ? "Dry-run" : "Run"
const clause = teamMode ? ` in \`${repo}\`` : ""
const prompt = `${verb} the bulletin routine \`${slug}\`${clause} — follow the run-routine skill.`

// The session's cwd is the data repo, where the contract skills don't
// exist — --add-dir pulls them in from this bulletin checkout (verified:
// added dirs contribute their project skills). The prompt must come
// FIRST: --add-dir is variadic and would swallow a trailing positional
// as another directory, leaving an interactive session with no prompt.
console.log(`> claude "${prompt}" --add-dir ${root}`)
console.log(`  (cwd: ${dataRepoDir})\n`)
const result = spawnSync("claude", [prompt, "--add-dir", root], {
  stdio: "inherit",
  cwd: dataRepoDir,
})
if (result.error) {
  console.error(
    "routine: couldn't launch `claude` — is the Claude Code CLI installed?",
  )
  process.exit(1)
}
process.exit(result.status ?? 0)
