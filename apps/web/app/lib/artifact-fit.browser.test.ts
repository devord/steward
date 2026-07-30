import { afterEach, describe, expect, it } from "vitest"

import { DEFAULT_THEME, frameArtifactHtml } from "./theme.ts"

/**
 * The fit pass is the highest-risk piece in the artifact pipeline: it exists
 * because tiles never scroll (ADR-0019), it runs against a DOM the board does
 * not own, and the previous approach — each artifact transcribing the
 * algorithm for itself — produced three divergent copies across four live
 * widgets. So it gets exercised for real, in a browser, at a real tile size.
 */

/** A kit-stamped artifact: the stamp is what opts it into the injected pass. */
function artifact(body: string): string {
  return (
    "<html><head>" +
    '<meta name="steward-kit-version" content="1.0.0">' +
    "<style>*{margin:0;padding:0}li,div{line-height:20px;font-size:14px}</style>" +
    `</head><body>${body}</body></html>`
  )
}

function list(
  count: number,
  opts: { keep?: number[]; section?: boolean } = {},
) {
  const items = Array.from({ length: count }, (_, i) => {
    const keep = opts.keep?.includes(i) ? " data-fit-keep" : ""
    return `<li data-fit-item${keep}>row ${i}</li>`
  }).join("")
  const ul = `<ul data-fit-list>${items}</ul>`
  return opts.section
    ? `<section data-fit-section><h2>Head</h2>${ul}</section>`
    : ul
}

const frames: HTMLIFrameElement[] = []
afterEach(() => {
  for (const f of frames.splice(0)) f.remove()
})

/** Mount a framed artifact at an exact tile size and let the pass settle. */
async function mount(body: string, w: number, h: number) {
  const iframe = document.createElement("iframe")
  iframe.style.cssText = `width:${w}px;height:${h}px;border:0`
  iframe.setAttribute("sandbox", "allow-scripts allow-same-origin")
  iframe.srcdoc = frameArtifactHtml(artifact(body), DEFAULT_THEME, "tile")
  document.body.appendChild(iframe)
  frames.push(iframe)
  await new Promise((r) => {
    iframe.addEventListener("load", r, { once: true })
  })
  const doc = iframe.contentDocument
  if (!doc) throw new Error("no iframe document")
  // The pass runs on DOMContentLoaded and again whenever the subtree changes;
  // give it a couple of frames to converge.
  await new Promise((r) => setTimeout(r, 120))
  return doc
}

const visible = (doc: Document) =>
  [...doc.querySelectorAll("[data-fit-item]")].filter(
    (el) => !(el as HTMLElement).hidden,
  ).length

const more = (doc: Document) =>
  doc.querySelector("[data-fit-more]") as HTMLElement | null

describe("the injected fit pass", () => {
  it("leaves everything alone when it already fits", async () => {
    const doc = await mount(list(3), 340, 400)
    expect(visible(doc)).toBe(3)
    expect(more(doc)?.hidden).not.toBe(false)
  })

  it("trims trailing rows until the content fits", async () => {
    const doc = await mount(list(40), 340, 160)
    const shown = visible(doc)
    expect(shown).toBeGreaterThan(0)
    expect(shown).toBeLessThan(40)
    // The contract is that truncation is *visible* — a silent crop is the
    // failure ADR-0019 exists to prevent.
    expect(more(doc)?.hidden).toBe(false)
    expect(more(doc)?.textContent).toBe(`+${40 - shown} more`)
  })

  it("counts exactly what it hid", async () => {
    const doc = await mount(list(40), 340, 160)
    const hidden = [...doc.querySelectorAll("[data-fit-item]")].filter(
      (el) => (el as HTMLElement).hidden,
    ).length
    expect(more(doc)?.textContent).toBe(`+${hidden} more`)
  })

  it("keeps a pinned row even when it would otherwise be trimmed", async () => {
    // Trimming is bottom-up, and the rows that sort to the bottom are often
    // the quiet ones — a repo with zero commits, a check that never ran. Left
    // untagged, the tile trims away exactly the absence the reader needed.
    const doc = await mount(list(40, { keep: [39] }), 340, 160)
    const last = doc.querySelectorAll("[data-fit-item]")[39] as HTMLElement
    expect(last.hidden).toBe(false)
  })

  it("collapses a section rather than leave a heading over a bare count", async () => {
    // A heading that names content and delivers none is the worst reading of
    // a tier, and it spends a row doing it.
    const doc = await mount(list(40, { section: true }), 340, 40)
    const section = doc.querySelector("[data-fit-section]") as HTMLElement
    expect(section.hasAttribute("data-fit-collapsed")).toBe(true)
    expect(section.hidden).toBe(true)
  })

  it("re-fits after a post-load DOM change", async () => {
    // The regression this guards: the pass used to run on DOMContentLoaded,
    // resize and fonts.ready only. A sort or filter click is none of those,
    // so an interactive tile silently overflowed after interaction. body pins
    // overflow:hidden, so a ResizeObserver does not see it either — only
    // watching the subtree does.
    const doc = await mount(list(3), 340, 160)
    expect(visible(doc)).toBe(3)
    const ul = doc.querySelector("[data-fit-list]")
    if (!ul) throw new Error("no fit list")
    for (let i = 0; i < 40; i++) {
      const li = doc.createElement("li")
      li.setAttribute("data-fit-item", "")
      li.textContent = `added ${i}`
      ul.appendChild(li)
    }
    await new Promise((r) => setTimeout(r, 200))
    expect(visible(doc)).toBeLessThan(43)
    expect(more(doc)?.hidden).toBe(false)
  })

  it("grows back when the tile does", async () => {
    // Reset-before-measure. Without it a tile can only ever shrink: widen the
    // widget and the rows stay hidden.
    const doc = await mount(list(12), 340, 100)
    const trimmed = visible(doc)
    expect(trimmed).toBeLessThan(12)
    const frame = frames[frames.length - 1]
    frame.style.height = "600px"
    await new Promise((r) => setTimeout(r, 200))
    expect(visible(doc)).toBeGreaterThan(trimmed)
  })

  it("makes a [data-fit-first] list yield before the content below it", async () => {
    // The case this exists for: a bookkeeping band sitting ABOVE the queue the
    // widget is actually for. Trimming is bottom-up, so without a priority the
    // queue collapses entirely before one housekeeping row goes — a wide-short
    // tile ends up showing only the reconciliation notes. corza-gated was
    // approximating this with a 540px height media query.
    const doc = await mount(
      `<ul data-fit-list data-fit-first>${Array.from(
        { length: 8 },
        (_, i) => `<li data-fit-item>book ${i}</li>`,
      ).join("")}</ul>` +
        `<ul data-fit-list>${Array.from(
          { length: 8 },
          (_, i) => `<li data-fit-item>queue ${i}</li>`,
        ).join("")}</ul>`,
      340,
      160,
    )
    const lists = doc.querySelectorAll("[data-fit-list]")
    const shown = (l: Element) =>
      [...l.querySelectorAll("[data-fit-item]")].filter(
        (el) => !(el as HTMLElement).hidden,
      ).length
    // The bookkeeping list gave way; the queue kept more of itself.
    expect(shown(lists[0])).toBeLessThan(shown(lists[1]))
  })

  it("reduces a yield-first band to its label instead of hiding it", async () => {
    // A bookkeeping band yields before everything else, so it reaches the
    // empty-list branch on almost every tile. Collapsing it whole would mean
    // it never appears outside the full view — narrower than the pixel-height
    // rule it replaced, which kept the label and dropped only the rows. The
    // label is the point: "2 records to tidy" is not the same as silence.
    const doc = await mount(
      `<section data-fit-section><h2>Reconcile</h2>` +
        `<ul data-fit-list data-fit-first>${Array.from(
          { length: 6 },
          (_, i) => `<li data-fit-item>book ${i}</li>`,
        ).join("")}</ul></section>` +
        `<ul data-fit-list>${Array.from(
          { length: 20 },
          (_, i) => `<li data-fit-item>queue ${i}</li>`,
        ).join("")}</ul>`,
      340,
      200,
    )
    const section = doc.querySelector("[data-fit-section]")
    if (!section) throw new Error("no section")
    expect(section.hasAttribute("data-fit-label-only")).toBe(true)
    expect(section.hasAttribute("data-fit-collapsed")).toBe(false)
    expect((section as HTMLElement).hidden).toBe(false)
    expect(doc.querySelector("h2")?.textContent).toBe("Reconcile")
    expect((doc.querySelector("[data-fit-first]") as HTMLElement).hidden).toBe(
      true,
    )
  })

  it("restores a label-only band when the tile grows again", async () => {
    const doc = await mount(
      `<section data-fit-section><h2>Reconcile</h2>` +
        `<ul data-fit-list data-fit-first>${Array.from(
          { length: 3 },
          (_, i) => `<li data-fit-item>book ${i}</li>`,
        ).join("")}</ul></section>`,
      340,
      60,
    )
    const section = doc.querySelector("[data-fit-section]")
    if (!section) throw new Error("no section")
    expect(section.hasAttribute("data-fit-label-only")).toBe(true)
    frames[frames.length - 1].style.height = "600px"
    await new Promise((r) => setTimeout(r, 250))
    expect(section.hasAttribute("data-fit-label-only")).toBe(false)
    expect((doc.querySelector("[data-fit-first]") as HTMLElement).hidden).toBe(
      false,
    )
  })

  it("does not run for a legacy artifact carrying its own pass", async () => {
    // Two passes trimming the same list would fight. A legacy file keeps its
    // transcribed copy until its routine migrates.
    const iframe = document.createElement("iframe")
    iframe.style.cssText = "width:340px;height:160px;border:0"
    iframe.setAttribute("sandbox", "allow-scripts allow-same-origin")
    iframe.srcdoc = frameArtifactHtml(
      `<html><head></head><body>${list(40)}</body></html>`,
      DEFAULT_THEME,
      "tile",
    )
    document.body.appendChild(iframe)
    frames.push(iframe)
    await new Promise((r) => {
      iframe.addEventListener("load", r, { once: true })
    })
    await new Promise((r) => setTimeout(r, 120))
    const doc = iframe.contentDocument
    if (!doc) throw new Error("no iframe document")
    expect(visible(doc)).toBe(40)
    expect(more(doc)).toBeNull()
  })
})
