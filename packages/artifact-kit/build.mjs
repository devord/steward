/**
 * Build the two things a routine run needs (ADR-0050):
 *
 *   kit.css    the compiled stylesheet, inlined into each artifact and also
 *              injected by the board so a design fix reaches already-published
 *              widgets without rerunning anything
 *   render.mjs the bundled renderer, run as `node render.mjs data.json`
 *
 * Both are committed under `.claude/skills/widget-artifact/kit/`. That is not
 * a stylistic choice about build output in git — it is how they *travel*:
 * `packages/cli/build.mjs` cpSync's the whole skill directory into the
 * published package, and `contractSkillsDir()` resolves it in dev and from an
 * install alike. It also keeps a scheduled cloud run install-free, which
 * matters because that environment cannot be assumed to reach npm.
 */
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, "..", "..")
const src = path.join(here, "src")
const outDir = path.join(
  repoRoot,
  ".claude",
  "skills",
  "widget-artifact",
  "kit",
)
mkdirSync(outDir, { recursive: true })

/**
 * The utility surface a routine may use outside kit components: layout and
 * spacing only — enough to *arrange* components, not to restyle them.
 *
 * Deliberately excludes colour, type and borders. Those come from components,
 * so a routine that wants a new look asks for a component instead of inventing
 * one, and the board keeps reading as one product.
 *
 * This has to be an explicit safelist because Tailwind compiles against source
 * it can *see*, and routine-authored markup does not exist at build time. A
 * class outside this list renders unstyled with no error — which is why
 * `validate.mjs` rejects them at publish rather than leaving it to discovery.
 *
 * Only three tier prefixes, and a lean utility set. This is a measured choice,
 * not a guess — `kit.css` is inlined into every artifact *and* injected into
 * every frame, so its size is paid on every render:
 *
 *   10 tiers x full utils  137.3 KB     3 tiers x full utils   61.8 KB
 *   10 tiers x lean utils   35.1 KB     3 tiers x lean utils   20.4 KB  <-
 *    0 tiers x full utils   16.8 KB     components only        11.0 KB
 *
 * The cross product is what explodes: every prefix multiplies every utility.
 * 20.4 KB keeps responsive *arrangement* available to routines while staying
 * well under what the hand-written CSS it replaces already cost.
 *
 * Restricting the safelist does NOT restrict the kit. Kit components are
 * compiled from source Tailwind can see, so they use the full tier vocabulary
 * — `roomy:`, `tall:`, `tile:`, `page-only:` and the rest all work in
 * `src/**\/*.tsx`. This list governs only what a routine may hand-write in the
 * Alpine escape hatch, where there is no source for Tailwind to scan.
 */
const TIERS = "{,beyond-glance:,tier-detail:,tier-page:}"
const SAFELIST = [
  `${TIERS}{flex,grid,block,hidden}`,
  `${TIERS}flex-{col,row,1}`,
  `${TIERS}grid-cols-{1,2,3,4}`,
  `${TIERS}gap-{1,2,3,4}`,
  `${TIERS}{p,px,py}-{1,2,3,4}`,
  `${TIERS}items-{start,center,baseline}`,
  `${TIERS}justify-{start,center,between}`,
  `${TIERS}w-full`,
  `${TIERS}truncate`,
]

const input = [
  '@import "tailwindcss";',
  `@import "${path.join(src, "tokens", "tokens.css")}";`,
  `@import "${path.join(src, "tiers", "tiers.css")}";`,
  // Components only. Scanning the whole tree would pull class strings out of
  // test fixtures and ship them to every artifact.
  `@source "${src}/**/*.tsx";`,
  ...SAFELIST.map((s) => `@source inline("${s}");`),
].join("\n")

// A build intermediate, not a source file — every @import and @source in it is
// absolute, so it does not need to live next to the package.
const inputPath = path.join(
  mkdtempSync(path.join(tmpdir(), "steward-kit-")),
  "input.css",
)
writeFileSync(inputPath, input)

const cli = path.join(here, "node_modules", ".bin", "tailwindcss")
execFileSync(
  cli,
  ["-i", inputPath, "-o", path.join(outDir, "kit.css"), "--minify"],
  { cwd: here, stdio: "inherit" },
)

const esbuild = path.join(here, "node_modules", ".bin", "esbuild")
execFileSync(
  esbuild,
  [
    path.join(src, "cli.mjs"),
    "--bundle",
    "--format=esm",
    "--platform=node",
    "--minify",
    "--loader:.tsx=tsx",
    "--jsx=automatic",
    '--define:process.env.NODE_ENV="production"',
    // react-dom/server is CJS and calls require("util"). Bundling to ESM
    // replaces `require` with a shim that throws at import time, so the
    // renderer dies before it runs. Hand it a real one.
    '--banner:js=import{createRequire as __cr}from"node:module";const require=__cr(import.meta.url);',
    `--outfile=${path.join(outDir, "render.mjs")}`,
  ],
  { cwd: here, stdio: "inherit" },
)

const kb = (p) => `${(statSync(p).size / 1024).toFixed(1)} KB`
console.log(
  `built kit.css (${kb(path.join(outDir, "kit.css"))}) + render.mjs (${kb(path.join(outDir, "render.mjs"))}) → ${path.relative(repoRoot, outDir)}`,
)
