import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { type ArtifactDoc, renderArtifact } from "../render.tsx"
import { validateDoc } from "../validate-doc.ts"
import type { ThroughputSpec } from "./Throughput.tsx"

/** The built stylesheet, the way `retired.test.ts` reads it. */
const kitCss = readFileSync(
  new URL(
    "../../../../.claude/skills/widget-artifact/kit/kit.css",
    import.meta.url,
  ),
  "utf8",
)

const spec: ThroughputSpec = {
  windows: [1, 7, 30],
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
    ana: { name: "Ana Ruiz", url: "https://github.com/ana" },
    bo: { name: "Bo Chen" },
  },
}

const doc: ArtifactDoc = {
  slug: "repo-stats",
  generatedAt: "2026-03-03T08:00:00Z",
  stat: { value: 7, label: "merged" },
  blocks: [{ kind: "throughput", label: "PRs per person", spec }],
}

const html = renderArtifact(doc, ":root{--x:1}")

describe("the throughput band", () => {
  it("passes the input contract", () => {
    expect(validateDoc(doc)).toEqual([])
  })

  it("draws the columns server-side", () => {
    // The whole reason this band exists. The frozen template it replaced built
    // every column in script, so an artifact opened off the artifacts branch —
    // or read by anything that does not run JS — showed an empty plot beside a
    // scale. Two people, two columns, in the markup.
    const cols = html.match(/data-kit-throughput-col="/g) ?? []
    expect(cols).toHaveLength(2)
    expect(html).toContain('data-kit-throughput-col="ana"')
    expect(html).toContain('data-kit-throughput-col="bo"')
  })

  it("is on the tile, which is where the chart gets looked at", () => {
    // Shipped page-only for the whole migration and no test saw it: under the
    // tile stamp `page-only:flex` resolves to display:none, so the board went
    // from the frozen template's chart to a headline over an empty card. The
    // band is a glancer's band — a ranked row of columns reads at 594px — and
    // `pageOnly` stays there for a routine that disagrees.
    expect(html).not.toContain("page-only:flex")
    const asked = renderArtifact(
      { ...doc, blocks: [{ kind: "throughput", spec, pageOnly: true }] },
      "",
    )
    expect(asked).toContain("hidden page-only:flex")
  })

  it("draws the latest day, which is the day that answers the question", () => {
    expect(html).toContain("Mar 3")
    // Day 2 cumulative: ana 6 merged / 1 open, bo 0 merged / 3 open.
    expect(html).toContain("6 merged · 4 open")
  })

  it("ranks the tallest column first", () => {
    const order = [...html.matchAll(/data-kit-throughput-col="(\w+)"/g)].map(
      (m) => m[1],
    )
    expect(order).toEqual(["ana", "bo"])
  })

  it("sizes segments against a stable ceiling, not the day's own peak", () => {
    // Ceiling is the floor of 10 here, so ana's 6 merged is 60% — not 100%,
    // which is what a per-day scale would have drawn.
    expect(html).toContain('data-kit-throughput-axis="">10<')
    expect(html).toContain("height:60%")
  })

  it("ships every control hidden, so nothing looks live that is not", () => {
    // ADR-0039: a raw file has no behaviour attached, and a control that looks
    // live and does nothing is worse than no control.
    for (const attr of ["data-kit-toggle=", "data-kit-scrub="]) {
      const i = html.indexOf(attr)
      expect(i).toBeGreaterThan(-1)
      // `hidden` sits on the same element, just before the marker attribute.
      expect(html.slice(Math.max(0, i - 120), i)).toContain("hidden")
    }
  })

  it("leaves the active look to aria-pressed, not to the markup", () => {
    // The bug this pins: the toggle rebuilt the chart and the highlight stayed
    // put, which reads as a button that did nothing. The runtime moves
    // `aria-pressed` and nothing else, so if the markup decides who looks
    // active, the box can never follow. Both options must ship byte-identical
    // classes — then moving the attribute is what moves the box.
    const buttons = [
      ...html.matchAll(/<button[^>]*data-kit-toggle-option="(\w+)"[^>]*>/g),
    ].map((m) => ({
      value: m[1],
      pressed: /aria-pressed="true"/.test(m[0]),
      className: m[0].match(/class="([^"]*)"/)?.[1] ?? "",
    }))
    const view = buttons.filter((b) => ["owner", "reviewer"].includes(b.value))
    expect(view.map((b) => b.value)).toEqual(["owner", "reviewer"])
    expect(view.filter((b) => b.pressed).map((b) => b.value)).toEqual(["owner"])
    expect(new Set(view.map((b) => b.className)).size).toBe(1)
    // And the active look has to be reachable from the attribute at all.
    expect(view[0].className).toContain("aria-pressed:bg-bg3")
  })

  it("draws the scrubber's track and thumb from real slider pseudo-elements", () => {
    // Two bugs, one cause. `appearance-none` drops the platform widget and its
    // track with it, so this first shipped as a lone dot between two dates
    // with no axis under it. The fix — paint the input box itself, `h-1
    // bg-bg3` — gave it a bar and made the box 4px tall, a quarter of the
    // thumb the browser still draws: the dot overflowed onto the end labels
    // and covered the last date at the position the control rests in.
    //
    // A range input cannot say "24px box, 4px bar" in utilities, so the track
    // and the thumb are pseudo-element rules in `tiers.css`, unlayered so they
    // also reach artifacts published against the old markup (ADR-0050).
    const input = html.match(/<input[^>]*data-kit-scrub-input[^>]*>/)?.[0] ?? ""
    expect(input).toContain("data-kit-scrub-input")
    // No height on the element: that belongs to the box the rules size, and an
    // `h-1` here is exactly what put the thumb over the label.
    expect(input).not.toMatch(/class="[^"]*\bh-\d/)

    const css = kitCss.replace(/\s+/g, "")
    for (const sel of [
      "[data-kit-scrub-input]::-webkit-slider-runnable-track",
      "[data-kit-scrub-input]::-moz-range-track",
      "[data-kit-scrub-input]::-webkit-slider-thumb",
      "[data-kit-scrub-input]::-moz-range-thumb",
    ])
      expect(css, sel).toContain(sel)
  })

  it("keeps the scrubber's thumb inside the box it is centred in", () => {
    // The relationship *is* the bug: the thumb is centred on the input box, so
    // a box shorter than the thumb overflows onto whatever sits below it —
    // here, the dates that say what the ends of the track mean. Pinned as
    // numbers so a later tweak that grows the thumb has to notice.
    const box = kitCss.match(
      /\[data-kit-scrub-input\]\s*\{[^}]*height:\s*([\d.]+)rem/,
    )
    const thumb = kitCss.match(
      /::-webkit-slider-thumb\s*\{[^}]*height:\s*(\d+)px/,
    )
    expect(box, "the input box declares a height").toBeTruthy()
    expect(thumb, "the thumb declares a height").toBeTruthy()
    expect(Number(box?.[1]) * 16).toBeGreaterThanOrEqual(Number(thumb?.[1]))
  })

  it("offers one toggle per axis the spec actually has", () => {
    expect(html).toContain('data-kit-toggle="view"')
    expect(html).toContain('data-kit-toggle="mode"')
    expect(html).toContain('data-kit-toggle="window"')
  })

  it("omits the view toggle when there is only one view", () => {
    const single = renderArtifact(
      {
        ...doc,
        blocks: [
          { kind: "throughput", spec: { ...spec, views: [spec.views[0]] } },
        ],
      },
      "",
    )
    expect(single).not.toContain('data-kit-toggle="view"')
    // The mode toggle survives — it does not depend on having two views.
    expect(single).toContain('data-kit-toggle="mode"')
  })

  it("omits the window toggles entirely when no windows are offered", () => {
    const cumulative = renderArtifact(
      {
        ...doc,
        blocks: [
          {
            kind: "throughput",
            spec: { views: spec.views, people: spec.people },
          },
        ],
      },
      "",
    )
    expect(cumulative).not.toContain('data-kit-toggle="mode"')
    expect(cumulative).not.toContain('data-kit-toggle="window"')
  })

  it("carries the series for the runtime to scrub", () => {
    expect(html).toContain("data-kit-throughput-series")
    const json =
      html.match(/data-kit-throughput-series[^>]*>([\s\S]*?)<\/script>/)?.[1] ??
      ""
    expect(json).toBeTruthy()
    const parsed = JSON.parse(json)
    expect(parsed.views.map((v: { key: string }) => v.key)).toEqual([
      "owner",
      "reviewer",
    ])
  })

  it("sends a face the runtime cannot already see, and only that one", () => {
    // An inlined avatar is a few KB, and the payload used to ship a second
    // copy of every face already in the markup — 130 of 206 KB on the real
    // artifact. Drawn faces are read back off the plot; the payload carries
    // the people only the other views introduce.
    const drawn = "data:image/png;base64,AAAA"
    const undrawn = "data:image/png;base64,BBBB"
    const withFaces = renderArtifact(
      {
        ...doc,
        blocks: [
          {
            kind: "throughput",
            spec: {
              ...spec,
              views: [
                spec.views[0],
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
              people: {
                ana: { name: "Ana", avatar: drawn },
                cy: { name: "Cy", avatar: undrawn },
              },
            },
          },
        ],
      },
      "",
    )
    const payload = JSON.parse(
      withFaces.match(
        /data-kit-throughput-series[^>]*>([\s\S]*?)<\/script>/,
      )?.[1] ?? "",
    )
    expect(payload.people.ana.avatar).toBeUndefined()
    expect(payload.people.cy.avatar).toBe(undrawn)
    // Ana's face is in the document exactly once — as markup.
    expect(withFaces.split(drawn)).toHaveLength(2)
  })

  it("states its starting position so the runtime does not re-derive it", () => {
    // If the runtime guessed, its first frame could differ from the one on
    // screen and the chart would visibly jump the moment a frame loaded.
    expect(html).toContain('data-kit-throughput-mode="cumulative"')
    expect(html).toContain('data-kit-throughput-view="owner"')
  })

  it("names a person with no registry entry by their key", () => {
    // A missing registry entry costs a name, not a column.
    expect(html).toContain("Bo Chen")
    const bare = renderArtifact(
      { ...doc, blocks: [{ kind: "throughput", spec: { views: spec.views } }] },
      "",
    )
    expect(bare).toContain('data-kit-throughput-col="ana"')
  })

  it("drops a remote avatar rather than emitting a dead request", () => {
    // ADR-0044: the sandbox cannot reach an avatar host, and a scheduled run
    // is exactly where that bites.
    const remote = renderArtifact(
      {
        ...doc,
        blocks: [
          {
            kind: "throughput",
            spec: {
              ...spec,
              people: { ana: { name: "Ana", avatar: "https://x/a.png" } },
            },
          },
        ],
      },
      "",
    )
    expect(remote).not.toContain("https://x/a.png")
  })

  it("gives the axis gutter back when the axis is not in it", () => {
    // The plot was the one row of the band not starting on the artifact's own
    // left edge. Every other row — the date, the toggles, the legend, the
    // scrub, and the artifact's headline above them — begins at the tile
    // inset; the plot began 38px in, because the y-axis column was blanked
    // with `visibility` and kept its 32px box and its 6px gap standing empty.
    // Blank space reads as a misalignment, not as a reservation.
    //
    // `display` is what makes the gutter conditional rather than permanent, so
    // this pins the declaration, not just the selector.
    const rule = kitCss
      .replace(/\s+/g, "")
      .match(
        /\[data-kit-throughput\]:has\(\[data-kit-throughput-plot\]:not\(\.kit-throughput-nolabels\)\)\[data-kit-throughput-scale\]\{([^}]*)\}/,
      )
    expect(
      rule,
      "the axis is gated on the value labels being hidden",
    ).toBeTruthy()
    expect(rule?.[1]).toContain("display:none")
    expect(rule?.[1]).not.toContain("visibility")
  })

  it("gives the columns the transition its runtime has always measured for", () => {
    // `behaviour/throughput.ts` runs a full FLIP on every draw — record,
    // re-rank, invert, release — and released it against `transition-property:
    // all; transition-duration: 0s`, measured on a rendered artifact. Nothing
    // interpolated, so the ranking the scrubber exists to show you moving
    // snapped between frames and no one could be followed past whoever they
    // overtook. The rule is what makes that machinery do anything.
    //
    // On the attribute rather than a utility, so it reaches the repo-stats
    // artifacts already on the artifacts branch (ADR-0050): their columns carry
    // the seam, and the board injects this sheet over the one they inlined.
    const css = kitCss.replace(/\s+/g, "")
    const rule = css.match(/\[data-kit-throughput-col\]\{transition:([^}]*)\}/)
    expect(rule, "columns declare a transition").toBeTruthy()
    expect(rule?.[1]).toContain("transform")
    // Terminal manners: no motion outliving 200ms. Read in either unit — the
    // minifier rewrites `150ms` to `.15s`, so a test spelled in one of them
    // passes on the source and fails on the artifact.
    const [, n, unit] = rule?.[1].match(/([\d.]+)(ms|s)/) ?? []
    const ms = Number(n) * (unit === "s" ? 1000 : 1)
    expect(ms).toBeGreaterThan(0)
    expect(ms).toBeLessThanOrEqual(200)
    // And it is the kit's only motion, so it is also the kit's only chance to
    // get reduced motion wrong.
    expect(css).toContain(
      "@media(prefers-reduced-motion:reduce){[data-kit-throughput-col]{transition:none}",
    )
  })

  it("is not drawn at all when no view has anyone in it", () => {
    const empty = renderArtifact(
      {
        ...doc,
        blocks: [
          {
            kind: "throughput",
            label: "PRs per person",
            spec: {
              views: [
                {
                  key: "owner",
                  label: "by owner",
                  series: {
                    authors: [],
                    from: "2026-03-01",
                    n: 0,
                    changed: [],
                  },
                },
              ],
            },
          },
        ],
      },
      "",
    )
    expect(empty).not.toContain("data-kit-throughput-plot")
    expect(empty).not.toContain("PRs per person")
  })
})

describe("the throughput contract", () => {
  const bad = (spec: unknown) =>
    validateDoc({ ...doc, blocks: [{ kind: "throughput", spec }] })

  it("names the field when a delta row is short", () => {
    // The encoding bug that reads as a person whose work stopped: the missing
    // tail decodes to zeroes rather than failing.
    const problems = bad({
      views: [
        {
          key: "owner",
          label: "by owner",
          series: {
            authors: ["ana", "bo"],
            from: "2026-03-01",
            n: 2,
            changed: [[0, [[1, 1, 1]]]],
          },
        },
      ],
    })
    expect(problems.join("\n")).toContain(
      "changed[0][1] must hold one [open, merged, created] triple per author (2)",
    )
  })

  it("names the author when a triple is not three numbers", () => {
    // Quieter than the short row and harder to see: `decodeView` sums each
    // value straight into a running total, so `0 += "3"` concatenates and
    // every day after it inherits the string. A two-long triple loses
    // `created` to the same silent zero, one author narrower.
    for (const [label, triple] of [
      ["a string", ["3", 1, 0]],
      ["a short triple", [1, 1]],
      ["a non-finite number", [Number.NaN, 1, 0]],
      ["not an array at all", 3],
    ] as const) {
      const problems = bad({
        views: [
          {
            key: "owner",
            label: "by owner",
            series: {
              authors: ["ana", "bo"],
              from: "2026-03-01",
              n: 2,
              changed: [[0, [[1, 1, 1], triple]]],
            },
          },
        ],
      })
      expect(problems.join("\n"), label).toContain(
        "changed[0][1][1] must be [open, merged, created] as three finite numbers",
      )
    }
  })

  it("names one author per row, not every author on it", () => {
    // A mis-encoded row is usually mis-encoded all the way across, and twenty
    // copies of the same sentence buries the twenty-first problem.
    const problems = bad({
      views: [
        {
          key: "owner",
          label: "by owner",
          series: {
            authors: ["ana", "bo"],
            from: "2026-03-01",
            n: 2,
            changed: [
              [
                0,
                [
                  ["1", 1, 1],
                  ["2", 2, 2],
                ],
              ],
            ],
          },
        },
      ],
    })
    expect(problems.filter((p) => p.includes("three finite numbers"))).toEqual([
      "blocks[0].spec.views[0].series.changed[0][1][0] must be [open, merged, created] as three finite numbers",
    ])
  })

  it("names the field when a day sits past the end of the axis", () => {
    // The quiet twin of the short row: `decodeView` only reads `i < n`, so a
    // row dated off the top of the axis is dropped rather than misplaced, and
    // the person it belongs to just never appears.
    const problems = bad({
      views: [
        {
          key: "owner",
          label: "by owner",
          series: {
            authors: ["ana"],
            from: "2026-03-01",
            n: 2,
            changed: [[2, [[1, 1, 1]]]],
          },
        },
      ],
    })
    expect(problems.join("\n")).toContain(
      "changed[0][0] must be a day index within the axis (0 to 2 exclusive)",
    )
  })

  it("rejects an axis with no origin", () => {
    const problems = bad({
      views: [
        {
          key: "owner",
          label: "by owner",
          series: { authors: ["ana"], from: "March", n: 1, changed: [] },
        },
      ],
    })
    expect(problems.join("\n")).toContain("series.from must be an ISO date")
  })

  it("rejects a spec with no views", () => {
    expect(bad({ views: [] }).join("\n")).toContain(
      "views must be a non-empty array",
    )
  })

  it("rejects a window that is not a count of days", () => {
    const problems = bad({ windows: [0], views: spec.views })
    expect(problems.join("\n")).toContain("windows[0] must be a positive whole")
  })
})
