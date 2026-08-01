import { describe, expect, it } from "vitest"

import { type ArtifactDoc, renderArtifact } from "../render.tsx"
import { validateDoc } from "../validate-doc.ts"
import type { ThroughputSpec } from "./Throughput.tsx"

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
