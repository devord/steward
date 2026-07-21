#!/usr/bin/env node
// Artifact contract validator (widget-standard + the widget-artifact
// skill). Checks the deterministic half of the contract; composition
// (hierarchy, density, alignment) stays with design.md and the author.
//
//   node validate.mjs <artifact.html> [...more.html]
//
// Exit 1 when any file has errors; warnings alone exit 0.

import { readFileSync } from "node:fs"

// Must stay identical to the token snippet in SKILL.md (ADR-0007).
const TOKENS = {
  "--color-bg": "#1d2021",
  "--color-bg1": "#282828",
  "--color-bg2": "#32302f",
  "--color-bg3": "#3c3836",
  "--color-border": "#504945",
  "--color-border-dim": "#3c3836",
  "--color-ink": "#ebdbb2",
  "--color-ink-dim": "#a89984",
  "--color-ink-faint": "#928374",
  "--color-orange": "#fe8019",
  "--color-orange-deep": "#d65d0e",
  "--color-yellow": "#fabd2f",
  "--color-green": "#b8bb26",
  "--color-aqua": "#8ec07c",
  "--color-blue": "#83a598",
  "--color-purple": "#d3869b",
  "--color-red": "#fb4934",
}

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error("usage: validate.mjs <artifact.html> [...more.html]")
  process.exit(2)
}

let failed = false

for (const file of files) {
  const html = readFileSync(file, "utf8")
  const errors = []
  const warnings = []

  // — Self-containment (hard requirement 1) —
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

  // — Theme tokens (hard requirement 3) —
  for (const [name, value] of Object.entries(TOKENS)) {
    const decl = new RegExp(`${name}\\s*:\\s*([^;]+);`)
    const m = html.match(decl)
    if (!m) errors.push(`missing token ${name}`)
    else if (m[1].trim().toLowerCase() !== value)
      errors.push(`token drift: ${name} is ${m[1].trim()}, expected ${value}`)
  }
  if (!/color-scheme\s*:\s*dark/.test(html))
    errors.push("missing color-scheme: dark")
  if (!/--font-mono\s*:\s*"Geist Mono Variable"/.test(html))
    errors.push('--font-mono must lead with "Geist Mono Variable" (ADR-0031)')

  // — Generation time (hard requirement 4) —
  const meta = html.match(
    /<meta\s+(?:name="widget-generated-at"\s+content="([^"]+)"|content="([^"]+)"\s+name="widget-generated-at")/,
  )
  const stamp = meta && (meta[1] || meta[2])
  if (!stamp) errors.push("missing <meta name=widget-generated-at>")
  else if (
    Number.isNaN(Date.parse(stamp)) ||
    !/^\d{4}-\d{2}-\d{2}T/.test(stamp)
  )
    errors.push(`widget-generated-at is not ISO-8601: ${stamp}`)
  if (!/<footer[\s>]/.test(html))
    errors.push("missing <footer> (standalone chrome)")

  // — Type floors (widget-standard §6) —
  for (const [m, n] of html.matchAll(/font-size\s*:\s*(\d+(?:\.\d+)?)px/g)) {
    if (Number(n) < 12)
      errors.push(`font-size below the 12px floor: ${m.trim()}`)
  }

  // — Links (widget-standard §7) —
  for (const [tag] of html.matchAll(/<a\s(?:[^>"]|"[^"]*")*>/g)) {
    const href = tag.match(/\bhref\s*=\s*"([^"]*)"/)?.[1]
    if (!href || href.startsWith("#")) continue
    if (!/\btarget\s*=\s*"_blank"/.test(tag))
      errors.push(`anchor without target="_blank": ${href.slice(0, 60)}`)
    if (!/\brel\s*=\s*"[^"]*noopener/.test(tag))
      errors.push(`anchor without rel="noopener": ${href.slice(0, 60)}`)
  }

  // — Fit-to-height wiring (ADR-0019) —
  const hasFitList = html.includes("data-fit-list")
  const hasFitScript = html.includes("data-steward-tile")
  if (hasFitList && !hasFitScript)
    errors.push(
      "data-fit-list present but no fit script (data-steward-tile never read)",
    )
  if (!hasFitList) {
    const longList = [
      ...html.matchAll(/<[ou]l[^>]*>([\s\S]*?)<\/[ou]l>/g),
    ].some(([, body]) => (body.match(/<li[\s>]/g) || []).length > 6)
    if (longList)
      warnings.push(
        "a list has >6 items but no [data-fit-list] — tiles may clip silently",
      )
  }

  // — Document outline & person-relative smells —
  if (!/<h1[\s>]/.test(html))
    warnings.push(
      "no <h1> — sections need a root, even visually hidden (design.md Heading)",
    )
  const visible = html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
  if (/\byours?\b/i.test(visible))
    warnings.push(
      'static text says "you/your(s)" — person-relative content is render-time (ADR-0039)',
    )

  // — Palette discipline (tokens only) —
  const canonical = new Set(Object.values(TOKENS))
  const styles = [...html.matchAll(/<style[\s\S]*?<\/style>/g)]
    .map((m) => m[0])
    .join("\n")
  for (const [hex] of styles.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
    if (!canonical.has(hex.toLowerCase()))
      warnings.push(`non-palette hex in CSS: ${hex} — paint via var(--color-*)`)
  }

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
