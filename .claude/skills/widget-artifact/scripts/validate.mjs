#!/usr/bin/env node
// Artifact contract validator (widget-standard + the widget-artifact skill).
//
//   node validate.mjs <artifact.html> [...more.html]
//
// Exit 1 when any file has errors; warnings alone exit 0.
//
// **What this checks changed shape with ADR-0050.** When artifacts were
// hand-authored, the validator was the only thing standing between a model
// improvising 900 lines of CSS and the artifacts branch, so it re-derived the
// contract from the output: palette drift, type floors, media-query grammar,
// subgrid ancestry, unplaced grid items. Roughly 500 lines of selector parsing
// and tree walking existed to catch mistakes that were possible only because a
// person or a model wrote the markup by hand.
//
// The kit removed the hand. Every artifact is `render.mjs` over a `data.json`;
// the stylesheet is generated output CI byte-checks against the theme registry,
// and the input document is checked field by field before it renders
// (`validate-doc.ts`). So those checks stopped catching anything and started
// costing something — 30 warnings per artifact, every one of them Tailwind's
// own `color-mix` fallbacks, which is how a validator teaches its readers to
// stop reading it.
//
// What is left is the part the kit does *not* determine: whether the stamp
// says the kit rendered this at all, and whether the content the routine
// supplied is honest. A check belongs here now only if a correct kit render can
// still fail it.

import { readFileSync } from "node:fs"

// Generated from the theme registry by scripts/gen-artifact-tokens.ts, and
// CI-checked for drift. It used to be hardcoded here, and it fell behind:
// this table still held classic gruvbox (#ebdbb2, #fabd2f) long after the
// registry was retranscribed to gruvbox-material (ADR-0048). The failure ran
// backwards — a correctly-themed artifact was rejected at the publish gate
// while stale ones sailed through, so published files kept painting the old
// palette in every raw view and dry-run preview.
//
// Plain JSON, read at startup: this runs as bare `node` in routine
// environments with no node_modules, so it cannot import the registry itself.
const TOKENS = JSON.parse(
  readFileSync(new URL("../tokens.json", import.meta.url), "utf8"),
)

// Strip a block's common leading indentation — the same pass the board runs
// on the context block (apps/web/app/lib/artifact-context.ts).
function dedent(text) {
  const lines = text.split("\n")
  let min = Infinity
  for (const line of lines) {
    if (line.trim() === "") continue
    min = Math.min(min, line.length - line.trimStart().length)
  }
  if (!Number.isFinite(min) || min === 0) return text
  return lines.map((l) => (l.trim() === "" ? l : l.slice(min))).join("\n")
}

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error("usage: validate.mjs <artifact.html> [...more.html]")
  process.exit(2)
}

let failed = false

for (const file of files) {
  const raw = readFileSync(file, "utf8")
  const errors = []
  const warnings = []

  // — Context block (ADR-0043) —
  // Excised before anything else, and every check below reads `html`, not
  // `raw`: the briefing is prose *about* the subject, so it says things like
  // "add a fetch( call" or quotes a hex. Scanned as markup it would trip
  // self-containment and palette checks it has nothing to do with.
  const ctx = /<script[^>]*\bid="steward-context"[^>]*>([\s\S]*?)<\/script>/i
  const ctxMatch = ctx.exec(raw)
  const html = ctxMatch ? raw.replace(ctxMatch[0], "") : raw

  if (!ctxMatch) {
    warnings.push(
      'no <script type="text/markdown" id="steward-context"> — the widget ' +
        "gets no Chat-with-Claude button (widget-standard §9)",
    )
  } else {
    // Dedented the way the board dedents it: a formatter indents script
    // content to its depth in the document, and four leading spaces would
    // make every line of the briefing a markdown code block.
    const body = dedent(ctxMatch[1].replace(/<\\\//g, "</")).trim()
    // A literal `</script>` inside the briefing can't be caught by looking
    // at the body: it *is* what closed the block, so the body ends before
    // it. What it leaves behind is the tell — the rest of the briefing spills
    // into the document as stray text ahead of the next tag.
    const after = raw.slice(ctxMatch.index + ctxMatch[0].length)
    const nextTag = after.indexOf("<")
    const spilled = (nextTag === -1 ? after : after.slice(0, nextTag)).trim()
    if (spilled !== "")
      errors.push(
        "text after the steward-context block: " +
          `"${spilled.slice(0, 40)}${spilled.length > 40 ? "…" : ""}" — a ` +
          "literal `</script>` inside the briefing closed it early; escape " +
          "it as `<\\/script>` (everything past it is missing)",
      )
    else if (body === "") errors.push("steward-context block is empty")
    else if (!/^#{1,3}\s/m.test(body))
      warnings.push(
        "steward-context has no markdown heading — give it sections so the " +
          "paste reads as a briefing, not a wall",
      )
  }

  // — The kit stamp (ADR-0050) —
  // This is the check every other one now leans on. Artifacts are compiled,
  // not transcribed: `Shell` stamps the version it rendered with, so a file
  // without the stamp was not produced by the kit — and nothing below is
  // entitled to assume the tokens, the tiers, the footer or the fit wiring
  // are the kit's. It is also what the board gates `kit.css` injection on
  // (`usesArtifactKit`, theme.ts), so an unstamped file silently opts out of
  // every design fix that ships after it.
  //
  // Presence and shape, and deliberately not compatibility: the kit sitting
  // beside this validator is the one that just rendered the file, so a major
  // check here would only ever compare something with itself. Noticing that an
  // artifact published months ago has fallen a major behind is the board's job,
  // at injection time, where the two versions genuinely differ.
  const kitStamp = html.match(
    /<meta[^>]+name="steward-kit-version"[^>]+content="([^"]*)"/i,
  )
  if (!kitStamp) {
    errors.push(
      "no <meta name=steward-kit-version> — this artifact was not rendered by " +
        "the kit. Emit a data.json and run render.mjs (ADR-0050); a " +
        "hand-authored file also never receives an injected kit.css fix",
    )
  } else if (!/^\d+\.\d+\.\d+$/.test(kitStamp[1])) {
    errors.push(`steward-kit-version is not semver: "${kitStamp[1]}"`)
  }

  // — Self-containment (hard requirement 1) —
  // The one check the kit cannot make impossible: every URL in the document
  // arrives from the routine's own data — a face's `src`, a row's `href`, a
  // provenance link — so the kit will faithfully render whatever it is given.
  // Resource loads are banned; <a href> links out are the one sanctioned
  // external reference (widget-standard §7).
  for (const [, tag, attrs] of html.matchAll(/<(\w+)((?:[^>"]|"[^"]*")*)>/g)) {
    if (tag.toLowerCase() === "a") continue
    for (const [, attr, url] of attrs.matchAll(
      /\b(src|href|xlink:href)\s*=\s*"((?:https?:)?\/\/[^"]*)"/gi,
    )) {
      errors.push(`external ${attr} on <${tag}>: ${url.slice(0, 60)}`)
    }
  }
  for (const [m] of html.matchAll(/url\(\s*['"]?(?:https?:)?\/\//g)) {
    errors.push(`external url() in CSS: ${m}`)
  }
  if (/@import\b/.test(html)) errors.push("@import in CSS (external request)")
  for (const api of [
    "fetch(",
    "XMLHttpRequest",
    "new WebSocket",
    "new EventSource",
  ]) {
    if (html.includes(api)) errors.push(`network API in script: ${api}`)
  }

  // The two checks below read the document as kit output, so they are worth
  // nothing without the stamp — and worse than nothing with it missing: a
  // hand-authored file has no "inlined kit stylesheet" to be absent from, and
  // would report every class it carries. One clear error about the stamp beats
  // two hundred consequences of it.
  if (kitStamp) {
    // — Kit class coverage (ADR-0050) —
    // A precompiled stylesheet cannot know a class a routine invented at run
    // time, so an off-surface class renders unstyled with no error anywhere.
    // Checking every class in the markup against the selectors actually present
    // in the inlined stylesheet turns that silent failure into a publish-time
    // one — and catches plain typos in kit class names for free. It has already
    // caught a real one: `TONE_FILL.neutral` shipped as an unstyled `bg-ink`
    // when the build's source scan missed the `.ts` map holding it.
    const styled = new Set()
    for (const [, sel] of html.matchAll(/\.((?:[\\][^\s]|[A-Za-z0-9_-])+)/g)) {
      styled.add(sel.replace(/\\/g, ""))
    }
    const seen = new Set()
    for (const [, list] of html.matchAll(/\sclass="([^"]*)"/g)) {
      for (const cls of list.split(/\s+/)) {
        if (!cls || seen.has(cls) || styled.has(cls)) continue
        seen.add(cls)
        errors.push(
          `class "${cls}" has no rule in the inlined kit stylesheet — it will ` +
            "render unstyled (outside the kit's safelisted surface, or a typo)",
        )
      }
    }

    // — Fit-to-height wiring (ADR-0019) —
    // The board injects the fit pass, so an artifact carries no copy of it.
    // What it must carry is something for that pass to trim: a band rendered as
    // one indivisible unit has no `[data-fit-item]` inside, and a tile then
    // *crops* it instead of shortening it. Hit three times during the migration
    // — the verdict band, the rails, and very nearly the day grid — which is
    // why it is an error rather than a warning.
    //
    // Checked outside `<style>`: the shared `tiers.css` a band like Throughput
    // pulls in carries generic selectors written against the attribute name
    // (`[data-fit-list] > thead { ... }`) so that *other* bands' tables degrade
    // correctly, whether or not this particular render uses them. Matching
    // that selector text as if it were markup made every fit-list-free render
    // fail — including the previously-published version of this very check's
    // own test case — for CSS the page never actually uses.
    const htmlNoStyle = html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, "")
    if (
      htmlNoStyle.includes("data-fit-list") &&
      !htmlNoStyle.includes("data-fit-item")
    ) {
      errors.push(
        "[data-fit-list] with no [data-fit-item] inside — the injected pass " +
          "has nothing to trim, so the tile will clip instead of degrading",
      )
    }
  }

  // — Palette discipline, in the one place a routine can still paint —
  // The stylesheet itself is not scanned any more, and dropping that is the
  // single biggest change here. It reported 30 warnings on every artifact, and
  // every one was Tailwind's own machinery: `#0000` for transparent, palette
  // hexes carrying an alpha suffix (`#7daea34d` is --color-blue at 30%), and
  // the precomputed `color-mix` fallbacks that sit inside `@supports` guards
  // (`#98531a` is orange blended toward bg1). No kit component contains a hex
  // literal — verified — so the check could only ever fire on generated CSS
  // that CI already diffs against the registry. Thirty false warnings do not
  // make a file safer; they make the two real ones invisible.
  //
  // An inline `style=` is different: nothing the kit emits uses one for colour,
  // so a hex here came from routine-authored markup through the Alpine escape
  // hatch. That is precisely where an invented colour would land, and it would
  // survive the board's theme override at a fixed value while everything around
  // it followed the viewer's theme.
  const canonical = new Set(Object.values(TOKENS))
  for (const [, style] of html.matchAll(/\sstyle="([^"]*)"/g)) {
    for (const [hex] of style.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
      if (!canonical.has(hex.toLowerCase()))
        warnings.push(
          `non-palette hex in an inline style: ${hex} — paint via ` +
            "var(--color-*), or the board's theme override cannot reach it",
        )
    }
  }

  // — Person-relative content (ADR-0039) —
  // "You" is resolved when the artifact is rendered, not when it is built,
  // because one file is shown to everyone who can see the board. The kit
  // resolves the viewer for its ledgers, but the words in `title`, a row's
  // `detail`, a prose `body` and the briefing are the routine's own.
  const visible = html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
  if (/\byours?\b/i.test(visible))
    warnings.push(
      'static text says "you/your(s)" — person-relative content is render-time (ADR-0039)',
    )

  const tag = files.length > 1 ? `${file}: ` : ""
  for (const e of errors) console.log(`${tag}error: ${e}`)
  for (const w of warnings) console.log(`${tag}warn:  ${w}`)
  console.log(
    `${tag}${errors.length} error(s), ${warnings.length} warning(s)${
      errors.length === 0 ? " — ok to publish" : ""
    }`,
  )
  if (errors.length > 0) failed = true
}

process.exit(failed ? 1 : 0)
