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
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs"
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

/**
 * Every source file under `src/` that is a component rather than a test.
 *
 * `.ts` as well as `.tsx`, and that is load-bearing: the tone maps live in
 * `ui/tone.ts`, so a `.tsx`-only scan compiled every class a component wrote
 * inline and silently dropped the ones a shared map held. `TONE_FILL.neutral`
 * shipped as an unstyled `bg-ink` that way — caught by the validator's
 * class-coverage check, which is exactly the failure it exists for, but the
 * scan should not have been the thing that caused it.
 *
 * Sorted, so the generated input — and therefore `kit.css` — is byte-stable
 * across machines and filesystem orderings. CI diffs this output.
 */
function componentSources() {
  return (
    readdirSync(src, { recursive: true, withFileTypes: true })
      .filter(
        (e) =>
          e.isFile() && /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name),
      )
      .map((e) => path.join(e.parentPath, e.name))
      // `behaviour/` is runtime JS, not markup. Scanning it compiles every
      // identifier that happens to collide with a utility name — `transition`,
      // `order`, `hidden`, `block` all appear there as DOM properties — into a
      // stylesheet inlined on every artifact and injected into every frame. It
      // writes exactly one class, and that rule lives in `tiers.css`.
      .filter((f) => !f.startsWith(path.join(src, "behaviour") + path.sep))
      .sort()
  )
}

const input = [
  // `source(none)` disables Tailwind's automatic detection, which otherwise
  // walks the package root and scans EVERYTHING — fixtures and tests included —
  // no matter what `@source` says, because explicit sources add to the auto set
  // rather than replacing it.
  //
  // That was live and silently wrong: `kit.css` is inlined into every artifact
  // and injected into every frame, and it was carrying classes named only in
  // assertions, plus any English word in a fixture's prose that happens to
  // collide with a utility name. The word "shrinking" in one fixture's briefing
  // shipped a real `.shrink` rule to every widget on the board.
  //
  // It also made the output a function of test and fixture *prose*, so CI's
  // "generated, never hand-edited" check failed whenever either changed without
  // a rebuild. Measured: `@source not` does not help, in either ordering, with
  // absolute or relative globs — the include wins.
  '@import "tailwindcss" source(none);',
  `@import "${path.join(src, "tokens", "tokens.css")}";`,
  `@import "${path.join(src, "tiers", "tiers.css")}";`,
  // Components only, enumerated file by file.
  //
  // This used to be `@source "${src}/**/*.tsx"`, which also matches
  // `render.test.tsx` — so every class named in an assertion was compiled into
  // a stylesheet that is inlined into every artifact AND injected into every
  // frame. Verified by probe: a `rotate-45` written only in a test reached
  // kit.css. It also made the build effectively non-deterministic, because
  // editing a test's expected class strings changed the output, and CI's
  // "generated, never hand-edited" check then failed for anyone who edited a
  // test without rebuilding.
  //
  // `@source not` does not fix it — an explicit `@source` include wins over
  // the negation (measured, both orderings, absolute and relative globs). So
  // the list is built here instead, where "which files are components" is a
  // decision rather than a glob's side effect.
  ...componentSources().map((f) => `@source "${f}";`),
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

// The `columns` band's behaviour, as a browser bundle the board injects.
//
// A third output rather than a template literal beside `artifact-copy.ts`: at
// ~460 lines this is the frozen untestable blob the band was migrated out of a
// routine's template to escape, and a string cannot be typechecked or tested.
// It travels the same way `kit.css` does — committed here, imported `?raw` by
// the board — so it needs no new mechanism to reach a frame.
//
// IIFE, not ESM: it is injected as a plain <script> into an already-parsed
// document, where a module's deferred execution would land after the board has
// stopped looking.
execFileSync(
  esbuild,
  [
    path.join(src, "behaviour", "columns.ts"),
    "--bundle",
    "--format=iife",
    "--platform=browser",
    "--target=es2020",
    "--minify",
    `--outfile=${path.join(outDir, "columns.js")}`,
  ],
  { cwd: here, stdio: "inherit" },
)

const kb = (p) => `${(statSync(p).size / 1024).toFixed(1)} KB`
console.log(
  `built kit.css (${kb(path.join(outDir, "kit.css"))}) + render.mjs (${kb(path.join(outDir, "render.mjs"))}) + columns.js (${kb(path.join(outDir, "columns.js"))}) → ${path.relative(repoRoot, outDir)}`,
)
