/**
 * Bundle the CLI into a single runnable file and ship the contract skills
 * alongside it (ADR-0036).
 *
 * esbuild inlines everything — including the private `@steward/schema` — so
 * the published package has no workspace dependencies and runs under `npx`
 * with nothing to resolve. Only Node builtins stay external.
 *
 * The repo's skills — the contract tier and the primitives built-in templates
 * compose (ADR-0053) — are copied into `skills/.claude/skills/` so
 * `claude --add-dir <pkg>/skills` resolves them from the install
 * (`skills.ts`); the data-repo cwd doesn't carry them (ADR-0014).
 *
 * Discovered rather than listed: a hard-coded roster silently stops shipping
 * whatever is added next, and a built-in template composing a primitive the
 * install never received fails at the point of use.
 */
import { build } from "esbuild"
import { chmodSync, cpSync, mkdirSync, readdirSync, rmSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, "..", "..")

const outfile = path.join(here, "dist", "cli.js")
await build({
  entryPoints: [path.join(here, "src", "cli.ts")],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20.11",
  // Shebang so the published `bin` runs directly. The `createRequire` shim
  // lets esbuild's `__require` resolve to a real require — a bundled CJS dep
  // (yaml) does `require("process")`, which an ESM bundle otherwise can't
  // satisfy. Node builtins are the only thing left unbundled.
  banner: {
    js: [
      "#!/usr/bin/env node",
      'import { createRequire as __createRequire } from "node:module";',
      "const require = __createRequire(import.meta.url);",
    ].join("\n"),
  },
})
chmodSync(outfile, 0o755)

// Vendored skills belong to interactive work in this repo, not to a routine
// run, and shipping them would put someone else's docs in every install.
const VENDORED = new Set(["react-router"])
const skillsIn = path.join(repoRoot, ".claude", "skills")
const skills = readdirSync(skillsIn, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !VENDORED.has(entry.name))
  .map((entry) => entry.name)
  .sort()

const skillsOut = path.join(here, "skills", ".claude", "skills")
rmSync(path.join(here, "skills"), { recursive: true, force: true })
mkdirSync(skillsOut, { recursive: true })
for (const skill of skills) {
  cpSync(path.join(skillsIn, skill), path.join(skillsOut, skill), {
    recursive: true,
  })
}

console.log(`built dist/cli.js + skills/ (${skills.join(", ")})`)
