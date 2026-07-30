import { afterEach, describe, expect, it } from "vitest"

import { DEFAULT_THEME, frameArtifactHtml } from "./theme.ts"

/**
 * The viewer regrouping runs against markup the board does not own, on a file
 * that is read by everyone the board is shared with. Getting it wrong shows
 * one person another person's queue and looks entirely fine doing it, which is
 * why it is exercised in a real browser rather than asserted on a string.
 */

const GROUPS = JSON.stringify({
  reviewer: "Needs your review",
  author: "Yours",
  rest: "Open",
})

function row(id: string, author: string, reviewers: string) {
  return (
    `<tbody data-fit-item data-author="${author}" data-reviewers="${reviewers}">` +
    `<tr><td>${id}</td></tr></tbody>`
  )
}

/** A kit-stamped ledger with three rows and one neutral heading. */
function artifact(): string {
  return (
    "<html><head>" +
    '<meta name="steward-kit-version" content="1.0.0">' +
    "</head><body>" +
    `<table data-fit-list data-kit-viewer-groups='${GROUPS}'>` +
    `<tbody><tr><td colspan="1" class="head">All · 3</td></tr></tbody>` +
    row("pr-a", "ada", "brun cai") +
    row("pr-b", "brun", "ada") +
    row("pr-c", "cai", "") +
    "</table></body></html>"
  )
}

const frames: HTMLIFrameElement[] = []
afterEach(() => {
  for (const f of frames.splice(0)) f.remove()
})

async function mount(viewer?: { login: string }) {
  const iframe = document.createElement("iframe")
  iframe.style.cssText = "width:900px;height:600px;border:0"
  iframe.setAttribute("sandbox", "allow-scripts allow-same-origin")
  iframe.srcdoc = frameArtifactHtml(
    artifact(),
    DEFAULT_THEME,
    "full",
    "",
    viewer ? { login: viewer.login, name: viewer.login } : undefined,
  )
  document.body.appendChild(iframe)
  frames.push(iframe)
  await new Promise((r) => {
    iframe.addEventListener("load", r, { once: true })
  })
  const doc = iframe.contentDocument
  if (!doc) throw new Error("no iframe document")
  await new Promise((r) => setTimeout(r, 120))
  return doc
}

/** Heading labels in document order. */
const heads = (doc: Document) =>
  [...doc.querySelectorAll("tbody:not([data-fit-item]) td")].map((td) =>
    (td.textContent ?? "").trim(),
  )

/** Row ids in document order. */
const order = (doc: Document) =>
  [...doc.querySelectorAll("tbody[data-fit-item] td")].map((td) =>
    (td.textContent ?? "").trim(),
  )

describe("the viewer regrouping", () => {
  it("leaves the published render alone when nobody is signed in", async () => {
    // The raw file and a signed-out reader get the neutral render, which is
    // the specified floor rather than a degradation.
    const doc = await mount()
    expect(heads(doc)).toEqual(["All · 3"])
    expect(order(doc)).toEqual(["pr-a", "pr-b", "pr-c"])
  })

  it("leaves it alone for a viewer with no rows here", async () => {
    // Rebuilding into the same thing under different headings would tell a
    // reader they have work when they have none.
    const doc = await mount({ login: "devi" })
    expect(heads(doc)).toEqual(["All · 3"])
  })

  it("leads with what is waiting on the viewer", async () => {
    // ada authors pr-a and is asked on pr-b. Asked outranks authored: "waiting
    // on you" is the actionable one.
    const doc = await mount({ login: "ada" })
    expect(heads(doc)).toEqual([
      "Needs your review · 1",
      "Yours · 1",
      "Open · 1",
    ])
    expect(order(doc)).toEqual(["pr-b", "pr-a", "pr-c"])
  })

  it("puts a row in exactly one bucket", async () => {
    const doc = await mount({ login: "brun" })
    expect(order(doc)).toHaveLength(3)
    expect(new Set(order(doc)).size).toBe(3)
    // brun is asked on pr-a and authors pr-b.
    expect(heads(doc)).toEqual([
      "Needs your review · 1",
      "Yours · 1",
      "Open · 1",
    ])
  })

  it("omits a bucket nobody is in", async () => {
    // cai authors pr-c and is asked on pr-a — nothing is left over.
    const doc = await mount({ login: "cai" })
    expect(heads(doc)).toEqual([
      "Needs your review · 1",
      "Yours · 1",
      "Open · 1",
    ])
  })

  it("regroups a table that already has state groups", async () => {
    // The published render groups by state, so the regrouping has to replace
    // several headings rather than one. Verifying rather than assuming: review
    // flagged this as unsupported.
    const iframe = document.createElement("iframe")
    iframe.style.cssText = "width:900px;height:600px;border:0"
    iframe.setAttribute("sandbox", "allow-scripts allow-same-origin")
    iframe.srcdoc = frameArtifactHtml(
      "<html><head>" +
        '<meta name="steward-kit-version" content="1.0.0">' +
        "</head><body>" +
        `<table data-fit-list data-kit-viewer-groups='${GROUPS}'>` +
        `<tbody><tr><td colspan="1" class="head">Blocked · 1</td></tr></tbody>` +
        row("pr-a", "ada", "brun") +
        `<tbody><tr><td colspan="1" class="head">In review · 1</td></tr></tbody>` +
        row("pr-b", "brun", "ada") +
        `<tbody><tr><td colspan="1" class="head">Open · 1</td></tr></tbody>` +
        row("pr-c", "cai", "") +
        "</table></body></html>",
      DEFAULT_THEME,
      "full",
      "",
      { login: "ada" },
    )
    document.body.appendChild(iframe)
    frames.push(iframe)
    await new Promise((r) => {
      iframe.addEventListener("load", r, { once: true })
    })
    const doc = iframe.contentDocument
    if (!doc) throw new Error("no iframe document")
    await new Promise((r) => setTimeout(r, 120))

    // All three state headings replaced by the three viewer buckets, and every
    // row still present exactly once.
    expect(heads(doc)).toEqual([
      "Needs your review · 1",
      "Yours · 1",
      "Open · 1",
    ])
    expect(order(doc)).toEqual(["pr-b", "pr-a", "pr-c"])
  })

  it("ships no regrouping behaviour without a viewer", () => {
    // The bucket labels DO travel in the published file, as an inert attribute
    // — they are the routine's vocabulary, and the board should not hold one
    // widget's wording. What must not travel is the behaviour that resolves
    // "you", so the file renders its neutral headings and nothing rewrites
    // them. Gated on the viewer, not merely on the kit stamp.
    const neutral = frameArtifactHtml(artifact(), DEFAULT_THEME, "full")
    expect(neutral).not.toContain("data-steward-bucket")

    const faceted = frameArtifactHtml(artifact(), DEFAULT_THEME, "full", "", {
      login: "ada",
    })
    expect(faceted).toContain("data-steward-bucket")
  })
})
