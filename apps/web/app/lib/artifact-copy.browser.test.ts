import { afterEach, describe, expect, it } from "vitest"

import { DEFAULT_THEME, frameArtifactHtml } from "./theme.ts"

/**
 * The copy action's contract is mostly about what happens when the clipboard
 * refuses. The frame has no `allow-same-origin`, so its origin is opaque and
 * the async Clipboard API is unreliable there — the button still has to give
 * the reader an honest answer either way, and it must never sit revealed on a
 * page where nothing is listening.
 */
const frames: HTMLIFrameElement[] = []
afterEach(() => {
  for (const f of frames.splice(0)) f.remove()
})

function doc(kit: boolean) {
  const stamp = kit ? '<meta name="steward-kit-version" content="1.0.0">' : ""
  return (
    `<html><head>${stamp}</head><body>` +
    '<button type="button" hidden data-kit-copy ' +
    'data-kit-copy-payload="PAYLOAD" data-kit-copy-label="copy">copy</button>' +
    "</body></html>"
  )
}

async function mount(kit: boolean) {
  const iframe = document.createElement("iframe")
  iframe.style.cssText = "width:400px;height:200px;border:0"
  iframe.setAttribute("sandbox", "allow-scripts allow-same-origin")
  iframe.srcdoc = frameArtifactHtml(doc(kit), DEFAULT_THEME, "tile")
  document.body.appendChild(iframe)
  frames.push(iframe)
  await new Promise((r) => {
    iframe.addEventListener("load", r, { once: true })
  })
  const d = iframe.contentDocument
  if (!d) throw new Error("no iframe document")
  await new Promise((r) => setTimeout(r, 80))
  // Not `instanceof HTMLElement`: the node lives in the iframe's realm, whose
  // constructors are different objects from this window's, so the check fails
  // for a perfectly good element.
  const button = d.querySelector<HTMLElement>("[data-kit-copy]")
  if (!button) throw new Error("no copy button")
  return { d, button }
}

describe("the injected copy action", () => {
  it("reveals the button, which ships hidden", async () => {
    // A raw-opened artifact has no behaviour attached, so the control stays
    // hidden there rather than looking clickable and doing nothing.
    const { button } = await mount(true)
    expect(button.hidden).toBe(false)
  })

  it("leaves the button hidden when nothing is listening", async () => {
    const { button } = await mount(false)
    expect(button.hidden).toBe(true)
  })

  it("answers the click either way, then restores the label", async () => {
    // Whether the clipboard accepted is not something the reader can see, so
    // the button says which happened. What must never occur is a click that
    // looks like nothing happened at all.
    const { button } = await mount(true)
    button.click()
    await new Promise((r) => setTimeout(r, 30))
    expect(["copied", "copy failed"]).toContain(button.textContent)
    // Sticking on "copied" would make a second copy unreadable as an action.
    await new Promise((r) => setTimeout(r, 1700))
    expect(button.textContent).toBe("copy")
  })

  it("leaves no scratch textarea behind in the document", async () => {
    // The synchronous fallback mounts one to select from; leaking it would
    // put a focusable, invisible field into every artifact that copies.
    const { d, button } = await mount(true)
    button.click()
    await new Promise((r) => setTimeout(r, 30))
    expect(d.querySelectorAll("textarea")).toHaveLength(0)
  })
})
