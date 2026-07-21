/**
 * The artifact's briefing — the markdown an artifact carries for the viewer
 * to hand to Claude (ADR-0043).
 *
 * The host never talks to the artifact to get this. It already holds the
 * published HTML as a string on its way to `srcDoc`, so it reads the block
 * straight out of that string. No postMessage, no same-origin, no new hole
 * in the sandbox — the artifact→host boundary of ADR-0028 is untouched.
 */

/** The block, however its attributes are ordered. Lazy `[\s\S]*?` so the
    first `</script>` closes it — the escaping rule below is what keeps a
    briefing that quotes markup from truncating itself here. */
const CONTEXT_RE =
  /<script[^>]*\bid="steward-context"[^>]*>([\s\S]*?)<\/script>/i

/**
 * The briefing markdown, or null when the artifact carries none.
 *
 * Regex rather than DOMParser on purpose: this runs under SSR too, where
 * there is no DOM. The convention is narrow enough that a parser buys
 * nothing — one known id, one known container.
 */
export function extractArtifactContext(html: string): string | null {
  const m = CONTEXT_RE.exec(html)
  if (!m) return null
  // `</script>` can't appear literally inside a script element, so authors
  // write `<\/script>` and we restore it. Same idiom as JSON-in-script.
  const body = dedent(m[1].replace(/<\\\//g, "</")).trim()
  return body === "" ? null : body
}

/**
 * Strip the block's common leading indentation.
 *
 * An HTML formatter indents script content to match its depth in the
 * document, which is invisible in markup and catastrophic in markdown: four
 * leading spaces turn every line into a code block. Dedenting here keeps the
 * artifact free to be formatted like the HTML it lives in.
 */
function dedent(text: string): string {
  const lines = text.split("\n")
  let min = Infinity
  for (const line of lines) {
    if (line.trim() === "") continue
    min = Math.min(min, line.length - line.trimStart().length)
  }
  if (!Number.isFinite(min) || min === 0) return text
  return lines.map((l) => (l.trim() === "" ? l : l.slice(min))).join("\n")
}

/**
 * The briefing framed as a message to Claude.
 *
 * The header is the host's job, not the artifact's: the host owns the
 * routine's display name and freshness, so templates don't each restate
 * them (and can't drift from what the card shows).
 */
export function artifactContextMessage(
  context: string,
  { name, ranLabel }: { name: string; ranLabel: string },
): string {
  return `# ${name}\n\nA Steward widget on my dashboard — ${ranLabel.toLowerCase()}. Here's what it's showing me; help me think it through.\n\n${context}\n`
}
