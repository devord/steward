/**
 * Generate the built-in templates' picker previews (ADR-0037) by rendering the
 * kit's archetype fixtures (ADR-0050). The kit build runs this as its last step,
 * so a rebuild cannot leave the previews on the stylesheet before it. Run
 * `node scripts/gen-template-previews.ts` directly only to pick up a fixture or
 * `PREVIEWS` change against a kit that has not moved; either way the kit must be
 * built first. CI re-runs it and fails if the working tree moves, so the output
 * is never hand-edited.
 *
 * These files used to be authored by hand: three artifacts of 42–70 KB, each
 * one a full hand-written document of HTML, CSS and a transcribed fit script.
 * They were the design language's canonical samples *and* the picker's
 * previews, and ADR-0050 retired the first job — the language is a kit now, and
 * a component documents itself in its own source. What is left is the second
 * job, and a hand-kept file cannot do it honestly: it shows the reader a
 * layout the renderer stopped emitting the moment a component changed, with
 * nothing to catch the divergence.
 *
 * So the preview is renderer output. It cannot drift from what a routine
 * publishes, because it is made the same way — `render.mjs` over a fixture, the
 * exact command a run issues.
 *
 * **Previews are committed, not built on demand.** `templates.server.ts` inlines
 * them with `import.meta.glob` at web-build time, so they must exist before Vite
 * runs; committing them keeps the web build independent of the kit build, and
 * makes a preview change reviewable as a diff rather than invisible. This is the
 * same discipline `kit.css` and `render.mjs` already ship under, for the same
 * reason.
 */
import { execFileSync } from "node:child_process"
import { existsSync, readdirSync, rmSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, "..")
const fixtures = path.join(repoRoot, "packages", "artifact-kit", "fixtures")
const templates = path.join(repoRoot, "templates", "routines")
const outDir = path.join(repoRoot, "docs", "samples")
const render = path.join(
  repoRoot,
  ".claude",
  "skills",
  "widget-artifact",
  "kit",
  "render.mjs",
)

/**
 * Which archetype each built-in template renders as.
 *
 * The fixtures are named on the archetype axis rather than after routines, so
 * they cover the *kit* rather than a fleet that changes underneath them. That
 * axis turns out to be the one a picker wants too: someone choosing a template
 * is choosing a shape, and `day` / `matrix` / `briefing` / `roster` are those
 * shapes named. The mapping is one line each because it is a claim — *this
 * template makes this shape* — and a claim belongs somewhere a reviewer can
 * disagree with it.
 *
 * `custom` is absent on purpose and ADR-0037 already says why: its brief is the
 * user's own prompt, so there is nothing canned to show. The picker renders a
 * previewless card, which is correct rather than a gap.
 *
 * A **repo** template still ships its own `templates/routines/<id>.sample.html`
 * sibling (ADR-0037) — that path is untouched. This generator covers the
 * built-ins only, because it is only the built-ins that live in this repo
 * alongside the fixtures.
 */
const PREVIEWS: Record<string, string> = {
  "daily-plan": "day",
  "module-entropy": "matrix",
  "react-doctor": "status",
  "repo-narrative": "briefing",
  "repo-pulse": "roster",
}

if (!existsSync(render)) {
  console.error(
    `${path.relative(repoRoot, render)} is missing — build the kit first:\n` +
      `  pnpm --filter @steward/artifact-kit build`,
  )
  process.exit(2)
}

// A preview keyed to a template that no longer exists is worse than no preview:
// `templates.server.ts` keys the glob by basename, so it would simply never be
// read again, and nothing would say so. Same for a fixture that got renamed.
for (const [id, fixture] of Object.entries(PREVIEWS)) {
  for (const [label, file] of [
    ["template", path.join(templates, `${id}.md`)],
    ["fixture", path.join(fixtures, `${fixture}.json`)],
  ] as const) {
    if (!existsSync(file)) {
      console.error(
        `PREVIEWS names ${id} → ${fixture}, but that ${label} does not exist:\n` +
          `  ${path.relative(repoRoot, file)}`,
      )
      process.exit(1)
    }
  }
}

// Prune first, so a template dropped from the map takes its preview with it.
// `ticket-gaps.html` is the case that motivated this: it stopped being a
// built-in when the routine moved to a data repo, and stayed here for months as
// a 45 KB file the picker could never key to anything.
for (const file of readdirSync(outDir).filter((f) => f.endsWith(".html"))) {
  if (!(path.basename(file, ".html") in PREVIEWS)) {
    rmSync(path.join(outDir, file))
    console.log(`pruned docs/samples/${file} — no built-in template claims it`)
  }
}

for (const [id, fixture] of Object.entries(PREVIEWS)) {
  execFileSync(
    process.execPath,
    [
      render,
      path.join(fixtures, `${fixture}.json`),
      path.join(outDir, `${id}.html`),
    ],
    { stdio: "inherit" },
  )
  console.log(`docs/samples/${id}.html ← fixtures/${fixture}.json`)
}
