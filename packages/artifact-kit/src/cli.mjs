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
import { reviewDoc, validateDoc } from "./validate-doc.ts"

const [dataPath, outPath] = process.argv.slice(2)
if (!dataPath) {
  console.error("usage: node render.mjs <data.json> [out.html]")
  process.exit(2)
}

const here = path.dirname(fileURLToPath(import.meta.url))
const css = readFileSync(path.join(here, "kit.css"), "utf8")

let doc
try {
  doc = JSON.parse(readFileSync(dataPath, "utf8"))
} catch (e) {
  console.error(`${dataPath} is not valid JSON: ${e.message}`)
  process.exit(2)
}

// Fail on the field, not three frames deep inside a minified bundle. The
// caller is an agent that just wrote this file; it can fix a named field.
const problems = validateDoc(doc)
if (problems.length) {
  console.error(`${dataPath} does not match the kit's input contract:`)
  for (const p of problems) console.error(`  - ${p}`)
  console.error("\nSee .claude/skills/widget-artifact/kit/CONTRACT.md")
  process.exit(1)
}

// Advisories, on stderr so a `node render.mjs data.json > out.html` pipe still
// gets clean HTML. These do not stop the run: the render is fine and the
// caller is usually a scheduled job, where publishing nothing is the worse
// outcome. See `reviewDoc`.
for (const note of reviewDoc(doc)) console.error(`note: ${note}`)

const html = renderArtifact(doc, css)

if (outPath) writeFileSync(outPath, html)
else process.stdout.write(html)
