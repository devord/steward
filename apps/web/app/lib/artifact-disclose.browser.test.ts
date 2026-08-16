import { afterEach, describe, expect, it } from "vitest"

import { DEFAULT_THEME, frameArtifactHtml } from "./theme.ts"

/**
 * The disclosure's contract is about what the file says when nothing is
 * listening. Every other injected behaviour in the kit ships its control
 * `hidden`; this one cannot, because the control *is* the group's heading. So
 * the invariant to hold is the other half of the same bargain: before the
 * upgrade the heading is honest text with no affordance and no folded rows,
 * and after it the fold is a real keyboard-operable control.
 */
const frames: HTMLIFrameElement[] = []
afterEach(() => {
  for (const f of frames.splice(0)) f.remove()
})

function doc(kit: boolean) {
  const stamp = kit ? '<meta name="steward-kit-version" content="1.0.0">' : ""
  return (
    `<html><head>${stamp}</head><body><table>` +
    "<tbody><tr><td>" +
    '<span data-kit-disclose="open" >Blocked · 1</span>' +
    "</td></tr></tbody>" +
    '<tbody data-fit-item data-kit-group-of="open"><tr><td>CORZA-1</td></tr></tbody>' +
    "<tbody><tr><td>" +
    '<span data-kit-disclose="shut" data-kit-disclose-init>To do · 2</span>' +
    "</td></tr></tbody>" +
    '<tbody data-fit-item data-kit-group-of="shut"><tr><td>CORZA-2</td></tr></tbody>' +
    '<tbody data-fit-item data-kit-group-of="shut"><tr><td>CORZA-3</td></tr></tbody>' +
    "</table></body></html>"
  )
}

async function mount(kit: boolean) {
  const iframe = document.createElement("iframe")
  iframe.style.cssText = "width:900px;height:600px;border:0"
  iframe.setAttribute("sandbox", "allow-scripts allow-same-origin")
  iframe.srcdoc = frameArtifactHtml(doc(kit), DEFAULT_THEME, "full")
  document.body.appendChild(iframe)
  frames.push(iframe)
  await new Promise((r) => {
    iframe.addEventListener("load", r, { once: true })
  })
  const d = iframe.contentDocument
  if (!d) throw new Error("no iframe document")
  await new Promise((r) => setTimeout(r, 80))
  const head = (id: string) => {
    const el = d.querySelector<HTMLElement>(`[data-kit-disclose="${id}"]`)
    if (!el) throw new Error(`no disclosure heading for ${id}`)
    return el
  }
  const rows = (id: string) => [
    ...d.querySelectorAll<HTMLElement>(`[data-kit-group-of="${id}"]`),
  ]
  return { d, head, rows }
}

const folded = (els: HTMLElement[]) =>
  els.every((e) => e.hasAttribute("data-kit-collapsed"))

describe("the injected group disclosure", () => {
  it("upgrades the heading to a real control", async () => {
    const { head } = await mount(true)
    expect(head("open").getAttribute("role")).toBe("button")
    expect(head("open").getAttribute("tabindex")).toBe("0")
    expect(head("open").getAttribute("aria-expanded")).toBe("true")
  })

  it("leaves the heading as plain text when nothing is listening", async () => {
    // The raw file's floor. A caret and a pointer cursor are both gated on the
    // live stamp, so an un-upgraded heading promises nothing it cannot do.
    const { head } = await mount(false)
    expect(head("open").getAttribute("role")).toBe(null)
    expect(head("open").hasAttribute("data-kit-disclose-live")).toBe(false)
  })

  it("ships every row visible, whatever the initial state asks for", async () => {
    // The load-bearing one. `collapsed` is applied by the upgrade, never by the
    // markup, so a reader with no scripts sees all the rows rather than a
    // count with the content hidden behind a control that never arrives.
    const { rows } = await mount(false)
    expect(folded(rows("shut"))).toBe(false)
    expect(rows("shut")).toHaveLength(2)
  })

  it("applies the initial collapsed state once it is live", async () => {
    const { head, rows } = await mount(true)
    expect(head("shut").getAttribute("aria-expanded")).toBe("false")
    expect(folded(rows("shut"))).toBe(true)
    // And only that group's rows — folding is per-group, and the rows of one
    // group are siblings of every other group's rather than nested in it.
    expect(folded(rows("open"))).toBe(false)
  })

  it("folds and unfolds on click", async () => {
    const { head, rows } = await mount(true)
    head("open").click()
    await new Promise((r) => setTimeout(r, 20))
    expect(folded(rows("open"))).toBe(true)
    expect(head("open").getAttribute("aria-expanded")).toBe("false")
    head("open").click()
    await new Promise((r) => setTimeout(r, 20))
    expect(folded(rows("open"))).toBe(false)
  })

  it("folds on Enter and Space", async () => {
    // A span with role=button gets no activation from the browser, so without
    // these handlers the control is mouse-only.
    const { d, head, rows } = await mount(true)
    const win = d.defaultView
    if (!win) throw new Error("no iframe window")
    for (const key of ["Enter", " "]) {
      const before = folded(rows("open"))
      head("open").dispatchEvent(
        new win.KeyboardEvent("keydown", { key, bubbles: true }),
      )
      await new Promise((r) => setTimeout(r, 20))
      expect(folded(rows("open"))).toBe(!before)
    }
  })

  it("never folds with `hidden`, which the fit pass owns", async () => {
    // Sharing the attribute would let a re-fit's `reset()` blow a folded group
    // open, or let a fold survive as a trim. Two owners, two attributes.
    const { rows } = await mount(true)
    expect(rows("shut").some((r) => r.hidden)).toBe(false)
  })
})
