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

// Split a selector list on its top-level commas: `:is(a, b) > c` is one
// selector, not two.
function splitSelectorList(sel) {
  const out = []
  let depth = 0
  let start = 0
  for (let i = 0; i < sel.length; i++) {
    const c = sel[i]
    if (c === "(" || c === "[") depth++
    else if (c === ")" || c === "]") depth--
    else if (c === "," && depth === 0) {
      out.push(sel.slice(start, i))
      start = i + 1
    }
  }
  out.push(sel.slice(start))
  return out.map((s) => s.trim()).filter(Boolean)
}

// Break a complex selector into compounds, each carrying the combinator that
// precedes it. The last one is the subject — the element the rule paints —
// and the rest are the ancestry it demands. Combinators nested inside
// :is()/:not() belong to that function, not to this selector.
function parseSelector(sel) {
  const parts = []
  let depth = 0
  let buf = ""
  let combinator = " "
  for (const c of sel) {
    if (c === "(" || c === "[") depth++
    else if (c === ")" || c === "]") depth--
    if (depth === 0 && /[\s>+~]/.test(c)) {
      if (buf) {
        parts.push({ combinator, compound: buf })
        buf = ""
        combinator = " "
      }
      if (/[>+~]/.test(c)) combinator = c
      continue
    }
    buf += c
  }
  if (buf) parts.push({ combinator, compound: buf })
  return parts
}

// Does a compound describe this element? Verify what the tag states outright
// (name, id, classes, plain attributes) and let everything else — pseudo
// classes, :is(), functional selectors — pass. A permissive match costs a
// missed error; a strict one invents errors against valid artifacts.
const COMPOUND_TOKEN =
  /::?[\w-]+(?:\([^)]*\))?|\[[^\]]*\]|[#.][-\w]+|[-\w]+|\*/g
function compoundMatches(compound, el) {
  for (const [token] of compound.matchAll(COMPOUND_TOKEN)) {
    if (token === "*" || token.startsWith(":")) continue
    if (token.startsWith(".")) {
      if (!el.classes.includes(token.slice(1))) return false
    } else if (token.startsWith("#")) {
      if (el.id !== token.slice(1)) return false
    } else if (token.startsWith("[")) {
      const m = token.match(/^\[\s*([-\w]+)\s*(?:([~|^$*]?=)\s*"?([^"\]]*)"?)?/)
      if (!m) continue
      const value = el.attrs[m[1].toLowerCase()]
      // The board stamps <html> at render time (the tile marker, the theme),
      // so an attribute missing there statically proves nothing.
      if (value === undefined) {
        if (el.tag === "html") continue
        return false
      }
      // Only plain equality is worth verifying; the fuzzy operators would
      // need the real matching rules to stay honest.
      if (m[2] === "=" && value !== m[3]) return false
    } else if (token.toLowerCase() !== el.tag) return false
  }
  return true
}

// Does this selector paint the last element of `chain` (its open ancestors,
// outermost first)? Matched right to left, the way a browser does it, so
// `.workstreams li` is not allowed to claim every <li> in the document.
// Sibling combinators pass unchecked: the walk tracks ancestry, not siblings.
function selectorMatches(parts, chain) {
  const subject = chain.length - 1
  if (!compoundMatches(parts[parts.length - 1].compound, chain[subject]))
    return false
  const ancestry = (i, at) => {
    if (i < 0) return true
    const { combinator } = parts[i + 1]
    if (combinator === "+" || combinator === "~") return ancestry(i - 1, at)
    if (combinator === ">")
      return (
        at > 0 &&
        compoundMatches(parts[i].compound, chain[at - 1]) &&
        ancestry(i - 1, at - 1)
      )
    for (let p = at - 1; p >= 0; p--)
      if (compoundMatches(parts[i].compound, chain[p]) && ancestry(i - 1, p))
        return true
    return false
  }
  return ancestry(parts.length - 2, subject)
}

function describe(el) {
  return `<${el.tag}${el.id ? "#" + el.id : ""}${
    el.classes.length ? "." + el.classes[0] : ""
  }>`
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

  // — Media query grammar —
  // `not (…)` must negate the whole prelude: `not (…) and (…)` is not
  // parseable, the browser reads it as not-all, and every rule gated on it
  // silently never applies (content that "displays almost nothing").
  for (const [, prelude] of html.matchAll(/@media([^{]+)\{/g)) {
    const p = prelude.trim()
    if (!/^not\s*\(/.test(p)) continue
    let depth = 0
    let i = p.indexOf("(")
    for (; i < p.length; i++) {
      if (p[i] === "(") depth++
      else if (p[i] === ")" && --depth === 0) break
    }
    if (p.slice(i + 1).trim())
      errors.push(
        `invalid media query "${p.slice(0, 70)}" — \`not (…)\` must negate ` +
          "the whole query (wrap the full condition in one group); as " +
          "written it parses as not-all and the rule never applies",
      )
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
  // A list trimmed to zero items leaves its <h2> advertising content that is
  // no longer there. The current snippet collapses the owning section and
  // marks it; an artifact on the older snippet has no such marker.
  if (hasFitList && !html.includes("data-fit-collapsed"))
    warnings.push(
      "fit script predates the empty-section collapse — a fully trimmed " +
        "section will render as a heading over a bare `+N more` (SKILL.md)",
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

  // The CSS itself: inside the <style> tags, comments removed. Both are text
  // a rule-splitting regex would otherwise hand back as part of a selector —
  // a comment sitting above `main {` reads as ancestry `main` never has.
  const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
    .map((m) => m[1].replace(/\/\*[\s\S]*?\*\//g, " "))
    .join("\n")

  // Markup with the script and style islands cut out, for the checks that
  // are structural questions about the element tree rather than about CSS.
  const VOID = new Set(["meta", "link", "br", "img", "input", "hr", "source"])
  const markup = html
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<style[\s\S]*?<\/style>/g, "")

  // — Section rhythm (design.md · Section · Rhythm) —
  // Sections must breathe more than the rows inside them, and the separation
  // is a `gap` on every element that stacks sections. A `gap` reaches only its
  // direct children, so a column wrapper that forgets one drops its sections
  // flush against the row above while `main { gap }` still sits there looking
  // healthy. That is a structural question — which element stacks the
  // sections, and does it declare a gap — so answer it structurally.
  {
    // Selectors that declare a gap, reduced to the classes they name.
    const gapped = new Set()
    let mainHasGap = false
    for (const [, sel, body] of styles.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/(?:^|[\s;{])(?:row-)?gap\s*:/.test(body)) continue
      if (/(?:^|[\s,>+~])main\b/.test(sel)) mainHasGap = true
      for (const [, cls] of sel.matchAll(/\.([\w-]+)/g)) gapped.add(cls)
    }

    // Walk the markup, tracking which element directly holds each <section>.
    const stack = []
    for (const [, close, name, attrs] of markup.matchAll(
      /<(\/)?([a-zA-Z][\w-]*)((?:[^>"]|"[^"]*")*)>/g,
    )) {
      const el = name.toLowerCase()
      if (close) {
        for (let i = stack.length - 1; i >= 0; i--)
          if (stack[i].tag === el) {
            const [done] = stack.splice(i)
            // Only a container holding two or more sections owes a rhythm.
            if (done && done.sections > 1 && !done.ok)
              warnings.push(
                `<${done.tag}${done.cls ? "." + done.cls.split(/\s+/)[0] : ""}> ` +
                  `stacks ${done.sections} sections but declares no gap — ` +
                  "`main`'s gap stops at its own children, so these labels sit " +
                  "flush (design.md · Section · Rhythm: mark it `.stack`)",
              )
            break
          }
        continue
      }
      if (VOID.has(el) || /\/\s*$/.test(attrs)) continue
      const cls = attrs.match(/\bclass\s*=\s*"([^"]*)"/)?.[1] || ""
      const classes = cls.split(/\s+/).filter(Boolean)
      const isSection = el === "section" || classes.includes("section")
      if (isSection && stack.length) stack[stack.length - 1].sections++
      stack.push({
        tag: el,
        cls,
        sections: 0,
        ok: (el === "main" && mainHasGap) || classes.some((c) => gapped.has(c)),
      })
    }
  }

  // — Subgrid chain (design.md · Ledger rows) —
  // `subgrid` inherits the parent grid's tracks, so it needs a parent grid to
  // inherit from: on an element whose parent is not a grid container it
  // computes to `none`, and the row silently collapses to one column with
  // every cell stacked on its own line. The trap is a wrapper — a <section>
  // between the `main` grid and the list that relays the label and the
  // hairline but was never made a grid itself. Nothing about the CSS looks
  // wrong, and a sibling that happens to sit directly under `main` still
  // aligns perfectly, which is what makes it read as a rendering glitch.
  {
    const gridMakers = []
    const subgridUsers = []
    for (const [, sel, body] of styles.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const makesGrid = /(?:^|[\s;{])display\s*:\s*(?:inline-)?grid\b/.test(
        body,
      )
      const usesSubgrid =
        /(?:^|[\s;{])grid-template(?:-columns|-rows|-areas)?\s*:[^;]*\bsubgrid\b/.test(
          body,
        )
      if (!makesGrid && !usesSubgrid) continue
      for (const one of splitSelectorList(sel)) {
        // An at-rule prelude names no element (@media wrappers never reach
        // here — their braces nest — but @font-face-shaped ones do).
        if (one.startsWith("@")) continue
        const parts = parseSelector(one)
        if (!parts.length) continue
        if (makesGrid) gridMakers.push(parts)
        if (usesSubgrid) subgridUsers.push({ parts, source: one })
      }
    }

    // One entry per broken (selector, parent) pair: a list of 40 rows would
    // otherwise report the same missing rule 40 times.
    const broken = new Map()
    const stack = []
    for (const [, close, name, attrs] of markup.matchAll(
      /<(\/)?([a-zA-Z][\w-]*)((?:[^>"]|"[^"]*")*)>/g,
    )) {
      const tag = name.toLowerCase()
      if (close) {
        for (let i = stack.length - 1; i >= 0; i--)
          if (stack[i].tag === tag) {
            stack.splice(i)
            break
          }
        continue
      }
      if (VOID.has(tag) || /\/\s*$/.test(attrs)) continue
      const el = { tag, id: "", classes: [], attrs: {} }
      for (const [, attr, value] of attrs.matchAll(
        /\b([-\w:]+)\s*=\s*"([^"]*)"/g,
      ))
        el.attrs[attr.toLowerCase()] = value
      el.id = el.attrs.id || ""
      el.classes = (el.attrs.class || "").split(/\s+/).filter(Boolean)

      const chain = [...stack, el]
      const parent = stack[stack.length - 1]
      const used = subgridUsers.find(({ parts }) =>
        selectorMatches(parts, chain),
      )
      if (used) {
        const relayed =
          parent && gridMakers.some((parts) => selectorMatches(parts, stack))
        if (!relayed) {
          const where = parent ? describe(parent) : "the document root"
          const key = used.source + " " + where
          const seen = broken.get(key)
          if (seen) seen.count++
          else broken.set(key, { used: used.source, where, count: 1 })
        }
      }
      stack.push(el)
    }

    for (const { used, where, count } of broken.values()) {
      errors.push(
        `subgrid on \`${used}\` but its parent ${where} is not a grid` +
          (count > 1 ? ` (${count} elements)` : "") +
          " — subgrid outside a grid computes to `none`, so the row collapses " +
          "to one column and every cell stacks; give the parent " +
          "`display: grid; grid-template-columns: subgrid` so it relays the " +
          "tracks (design.md · Ledger rows)",
      )
    }
  }

  // — Palette discipline (tokens only) —
  const canonical = new Set(Object.values(TOKENS))
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
