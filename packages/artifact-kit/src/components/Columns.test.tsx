import { describe, expect, it } from "vitest"

import { type ArtifactDoc, renderArtifact } from "../render.tsx"
import { validateDoc } from "../validate-doc.ts"
import type { ColumnsSpec } from "./Columns.tsx"

const spec: ColumnsSpec = {
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
  blocks: [{ kind: "columns", label: "PRs per person", spec }],
}

const html = renderArtifact(doc, ":root{--x:1}")

describe("the columns band", () => {
  it("passes the input contract", () => {
    expect(validateDoc(doc)).toEqual([])
  })

  it("draws the columns server-side", () => {
    // The whole reason this band exists. The frozen template it replaced built
    // every column in script, so an artifact opened off the artifacts branch —
    // or read by anything that does not run JS — showed an empty plot beside a
    // scale. Two people, two columns, in the markup.
    const cols = html.match(/data-kit-columns-col="/g) ?? []
    expect(cols).toHaveLength(2)
    expect(html).toContain('data-kit-columns-col="ana"')
    expect(html).toContain('data-kit-columns-col="bo"')
  })

  it("draws the latest day, which is the day that answers the question", () => {
    expect(html).toContain("Mar 3")
    // Day 2 cumulative: ana 6 merged / 1 open, bo 0 merged / 3 open.
    expect(html).toContain("6 merged · 4 open")
  })

  it("ranks the tallest column first", () => {
    const order = [...html.matchAll(/data-kit-columns-col="(\w+)"/g)].map(
      (m) => m[1],
    )
    expect(order).toEqual(["ana", "bo"])
  })

  it("sizes segments against a stable ceiling, not the day's own peak", () => {
    // Ceiling is the floor of 10 here, so ana's 6 merged is 60% — not 100%,
    // which is what a per-day scale would have drawn.
    expect(html).toContain('data-kit-columns-axis="">10<')
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
          { kind: "columns", spec: { ...spec, views: [spec.views[0]] } },
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
          { kind: "columns", spec: { views: spec.views, people: spec.people } },
        ],
      },
      "",
    )
    expect(cumulative).not.toContain('data-kit-toggle="mode"')
    expect(cumulative).not.toContain('data-kit-toggle="window"')
  })

  it("carries the series for the runtime to scrub", () => {
    expect(html).toContain("data-kit-columns-series")
    const json =
      html.match(/data-kit-columns-series[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? ""
    expect(json).toBeTruthy()
    const parsed = JSON.parse(json)
    expect(parsed.views.map((v: { key: string }) => v.key)).toEqual([
      "owner",
      "reviewer",
    ])
  })

  it("states its starting position so the runtime does not re-derive it", () => {
    // If the runtime guessed, its first frame could differ from the one on
    // screen and the chart would visibly jump the moment a frame loaded.
    expect(html).toContain('data-kit-columns-mode="cumulative"')
    expect(html).toContain('data-kit-columns-view="owner"')
  })

  it("names a person with no registry entry by their key", () => {
    // A missing registry entry costs a name, not a column.
    expect(html).toContain("Bo Chen")
    const bare = renderArtifact(
      { ...doc, blocks: [{ kind: "columns", spec: { views: spec.views } }] },
      "",
    )
    expect(bare).toContain('data-kit-columns-col="ana"')
  })

  it("drops a remote avatar rather than emitting a dead request", () => {
    // ADR-0044: the sandbox cannot reach an avatar host, and a scheduled run
    // is exactly where that bites.
    const remote = renderArtifact(
      {
        ...doc,
        blocks: [
          {
            kind: "columns",
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
            kind: "columns",
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
    expect(empty).not.toContain("data-kit-columns-plot")
    expect(empty).not.toContain("PRs per person")
  })
})

describe("the columns contract", () => {
  const bad = (spec: unknown) =>
    validateDoc({ ...doc, blocks: [{ kind: "columns", spec }] })

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
