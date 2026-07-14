import { existsSync } from "node:fs"
import path from "node:path"

/**
 * Directory to hand `claude --add-dir` so the contract skills (run-routine,
 * widget-artifact, publish-widget) resolve — the data-repo cwd doesn't carry
 * them (ADR-0014/0036). Returns a directory that *contains* a `.claude/skills`
 * tree, which is what Claude Code discovers under an added directory.
 *
 * Dev (running from source in the monorepo): the repo root, whose live
 * `.claude/skills` holds all three. Published: the `skills/` tree bundled into
 * the package (`build.mjs`), resolved relative to the installed CLI so a
 * launchd plist's absolute `--add-dir` path stays valid across runs — which is
 * why scheduled-local routines need a *global* install, not an ephemeral
 * `npx` cache (ADR-0036).
 */
export function contractSkillsDir(): string {
  // From src/skills.ts the monorepo root is three up; from the bundled
  // dist/cli.js it resolves under node_modules (no .claude/skills there), so
  // we fall through to the packaged copy.
  const monorepoRoot = path.resolve(import.meta.dirname, "..", "..", "..")
  if (existsSync(path.join(monorepoRoot, ".claude", "skills", "run-routine"))) {
    return monorepoRoot
  }
  return path.resolve(import.meta.dirname, "..", "skills")
}
