import { afterEach, describe, expect, it } from "vitest"

import { renderArtifact } from "../../../../packages/artifact-kit/src/render.tsx"
import type { ThroughputSpec } from "../../../../packages/artifact-kit/src/components/Throughput.tsx"
import {
  ARTIFACT_THROUGHPUT_SCRIPT,
  ARTIFACT_KIT_STYLE,
} from "./artifact-kit.ts"
import { DEFAULT_THEME, frameArtifactHtml } from "./theme.ts"

/**
 * The `throughput` band, framed the way the board frames it, in a real browser.
 *
 * This is the band that arrived as ~460 lines of script frozen inside a
 * routine's `template.html`, published by that routine's own script, never once
 * executed by a test. The migration is only worth something if the replacement
 * is actually exercised — and the parts that matter here cannot be asserted on
 * a string: the runtime *clones the server's own column* to build a view the
 * server did not draw, so what it produces is a function of markup `Throughput.tsx`
 * emits rather than of anything this file could hand-write.
 *
 * Which is why the fixture is rendered by the real renderer rather than typed
 * out. A hand-written stand-in would be a second, drifting definition of what a
 * column is, and the drift would land in the one code path no other test covers.
 * The runtime side is the *built* `throughput.js` the board actually injects, so a
 * behaviour change that was never rebuilt fails here.
 */
/** Two distinct 1×1 GIFs. Real `data:` URIs, so the browser actually loads them. */
const FACE_A =
  "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="
const FACE_B =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"

const spec = {
  windows: [1, 7],
  views: [
    {
      key: "owner",
      label: "by owner",
      series: {
        authors: ["ana", "bo"],
        from: "2026-03-01",
        n: 3,
        changed: [
          [
            1,
            [
              [1, 4, 5],
              [0, 0, 0],
            ],
          ],
          [
            2,
            [
              [0, 2, 2],
              [3, 0, 3],
            ],
          ],
        ],
      },
    },
    {
      key: "reviewer",
      label: "by reviewer",
      series: {
        authors: ["bo"],
        from: "2026-03-01",
        n: 3,
        changed: [[2, [[0, 1, 1]]]],
      },
    },
  ],
  people: {
    ana: { name: "Ana Ruiz", avatar: FACE_A },
    bo: { name: "Bo Chen", avatar: FACE_B },
  },
} satisfies ThroughputSpec

function artifact(): string {
  return renderArtifact(
    {
      slug: "repo-stats",
      generatedAt: "2026-03-03T08:00:00Z",
      stat: { value: 6, label: "merged" },
      blocks: [
        {
          kind: "throughput",
          label: "PRs per person",
          spec: structuredClone(spec),
        },
      ],
    },
    "",
  )
}

const frames: HTMLIFrameElement[] = []
afterEach(() => {
  for (const f of frames.splice(0)) f.remove()
})

/** Frame and mount, optionally without the kit stamp the injection gates on. */
async function mount(html = artifact()) {
  const iframe = document.createElement("iframe")
  iframe.style.cssText = "width:640px;height:480px;border:0"
  iframe.setAttribute("sandbox", "allow-scripts allow-same-origin")
  iframe.srcdoc = frameArtifactHtml(
    html,
    DEFAULT_THEME,
    "full",
    "",
    undefined,
    ARTIFACT_KIT_STYLE,
    ARTIFACT_THROUGHPUT_SCRIPT,
  )
  document.body.appendChild(iframe)
  frames.push(iframe)
  await new Promise((r) => {
    iframe.addEventListener("load", r, { once: true })
  })
  const d = iframe.contentDocument
  if (!d) throw new Error("no iframe document")
  await new Promise((r) => setTimeout(r, 120))
  return d
}

const text = (d: Document, sel: string) =>
  (d.querySelector(sel)?.textContent ?? "").trim()

const columnKeys = (d: Document) =>
  [...d.querySelectorAll<HTMLElement>("[data-kit-throughput-col]")].map(
    (el) => el.dataset.kitThroughputCol,
  )

/** Click a toggle option the way a reader would. */
function press(d: Document, group: string, value: string) {
  const button = d.querySelector<HTMLElement>(
    `[data-kit-toggle="${group}"] [data-kit-toggle-option="${value}"]`,
  )
  if (!button) throw new Error(`no ${group} option ${value}`)
  button.click()
}

/** Move the scrubber, in the iframe's own realm so the event is its own. */
function scrubTo(d: Document, index: number) {
  const slider = d.querySelector<HTMLInputElement>("[data-kit-scrub-input]")
  if (!slider) throw new Error("no scrubber")
  slider.value = String(index)
  const win = d.defaultView
  if (!win) throw new Error("no window")
  slider.dispatchEvent(new win.Event("input", { bubbles: true }))
}

describe("the injected throughput runtime", () => {
  it("reveals the controls, which ship hidden", async () => {
    // ADR-0039: a raw-opened artifact keeps a real chart of a real day, and
    // gets no controls — a scrubber that looks live and does nothing is worse
    // than a chart that only shows the day it was published.
    const d = await mount()
    const view = d.querySelector<HTMLElement>('[data-kit-toggle="view"]')
    const scrub = d.querySelector<HTMLElement>("[data-kit-scrub]")
    expect(view?.hidden).toBe(false)
    expect(scrub?.hidden).toBe(false)
  })

  it("leaves them hidden when nothing is listening", async () => {
    // The same document without the kit stamp: `frameArtifactHtml` injects
    // nothing, so this is what an artifact opened off the artifacts branch is.
    const bare = artifact().replace(
      /<meta name="steward-kit-version"[^>]*>/,
      "",
    )
    const d = await mount(bare)
    expect(
      d.querySelector<HTMLElement>('[data-kit-toggle="view"]')?.hidden,
    ).toBe(true)
    // …and the chart is still a chart. This is the bug the migration fixed:
    // the frozen template emptied the plot and rebuilt it in script.
    expect(columnKeys(d)).toEqual(["ana", "bo"])
  })

  it("draws the day the server drew, so nothing jumps on attach", async () => {
    const d = await mount()
    expect(text(d, "[data-kit-throughput-date]")).toBe("Mar 3")
    expect(text(d, "[data-kit-throughput-total]")).toBe("6 merged · 4 open")
  })

  it("scrubs back to a day the server never rendered", async () => {
    const d = await mount()
    scrubTo(d, 0)
    expect(text(d, "[data-kit-throughput-date]")).toBe("Mar 1")
    expect(text(d, "[data-kit-throughput-total]")).toBe("0 merged · 0 open")
    // Day 0 is a tie at zero, and the order still holds — the ranking breaks
    // ties on the final standing so early days do not shuffle for no reason.
    expect(columnKeys(d)).toEqual(["ana", "bo"])
  })

  it("rebuilds the plot for a view with different people in it", async () => {
    // The clone path: `reviewer` has one person, and the runtime has to make a
    // column for them out of markup the server only ever wrote for `owner`.
    const d = await mount()
    press(d, "view", "reviewer")
    await new Promise((r) => setTimeout(r, 30))
    expect(columnKeys(d)).toEqual(["bo"])
    const col = d.querySelector<HTMLElement>('[data-kit-throughput-col="bo"]')
    expect(col?.title).toContain("Bo Chen")
    // A cloned column carries the server's face markup, not a second copy of
    // `Avatar` written here — the name reaches a screen reader either way.
    expect(col?.querySelector(".sr-only")?.textContent).toBe("Bo Chen")
    expect(text(d, "[data-kit-throughput-total]")).toBe("1 merged · 0 open")
  })

  it("moves the pressed box onto the option that was clicked", async () => {
    // The chart rebuilt and the highlight stayed on "by owner", so the button
    // read as dead while it was in fact working. Nothing here asserted the
    // control's own appearance, only the plot it drives — and the appearance is
    // the half a reader sees. `aria-pressed` is the single record of which view
    // is current, and the stylesheet paints from it, so this is both the state
    // a screen reader is told and the state the box is drawn from.
    const d = await mount()
    const option = (v: string) =>
      d.querySelector<HTMLElement>(
        `[data-kit-toggle="view"] [data-kit-toggle-option="${v}"]`,
      )
    const painted = (v: string) => {
      const el = option(v)
      if (!el) throw new Error(`no option ${v}`)
      const win = d.defaultView
      if (!win) throw new Error("no window")
      return win.getComputedStyle(el).backgroundColor
    }
    const before = { owner: painted("owner"), reviewer: painted("reviewer") }
    expect(option("owner")?.getAttribute("aria-pressed")).toBe("true")
    expect(before.owner).not.toBe(before.reviewer)

    press(d, "view", "reviewer")
    await new Promise((r) => setTimeout(r, 30))

    expect(option("reviewer")?.getAttribute("aria-pressed")).toBe("true")
    expect(option("owner")?.getAttribute("aria-pressed")).toBe("false")
    // The fill swapped places rather than staying where the server put it.
    expect(painted("reviewer")).toBe(before.owner)
    expect(painted("owner")).toBe(before.reviewer)
  })

  it("keeps a face whose bytes the payload deliberately does not carry", async () => {
    // The renderer omits an avatar it has already drawn, because a data URI in
    // the markup and the same URI in the payload is the same face twice — 130
    // of 206 KB on the real artifact. So the runtime has to read Bo's face off
    // the plot it was handed, and still have it when the column is rebuilt for
    // a view Bo appears in under different markup.
    const html = artifact()
    const payload = JSON.parse(
      html.match(/data-kit-throughput-series[^>]*>([\s\S]*?)<\/script>/)?.[1] ??
        "",
    )
    expect(payload.people.bo.avatar).toBeUndefined()

    const d = await mount(html)
    press(d, "view", "reviewer")
    await new Promise((r) => setTimeout(r, 30))
    const img = d.querySelector<HTMLImageElement>(
      '[data-kit-throughput-col="bo"] img',
    )
    expect(img?.getAttribute("src")).toBe(FACE_B)
  })

  it("still takes a face for someone the first view never showed", async () => {
    // The other half of the same rule: Cy is only ever in `reviewer`, so their
    // face is nowhere in the markup and the payload is the only place it can
    // come from.
    const withCy = {
      windows: spec.windows,
      views: [
        structuredClone(spec.views[0]),
        {
          key: "reviewer",
          label: "by reviewer",
          series: {
            authors: ["cy"],
            from: "2026-03-01",
            n: 3,
            changed: [[2, [[0, 1, 1]]]],
          },
        },
      ],
      people: { ...spec.people, cy: { name: "Cy Okafor", avatar: FACE_A } },
    } satisfies ThroughputSpec
    const d = await mount(
      renderArtifact(
        {
          slug: "repo-stats",
          generatedAt: "2026-03-03T08:00:00Z",
          stat: { value: 6, label: "merged" },
          blocks: [{ kind: "throughput", spec: withCy }],
        },
        "",
      ),
    )
    press(d, "view", "reviewer")
    await new Promise((r) => setTimeout(r, 30))
    expect(columnKeys(d)).toEqual(["cy"])
    expect(
      d
        .querySelector<HTMLImageElement>('[data-kit-throughput-col="cy"] img')
        ?.getAttribute("src"),
    ).toBe(FACE_A)
  })

  it("switches to the trailing window, and says which one", async () => {
    const d = await mount()
    press(d, "mode", "window")
    await new Promise((r) => setTimeout(r, 30))
    // One day back from Mar 3: ana merged 2 and opened 2, bo opened 3.
    expect(text(d, "[data-kit-throughput-total]")).toBe(
      "2 merged · 5 opened · last day",
    )
    // "open" is a level that falls as PRs merge; over a window the honest word
    // is what happened, not what stands.
    expect(text(d, "[data-kit-throughput-legend-open]")).toBe("opened")
  })

  it("shows the window picker only where it means something", async () => {
    const d = await mount()
    const picker = d.querySelector<HTMLElement>('[data-kit-toggle="window"]')
    expect(picker?.hidden).toBe(true)
    press(d, "mode", "window")
    await new Promise((r) => setTimeout(r, 30))
    expect(picker?.hidden).toBe(false)
  })

  it("keeps the published frame standing when the payload is unreadable", async () => {
    // A truncated or hand-edited payload costs the scrubbing, not the chart.
    const broken = artifact().replace(
      /(data-kit-throughput-series="">)[\s\S]*?(<\/script>)/,
      "$1{oh no$2",
    )
    const d = await mount(broken)
    expect(columnKeys(d)).toEqual(["ana", "bo"])
    expect(text(d, "[data-kit-throughput-total]")).toBe("6 merged · 4 open")
    // Nothing was attached, so the controls stay honest about it.
    expect(
      d.querySelector<HTMLElement>('[data-kit-toggle="view"]')?.hidden,
    ).toBe(true)
  })
})
