/**
 * The renderer's entry point, as a routine invokes it:
 *
 *   node render.mjs <data.json> [out.html]
 *
 * Writes to stdout when no output path is given, so a run can pipe it. The
 * compiled stylesheet is read from beside this file — the build emits both
 * into the same directory, and the artifact must carry its own CSS to still
 * read when opened raw off the artifacts branch.
 */
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { renderArtifact } from "./render.tsx"

const [dataPath, outPath] = process.argv.slice(2)
if (!dataPath) {
  console.error("usage: node render.mjs <data.json> [out.html]")
  process.exit(2)
}

const here = path.dirname(fileURLToPath(import.meta.url))
const css = readFileSync(path.join(here, "kit.css"), "utf8")
const doc = JSON.parse(readFileSync(dataPath, "utf8"))
const html = renderArtifact(doc, css)

if (outPath) writeFileSync(outPath, html)
else process.stdout.write(html)
