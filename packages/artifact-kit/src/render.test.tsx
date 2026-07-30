import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { escapeContextBlock, footerTimestamp } from "./Shell.tsx"
import { type ArtifactDoc, renderArtifact } from "./render.tsx"

const fixture: ArtifactDoc = JSON.parse(
  readFileSync(
    new URL("../fixtures/ticket-gaps.json", import.meta.url),
    "utf8",
  ),
)
const html = renderArtifact(fixture, ":root{--x:1}")

describe("renderArtifact", () => {
  it("emits a complete document", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true)
    expect(html).toContain("</html>")
  })

  it("carries the generation stamp and the kit version", () => {
    // Freshness on the board is keyed to the publish commit, but the meta is
    // what a raw file and the version dialogs read.
    expect(html).toContain(
      `<meta name="widget-generated-at" content="${fixture.generatedAt}"/>`,
    )
    expect(html).toMatch(
      /<meta name="steward-kit-version" content="\d+\.\d+\.\d+"\/>/,
    )
  })

  it("makes no external request of any kind", () => {
    // Hard requirement 1. The sandbox has no network, so anything external
    // does not degrade — it just never arrives.
    //
    // A link is not a request: ADR-0028 *requires* anchors to point out of the
    // frame, and the briefing is inert text. Both are stripped before the scan
    // so this checks what it means to — subresources the document would fetch.
    const body = html
      .replace(/<script type="text\/markdown"[\s\S]*?<\/script>/, "")
      .replace(/<a\s[^>]*>/g, "")
    expect(body).not.toMatch(/https?:\/\//)
    expect(body).not.toMatch(/\bsrc=["']\/\//)
    expect(body).not.toMatch(/@import\b/)
    expect(body).not.toMatch(/\burl\(\s*["']?https?:/)
  })

  it("targets every link out of the frame", () => {
    // In-frame navigation is sandbox-blocked (ADR-0028), so an untargeted
    // anchor is not a slow link, it is a dead one.
    const tags = [...html.matchAll(/(<a\s[^>]*>)/g)]
    // Without this the loop below is vacuous — it passed for a fixture that
    // produced no anchors at all.
    expect(tags.length).toBeGreaterThan(0)
    for (const [, tag] of tags) {
      expect(tag, tag).toContain('target="_blank"')
      expect(tag, tag).toContain('rel="noopener"')
    }
  })

  it("gives the sections a root heading", () => {
    expect(html).toMatch(/<h1 class="sr-only">/)
  })

  it("renders the standalone footer with slug and compact stamp", () => {
    expect(html).toContain(fixture.slug)
    expect(html).toContain(footerTimestamp(fixture.generatedAt))
  })

  it("degrades to a designed empty state rather than a blank tile", () => {
    const empty = renderArtifact(
      {
        ...fixture,
        blocks: [],
        empty: { headline: "No gaps — the code matches the spec" },
      },
      "",
    )
    expect(empty).toContain("No gaps — the code matches the spec")
  })
})

describe("QueueTable columns", () => {
  it("gives every row a cell for every column, in table order", () => {
    // Columns used to come from row 0, so a row missing a value slid its
    // remaining cells left under the wrong headers, and a row without an
    // action skipped a cell the header had reserved.
    const doc: ArtifactDoc = {
      slug: "s",
      generatedAt: "2026-07-30T09:00:00Z",
      stat: { value: 1, label: "x" },
      blocks: [
        {
          kind: "queue",
          showHeader: true,
          rows: [
            {
              id: "a",
              title: "first",
              values: [
                { label: "one", value: "1" },
                { label: "two", value: "2" },
              ],
              action: { payload: "p" },
            },
            // Fewer values, different label, and no action.
            {
              id: "b",
              title: "second",
              values: [{ label: "two", value: "B" }],
            },
          ],
        },
      ],
    }
    const out = renderArtifact(doc, "")
    const bodies = [...out.matchAll(/<tbody[^>]*>([\s\S]*?)<\/tbody>/g)]
    expect(bodies).toHaveLength(2)
    // Same physical cell count in both rows: state + title + 2 values + action.
    const cells = (b: string) => (b.match(/<td/g) ?? []).length
    expect(cells(bodies[0][1])).toBe(cells(bodies[1][1]))
    // The row missing "one" still occupies that column, empty.
    expect(bodies[1][1]).toContain("B")
  })
})

describe("Meter columns", () => {
  const doc = (values: number[]): ArtifactDoc => ({
    slug: "s",
    generatedAt: "2026-07-30T09:00:00Z",
    stat: { value: 1, label: "x" },
    blocks: [
      {
        kind: "queue",
        rows: values.map((n, i) => ({
          id: `r${i}`,
          title: `row ${i}`,
          values: [{ label: "drift", value: String(n), meter: n }],
        })),
      },
    ],
  })
  const widths = (html: string) =>
    [...html.matchAll(/style="width:([\d.]+)%"/g)].map((m) => Number(m[1]))

  it("scales every bar against the column max, not its own row", () => {
    // The failure this prevents: per-row normalisation renders every bar full,
    // so the column compares nothing and the reader has to fall back to the
    // numbers the bar exists to replace.
    expect(widths(renderArtifact(doc([10, 5, 1]), ""))).toEqual([100, 50, 10])
  })

  it("keeps one scale across rows the fit pass may later hide", () => {
    // The max is a property of the table, so a trimmed tile does not silently
    // rescale the bars that survive.
    const html = renderArtifact(doc([8, 4]), "")
    expect(widths(html)).toEqual([100, 50])
  })

  it("renders an empty bar rather than dividing by zero", () => {
    // A section where nothing happened is a real state: every bar empty, the
    // counts still readable.
    expect(widths(renderArtifact(doc([0, 0]), ""))).toEqual([0, 0])
  })

  it("prints the count beside the bar", () => {
    expect(renderArtifact(doc([7]), "")).toContain(">7<")
  })

  it("paints the bar with the tone and leaves the count in ink", () => {
    // Tinting both spends one signal twice. The cell keeps the neutral text
    // class; only the fill takes the tone.
    const toned: ArtifactDoc = {
      ...doc([3]),
      blocks: [
        {
          kind: "queue",
          rows: [
            {
              id: "a",
              title: "a",
              values: [{ label: "drift", value: "3", meter: 3, tone: "attn" }],
            },
          ],
        },
      ],
    }
    const html = renderArtifact(toned, "")
    expect(html).toContain("bg-orange")
    expect(html).not.toContain("text-orange")
  })
})

describe("the page-tier rail", () => {
  const base = {
    slug: "s",
    generatedAt: "2026-07-30T09:00:00Z",
    stat: { value: 1, label: "x" },
  }
  const row = { id: "a", title: "a" }

  it("emits no grid classes when nothing asks for the rail", () => {
    // This is the markup gate, and it is the whole reason the rail is opt-in.
    // kit.css is injected over artifacts published months earlier, so a
    // restructure that reached them through the stylesheet would relayout
    // them with no commit in the data repo to explain it. Layout changes
    // travel through markup; only fixes travel through CSS.
    const html = renderArtifact(
      { ...base, blocks: [{ kind: "queue", rows: [row] }] },
      "",
    )
    expect(html).not.toContain("tier-page:grid")
  })

  it("carries the live corpus unchanged", () => {
    // The two artifacts already published against this kit.
    expect(renderArtifact(fixture, "")).not.toContain("tier-page:grid")
  })

  it("splits main from rail once a band asks", () => {
    const html = renderArtifact(
      {
        ...base,
        blocks: [
          { kind: "queue", label: "Ledger", rows: [row] },
          { kind: "queue", label: "Aside", rail: true, rows: [row] },
        ],
      },
      "",
    )
    expect(html).toContain("tier-page:grid")
    // Reading order below the page tier: main first, rail after.
    expect(html.indexOf("Ledger")).toBeLessThan(html.indexOf("Aside"))
  })
})

describe("a band's note", () => {
  const doc: ArtifactDoc = {
    slug: "s",
    generatedAt: "2026-07-30T09:00:00Z",
    stat: { value: 1, label: "x" },
    blocks: [
      {
        kind: "queue",
        label: "Ahead of a new request",
        note: "plus 15 in own backlog · 42h",
        rows: [{ id: "a", title: "High" }],
      },
    ],
  }

  it("renders under the band", () => {
    expect(renderArtifact(doc, "")).toContain("plus 15 in own backlog · 42h")
  })

  it("owns a fit section so trimming it cannot collapse the ledger", () => {
    // owner() walks up to the nearest [data-fit-section]. Without one of its
    // own, the note's list would resolve to the band above and hiding one
    // quiet line would take the whole ledger with it.
    const html = renderArtifact(doc, "")
    const note = html.slice(
      html.indexOf("plus 15") - 300,
      html.indexOf("plus 15"),
    )
    expect(note).toContain("data-fit-section")
    expect(note).toContain("data-fit-list")
  })
})

describe("prose bands", () => {
  it("renders page-only, out of the fit pass's reach", () => {
    // The fit pass runs only on a tile. Paragraphs are not trimmable units,
    // and a dive cut to "+1 more" is a truncated argument.
    const html = renderArtifact(
      {
        slug: "s",
        generatedAt: "2026-07-30T09:00:00Z",
        stat: { value: 1, label: "x" },
        blocks: [
          {
            kind: "prose",
            label: "Dives",
            items: [{ id: "d1", title: "Hydrogen", body: "One.\n\nTwo." }],
          },
        ],
      },
      "",
    )
    expect(html).toContain("page-only:flex")
    expect(html).toContain("Hydrogen")
    // Blank lines become separate paragraphs rather than one run-on block.
    expect(html).toContain("<p")
    expect((html.match(/<p class/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })

  it("draws nothing for a band with no items", () => {
    const html = renderArtifact(
      {
        slug: "s",
        generatedAt: "2026-07-30T09:00:00Z",
        stat: { value: 1, label: "x" },
        blocks: [{ kind: "prose", label: "Dives", items: [] }],
        empty: { headline: "Nothing yet" },
      },
      "",
    )
    expect(html).not.toContain("Dives")
    expect(html).toContain("Nothing yet")
  })
})

describe("the context block", () => {
  it("is carried inert, so it costs no layout and no request", () => {
    expect(html).toContain('<script type="text/markdown" id="steward-context">')
  })

  it("escapes a literal </script> so the briefing cannot truncate", () => {
    // Only that exact string ends the element. Unescaped, a briefing quoting
    // markup silently loses everything after it — in a file nobody re-reads.
    const out = escapeContextBlock("before </script> after")
    expect(out).not.toContain("</script")
    expect(out).toContain("<\\/script")
  })

  it("survives the escape with its content otherwise intact", () => {
    expect(escapeContextBlock("## Ask me about\n- why")).toBe(
      "## Ask me about\n- why",
    )
  })
})

describe("footerTimestamp", () => {
  it("compacts ISO-8601 to the standard's YYYY-MM-DD HH:MMZ", () => {
    expect(footerTimestamp("2026-07-30T09:00:00Z")).toBe("2026-07-30 09:00Z")
  })
})
