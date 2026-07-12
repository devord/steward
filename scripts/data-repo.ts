/**
 * Locating the data-repo checkout the routine scripts operate on. Two forms
 * (both accepted by routines-sync and routine-trigger):
 *
 *   --file <path/to/routines.yaml>  an existing checkout you manage;
 *   --repo <owner/repo>             a script-managed clone under
 *                                   ~/.cache/bulletin/repos/ — cloned via
 *                                   `gh` on first use, fast-forwarded after.
 *
 * The --repo form is what the app's setup cards print: it is copy-pasteable
 * as-is (the app knows the repo slug but not where — or whether — the user
 * cloned it). No flag means "run from a data-repo checkout".
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync } from "node:fs"
import os from "node:os"
import path from "node:path"

/** `owner/name` of the checkout's origin remote, or null. */
export function inferRepo(dir: string): string | null {
  try {
    const url = execFileSync(
      "git",
      ["-C", dir, "remote", "get-url", "origin"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim()
    const match = /github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/.exec(url)
    return match ? `${match[1]}/${match[2]}` : null
  } catch {
    return null
  }
}

export function ghLogin(): string | null {
  try {
    return execFileSync("gh", ["api", "user", "--jq", ".login"], {
      encoding: "utf8",
    }).trim()
  } catch {
    return null
  }
}

/**
 * The managed clone for `repo`, cloning or fast-forwarding as needed. The
 * pull fails closed — enacting from a stale routines.yaml would silently
 * revert newer commits, and the trigger flow pushes from this checkout.
 */
export function ensureDataRepoCheckout(repo: string): string {
  const [owner, name] = repo.split("/")
  if (!owner || !name) {
    console.error(`--repo expects <owner>/<name>, got "${repo}"`)
    process.exit(1)
  }
  const dir = path.join(
    os.homedir(),
    ".cache",
    "bulletin",
    "repos",
    owner,
    name,
  )
  if (existsSync(path.join(dir, ".git"))) {
    try {
      execFileSync("git", ["-C", dir, "pull", "--ff-only", "--quiet"], {
        stdio: "pipe",
      })
    } catch {
      console.error(
        `${dir}: \`git pull --ff-only\` failed — fix or delete that\n` +
          "checkout, or point --file at a clone you manage yourself.",
      )
      process.exit(1)
    }
  } else {
    console.log(`# cloning ${repo} into ${dir}…`)
    mkdirSync(path.dirname(dir), { recursive: true })
    try {
      execFileSync("gh", ["repo", "clone", repo, dir], {
        stdio: ["ignore", "ignore", "inherit"],
      })
    } catch {
      console.error(
        `cloning ${repo} failed — is \`gh\` installed and authenticated?`,
      )
      process.exit(1)
    }
  }
  return dir
}

/** Resolve the routines.yaml to operate on from the two flags (see above). */
export function routinesFileFor(
  fileArg: string | null,
  repoArg: string | null,
): string {
  if (fileArg != null) return path.resolve(fileArg)
  if (repoArg != null) {
    return path.join(ensureDataRepoCheckout(repoArg), "data", "routines.yaml")
  }
  return path.resolve("data", "routines.yaml")
}
