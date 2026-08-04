import { readdirSync, readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { escapeContextBlock, footerTimestamp } from "./Shell.tsx"
import { type ArtifactDoc, type Block, renderArtifact } from "./render.tsx"
import type { BottomLine } from "./components/BottomLine.tsx"
import type { QueueRow } from "./components/QueueTable.tsx"
import type { SeriesSpec } from "./components/Series.tsx"
import type { Verdict } from "./components/VerdictBand.tsx"
import { reviewDoc, validateDoc } from "./validate-doc.ts"

const fixture: ArtifactDoc = JSON.parse(
  readFileSync(new URL("../fixtures/ledger.json", import.meta.url), "utf8"),
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

  it("centres every drawn glyph on the type beside it", () => {
    // A baseline-aligned box of side S has its centre at S/2 above the
    // baseline, while the cap band it sits beside centres near 0.35em — so a
    // glyph dropped into a line with no correction ALWAYS reads high, by more
    // the larger it is. The kit allows exactly two corrections, and this pins
    // that every glyph carries one of them:
    //
    //   1. `align-[…]` — inline flow, the shift that `INLINE_GLYPH` and the
    //      hero word encode. The arithmetic is in `ui/icon.tsx`.
    //   2. an `items-center` parent — flex or grid centring the box outright,
    //      which is how QueueTable's cell icon (content, not punctuation)
    //      stays level with its value.
    //
    // Anything else is the line box's default, and the default is wrong: it is
    // what put the verdict caveat's clock 0.183em above its own sentence.
    //
    // Swept across every fixture, because the one the suite renders at the top
    // of this file draws no icons at all — pinning this on `html` alone would
    // pass vacuously.
    const dir = new URL("../fixtures/", import.meta.url)
    const seen: string[] = []
    for (const name of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      const doc = JSON.parse(readFileSync(new URL(name, dir), "utf8"))
      const out = renderArtifact(doc, "")
      // The `Icon` signature: lucide's 24-unit box. Sparklines, meters and the
      // throughput chart draw their own SVGs and are sized, not set into text.
      for (const m of out.matchAll(/<svg viewBox="0 0 24 24"[^>]*>/g)) {
        seen.push(`${name} ${m[0]}`)
        if (/class="[^"]*align-\[/.test(m[0])) continue
        // Otherwise the parent must centre the box. The nearest class
        // attribute before the glyph is the tag that opened around it.
        const before = out.slice(Math.max(0, m.index - 240), m.index)
        const parent = /class="([^"]*)"[^<]*$/.exec(before)?.[1] ?? ""
        expect(parent, `${name}: ${m[0]}`).toContain("items-center")
      }
    }
    // Without this the loop is vacuous if the icon markup ever changes shape.
    expect(seen.length).toBeGreaterThan(20)
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
    // Same physical cell count in both rows: title + 2 values + action.
    const cells = (b: string) => (b.match(/<td/g) ?? []).length
    expect(cells(bodies[0][1])).toBe(cells(bodies[1][1]))
    // The row missing "one" still occupies that column, empty.
    expect(bodies[1][1]).toContain("B")
  })

  it("shows a glyph's word from its own column's tier, floored at detail", () => {
    // The word used to be a constant `tier-page`, whatever tier the column
    // itself appeared at. A 2-column tile on a wide board sits around 890px —
    // past `detail` (701px), short of `page` (900px) — so the state column
    // rendered a bare clock beside ~575px of empty title column, and the only
    // reader served the word was the screen reader.
    const doc: ArtifactDoc = {
      slug: "s",
      generatedAt: "2026-07-30T09:00:00Z",
      stat: { value: 1, label: "x" },
      blocks: [
        {
          kind: "queue",
          rows: [
            {
              id: "a",
              title: "first",
              values: [
                { label: "review", value: "review required", icon: "clock" },
                {
                  label: "size",
                  value: "approved",
                  icon: "check",
                  from: "page",
                },
              ],
            },
          ],
        },
      ],
    }
    const out = renderArtifact(doc, "")
    // An `always` column earns its word at `detail`, not at `page`.
    expect(out).toContain('class="hidden tier-detail:inline">review required')
    expect(out).toContain('class="tier-detail:hidden sr-only">review required')
    // A column that does not exist before `page` cannot show a word earlier.
    expect(out).toContain('class="hidden tier-page:inline">approved')
    // Never dropped, only hidden: both renderings of both words ship.
    expect(out.match(/review required/g)).toHaveLength(2)
    expect(out.match(/>approved/g)).toHaveLength(2)
  })

  it("names its columns on the stamp, not on a width", () => {
    // `tier-page` is 900px and a 2-column tile on a `wide` board lands at
    // ~876-890px, so the header used to turn on according to which canvas
    // width the reader had picked — and the lightbox lost it on a viewport
    // under 900px, which is the one surface it exists for.
    const out = renderArtifact(
      {
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
                values: [{ label: "age", value: "9d" }],
              },
            ],
          },
        ],
      },
      "",
    )
    expect(out).toContain('<thead class="hidden page-only:table-header-group">')
    expect(out).not.toContain("tier-page:table-header-group")
    // The lead column keeps its `w-full` — that is what stops the header and
    // the body disagreeing about where the slack goes — and loses the word
    // `item`, which named nothing a reader could not already see and printed
    // once per ledger. A screen reader still gets a column name.
    expect(out).toContain(
      '<th class="w-full pb-1 text-left font-normal"><span class="sr-only">item</span></th>',
    )
    // The word itself, printed where a reader would see it, is what went.
    expect(out).not.toContain('font-normal">item</th>')
  })
})

describe("the ledger's width", () => {
  const out = renderArtifact(
    {
      slug: "s",
      generatedAt: "2026-07-30T09:00:00Z",
      stat: { value: 1, label: "x" },
      blocks: [
        {
          kind: "queue",
          label: "PRs",
          rows: [
            {
              id: "a",
              title:
                "Activate Shopify Payments on the prod store — Test Mode / test orders can't run until it's set up",
              detail: "Jeff / Ash · Corza",
              values: [{ label: "age", value: "7d", numeric: true }],
            },
          ],
        },
      ],
    },
    "",
  )
  const row =
    /<tbody data-fit-item[^>]*>([\s\S]*?)<\/tbody>/.exec(out)?.[1] ?? ""

  it("fills the frame instead of stopping at a measure", () => {
    // A shrink-to-fit table capped at 52ch stopped at ~620px whatever frame it
    // was given: a dead trailing band over a quarter of an 880px tile and
    // nearly half the full view, under section rules that ran edge to edge.
    expect(out).toContain(
      '<table class="w-full border-collapse font-mono text-sm tabular-nums"',
    )
    expect(out).not.toContain("self-start")
  })

  it("leaves exactly one column flexible, so the slack has one home", () => {
    // `w-full` on more than one cell splits the surplus between them and the
    // trailing values stop anchoring; `w-full` on none hands it to whichever
    // column the auto algorithm likes.
    expect((row.match(/<td class="[^"]*\bw-full\b/g) ?? []).length).toBe(1)
    expect(row).toContain('<td class="text-ink w-full')
  })

  it("caps no measure on the title, which is scanned rather than read", () => {
    // The wrap this used to force cost a line of the height budget on a tile
    // that clips, and it happened while the width the title wanted sat empty
    // to its right.
    expect(/<td class="text-ink w-full[^"]*"/.exec(row)?.[0]).not.toContain(
      "max-w-",
    )
  })

  it("puts the detail line's measure on the text, not on the cell", () => {
    // As `max-width` on a `<td>` the 52ch measure also sized the table, so a
    // widget with short rows and long why-lines came out exactly as wide as a
    // paragraph. A detail line is a consequence of the row's width.
    const detail =
      /<tr class="hidden tier-detail:table-row">([\s\S]*?)<\/tr>/.exec(
        out,
      )?.[1] ?? ""
    expect(/<td[^>]*>/.exec(detail)?.[0]).not.toContain("max-w-")
    expect(detail).toContain('<span class="block max-w-[52ch] text-pretty">')
  })
})

describe("the leading key column", () => {
  const queue = (rows: QueueRow[], label: string): Block => ({
    kind: "queue",
    label,
    rows,
  })
  const doc = (blocks: Block[]): ArtifactDoc => ({
    slug: "s",
    generatedAt: "2026-07-30T09:00:00Z",
    stat: { value: 1, label: "x" },
    blocks,
  })
  /** Cells ahead of the title's own — what sets where a title starts. */
  const indent = (html: string, title: string) => {
    const body = [...html.matchAll(/<tbody[^>]*>([\s\S]*?)<\/tbody>/g)]
      .map((m) => m[1])
      .find((b) => b.includes(title))
    return (body?.slice(0, body.indexOf(title)).match(/<td/g) ?? []).length - 1
  }

  it("reserves no cell when no row has a face or a chip", () => {
    // Each queue block is its own table, so a cell reserved for nothing is not
    // a harmless empty cell — it is an indent one ledger pays and the next one
    // does not, and the two titles land at different x down the same artifact.
    const out = renderArtifact(
      doc([
        queue([{ id: "v", title: "CORZA-EYE-Q" }], "Violations"),
        queue([{ id: "p", title: "fix(csp): allowlist GTM" }], "Recent PRs"),
      ]),
      "",
    )
    expect(indent(out, "CORZA-EYE-Q")).toBe(0)
    expect(indent(out, "fix(csp)")).toBe(0)
  })

  it("keeps the cell on every row once one row fills it", () => {
    // Alignment within a table is the other half: a chip-less row still holds
    // the column open, or its title slides left under the chips above it.
    const out = renderArtifact(
      doc([
        queue(
          [
            {
              id: "a",
              title: "chipped",
              state: { label: "open", tone: "attn" },
            },
            { id: "b", title: "bare" },
          ],
          "Mixed",
        ),
      ]),
      "",
    )
    expect(indent(out, "chipped")).toBe(1)
    expect(indent(out, "bare")).toBe(1)
  })

  it("prints no chip for a state carrying no word", () => {
    // A published CSP artifact rendered `state` with no label as a bordered
    // 14px void beside every PR — read as a broken image, and it pushed the
    // title off the margin the section above it started from.
    const out = renderArtifact(
      doc([
        queue(
          [{ id: "a", title: "bare", state: { label: "", tone: "neutral" } }],
          "PRs",
        ),
      ]),
      "",
    )
    expect(out).not.toContain("rounded-sm border")
    expect(indent(out, "bare")).toBe(0)
  })

  it("names a chip with no word as a field, not as a silent void", () => {
    const errs = validateDoc(
      doc([
        queue(
          [{ id: "a", title: "a", state: { label: "", tone: "neutral" } }],
          "PRs",
        ),
      ]),
    )
    expect(errs.join(" ")).toContain(
      "blocks[0].rows[0].state.label must be a non-empty string",
    )
  })

  it("names a bare-string chip too, which is the emit that shipped", () => {
    // `corza-csp-triage` said "`state` merged/closed" and never said the shape,
    // so the run emitted `state: "merged"`. Nothing read it — not an object, so
    // the object branch skipped it — and `state.label` came back undefined at
    // render: a bordered void where the word should have been.
    // Built raw rather than through the typed helpers: `validateDoc` takes
    // `unknown`, and a malformed emit is exactly what it is here to catch.
    const errs = validateDoc({
      slug: "s",
      generatedAt: "2026-07-30T09:00:00Z",
      stat: { value: 1, label: "x" },
      blocks: [
        { kind: "queue", rows: [{ id: "a", title: "a", state: "merged" }] },
      ],
    })
    expect(errs.join(" ")).toContain(
      "blocks[0].rows[0].state must be an object",
    )
  })

  it("spans a detail line across the columns the row actually has", () => {
    const out = renderArtifact(
      doc([
        queue(
          [
            {
              id: "a",
              title: "bare",
              detail: "2026-07-31",
              values: [{ label: "one", value: "1" }],
            },
          ],
          "PRs",
        ),
      ]),
      "",
    )
    // title + one value, with no lead cell ahead of it to leave room for.
    expect(out).toContain('colSpan="2"')
    // The detail line starts where the title does: one cell, spanning the rest.
    const detail =
      /<tr class="hidden tier-detail:table-row">([\s\S]*?)<\/tr>/.exec(out)?.[1]
    expect((detail?.match(/<td/g) ?? []).length).toBe(1)
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

  it("stacks rather than leaving an empty main column", () => {
    // Not a corner case: this is `repo-intel`'s quiet week, where no new
    // signal surfaced and the carried-forward questions are the whole
    // briefing. Gating the grid on the rail alone put an empty 3fr track
    // beside them.
    const html = renderArtifact(
      {
        ...base,
        blocks: [
          { kind: "queue", label: "Signals", rows: [] },
          { kind: "queue", label: "Open questions", rail: true, rows: [row] },
        ],
      },
      "",
    )
    expect(html).not.toContain("tier-page:grid")
    // With nothing to sit beside, the rail *is* the content.
    expect(html).toContain("Open questions")
    expect(html).not.toContain('<div class="flex flex-col gap-3"></div>')
  })

  it("lets a prose band take the rail", () => {
    // Allowed on purpose. `rail` is a claim about rank, and an aside has rank
    // like any band; the 52ch measure sits comfortably in the 2fr column.
    // Forbidding it would mean splitting BlockBase and adding a validator rule
    // for a combination that renders correctly.
    const html = renderArtifact(
      {
        ...base,
        blocks: [
          { kind: "queue", label: "Signals", rows: [row] },
          {
            kind: "prose",
            label: "Why this week",
            rail: true,
            items: [{ id: "p1", body: "Deploy config moved server-side." }],
          },
        ],
      },
      "",
    )
    expect(html).toContain("tier-page:grid")
    // Still page-gated, and the gate is on the band so the heading goes too.
    expect(html).toContain("hidden page-only:flex")
    expect(html.indexOf("Signals")).toBeLessThan(html.indexOf("Why this week"))
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

describe("page-only bands", () => {
  const doc = (pageOnly?: boolean): ArtifactDoc => ({
    slug: "s",
    generatedAt: "2026-07-30T09:00:00Z",
    stat: { value: 1, label: "x" },
    blocks: [
      {
        kind: "queue",
        label: "Trace",
        pageOnly,
        rows: [{ id: "a", title: "A1" }],
      },
    ],
  })

  it("gates a queue band on the tile stamp, not a width", () => {
    // A four-column tile is 1200px and still not an auditor's surface. The
    // trace restates what the drivers and the reason line already say — on the
    // wide tile that put the same figure on screen four times.
    expect(renderArtifact(doc(true), "")).toContain("hidden page-only:flex")
  })

  it("leaves a queue band on the tile unless it asks", () => {
    expect(renderArtifact(doc(), "")).not.toContain("page-only:flex")
    expect(renderArtifact(doc(false), "")).not.toContain("page-only:flex")
  })

  it("keeps prose page-only without asking", () => {
    const prose: ArtifactDoc = {
      slug: "s",
      generatedAt: "2026-07-30T09:00:00Z",
      stat: { value: 1, label: "x" },
      blocks: [{ kind: "prose", items: [{ id: "d", body: "x" }] }],
    }
    expect(renderArtifact(prose, "")).toContain("hidden page-only:flex")
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

describe("the stat tier", () => {
  it("steps the hero down the moment a band appears beside it", () => {
    // Same gate as the verdict band, for the same reason: the step is about
    // whether anything else is on screen, which is a width OR height question.
    // On `tier-detail` (width ≥ 701px) a 1×2 tile kept a 44px centred figure
    // over a left-aligned ledger it had squeezed to one row and a `+2 more`.
    const html = renderArtifact(
      {
        slug: "s",
        generatedAt: "2026-07-30T09:00:00Z",
        stat: { value: 3, label: "to file", note: "12 held back" },
        blocks: [{ kind: "queue", rows: [{ id: "a", title: "a" }] }],
      },
      "",
    )
    const cls = /class="([^"]*text-\[2\.75rem\][^"]*)"/.exec(html)?.[1] ?? ""
    expect(cls).toContain("beyond-glance:text-2xl")
    expect(cls).not.toContain("tier-detail:text-2xl")
    // The row layout and the separator that only reads in a row travel with it.
    expect(html).toContain("beyond-glance:flex-row")
    expect(html).not.toContain("tier-detail:flex-row")
    expect(html).toContain('<span aria-hidden="true"> · </span>')
  })

  it("never lets the note open a line with the separator", () => {
    // The separator says where the label ends and the note begins, which only
    // means anything while the two share a line. As its own flex item the note
    // carried it unconditionally, so a note long enough to wrap opened its line
    // with a dangling `·` and nothing on its left — live on `corza-pings`.
    // Nesting it inside the label is what makes that unrepresentable: the mark
    // cannot start a line the label does not also start.
    const html = renderArtifact(
      {
        slug: "s",
        generatedAt: "2026-07-30T09:00:00Z",
        stat: { value: 0, label: "pings", note: "Nothing new to report." },
      },
      "",
    )
    const sep = html.indexOf('<span aria-hidden="true"> · </span>')
    const label = html.indexOf("pings")
    expect(label).toBeGreaterThan(-1)
    expect(sep).toBeGreaterThan(label)
    // No element boundary opens between them: the label's own text box holds
    // both, so they wrap as one run of prose rather than as two flex items.
    expect(html.slice(label + "pings".length, sep)).not.toContain("</span>")
  })

  it("gives the wrapped line a row gap, not the glance stack's 2px", () => {
    // `gap-x-2` sets the COLUMN gap only, so the row gap stayed at the
    // `gap-0.5` the glance's figure-over-label stack wants. A note long enough
    // to wrap landed 2px under the label and read as one mis-set paragraph.
    const html = renderArtifact(
      {
        slug: "s",
        generatedAt: "2026-07-30T09:00:00Z",
        stat: { value: 0, label: "pings", note: "x" },
      },
      "",
    )
    expect(html).toContain("beyond-glance:gap-y-1")
  })
})

describe("the verdict band", () => {
  const base = { slug: "s", generatedAt: "2026-07-30T09:00:00Z" }
  const verdict = (over: Partial<Verdict> = {}) => {
    const doc: ArtifactDoc = {
      ...base,
      verdict: { level: "attn", word: "AMBER", ...over },
    }
    return renderArtifact(doc, "")
  }

  it("never ships colour alone", () => {
    // Two encodings, picked together by the level so no caller can separate
    // them: the word names the state, the silhouette ranks it, and neither is
    // colour — which is what has to survive colour-vision deficiency,
    // grayscale and forced-colors.
    //
    // Pinned on a stroke unique to each glyph, not on the level's text colour.
    // Asserting the colour would let all four levels ship the SAME shape and
    // still pass, which is the failure this test exists to catch: a reader
    // without colour would see one undifferentiated mark on every verdict.
    const levels: [Verdict["level"], string][] = [
      ["good", "m9 12 2 2 4-4"], // circle-check
      ["attn", "m21.73 18-8-14"], // triangle-alert
      ["bad", "M15.312 2a2 2 0"], // octagon-alert
      ["pending", "M12 6v6l4 2"], // clock
    ]
    const seen = new Set<string>()
    for (const [level, stroke] of levels) {
      const html = verdict({ level, word: "X" })
      expect(html, level).toContain(">X<") // 1. the word
      expect(html, level).toContain(stroke) // 2. this level's own silhouette
      seen.add(stroke)
    }
    expect(seen.size, "each level needs its own shape").toBe(levels.length)
  })

  it("steps the hero down the moment a second line appears", () => {
    // The word is 44px because at the glance it IS the artifact. Every line
    // under it — the reason, the caveat, the note — appears at `beyond-glance`,
    // so that is where the word stops being the whole artifact. Gating the
    // step-down on `tier-detail` put it 360px of width later, and a 1×2 and a
    // 2×2 tile ran a 44px hero over a 14px sentence.
    const html = verdict({ clauses: [{ value: "12d" }] })
    // The class attribute carrying the hero size. The glyph is its child, so
    // matching on the class rather than on the word keeps this independent of
    // what else the span holds.
    const cls = /class="([^"]*text-\[2\.75rem\][^"]*)"/.exec(html)?.[1] ?? ""
    expect(cls).toContain("beyond-glance:text-2xl")
    expect(cls).not.toContain("tier-detail:text-2xl")
    // And it is the word that is sized, not something near it: the sized span
    // opens on the word, with the glyph after it.
    expect(html.slice(html.indexOf(cls))).toMatch(/^[^<]*">AMBER</)
  })

  it("keeps the gate beside the word it anchors", () => {
    // `ml-auto` on an unbounded row parked the anchor at the far edge — 1000px
    // from the word at the full view — and at 340 wide the `shrink-0` span
    // neither wrapped nor truncated, so the tail ran off the tile. That is the
    // silent crop ADR-0019 forbids.
    const html = verdict({ gate: "Aug 6 gate · 7 days out" })
    const at = html.indexOf("Aug 6 gate")
    const cls =
      /class="([^"]*)"/.exec(
        html.slice(html.lastIndexOf("<span", at), at),
      )?.[1] ?? ""
    expect(cls).not.toContain("ml-auto")
    expect(cls).not.toContain("shrink-0")
    // And the row it sits in can take a second line rather than overflow.
    expect(html).toContain("flex-wrap")
  })

  it("puts the gate on the word's baseline, not on a synthesised one", () => {
    // The gate is aligned with `items-baseline` against the hero span. A flex
    // container takes its baseline from its FIRST flex item, and when that item
    // carries no text of its own the baseline is synthesised from its bottom
    // edge — so the hero must not be a flex container, or the gate floats. This
    // was live: with a dot leading the row, "Aug 6 · 3d" rendered 5.9px above
    // the baseline of the word it qualifies, landing on the dot's bottom edge.
    const html = verdict({ gate: "Aug 6 · 3d" })
    const cls = /class="([^"]*text-\[2\.75rem\][^"]*)"/.exec(html)?.[1] ?? ""
    expect(cls).not.toMatch(/(^|\s)(inline-)?flex(\s|$)/)
    expect(cls).not.toContain("items-center")
    // The parent still baseline-aligns; that is the half this protects.
    expect(html).toContain("items-baseline")
  })

  it("bolds the measured figure and nothing else", () => {
    const html = verdict({
      clauses: [{ lead: "Pace gap", value: "12d", tail: "on the Aug 6 gate" }],
    })
    expect(html).toContain(
      '<strong class="text-ink font-semibold">12d</strong>',
    )
    expect(html).not.toContain(
      '<strong class="text-ink font-semibold">Pace gap',
    )
  })

  it("keeps the caveat out of the verdict's colour", () => {
    // It qualifies the verdict rather than restating it, and the tile spends
    // its accent on the word.
    const html = verdict({ caveat: "Not a full read — R2 has no input." })
    // The <p> that carries it, not a fixed-width slice — the icon's own markup
    // sits between the tag and the text and swallowed the window.
    const at = html.indexOf("Not a full read")
    const cls =
      /class="([^"]*)"/.exec(
        html.slice(html.lastIndexOf("<p ", at), at),
      )?.[1] ?? ""
    expect(cls).toContain("text-ink")
    expect(cls).not.toContain("text-orange")
  })

  it("sets the caveat's glyph into the text run, not beside it", () => {
    // The same rule as the gate above, one tier down, and broken here for a
    // while: the caveat was a `flex items-baseline` row led by a wrapper span
    // holding nothing but the clock. A flex item ignores `vertical-align`, so
    // that row could only align on the wrapper's SYNTHESISED baseline — the
    // glyph's bottom margin edge — which measured 0.183em of the clock's
    // centre hanging above the cap band beside it, against 0.071em for every
    // other glyph the kit draws.
    const html = verdict({ caveat: "Not a full read — R2 has no input." })
    const at = html.indexOf("Not a full read")
    const run = html.slice(html.lastIndexOf("<p ", at), at)
    const cls = /class="([^"]*)"/.exec(run)?.[1] ?? ""
    expect(cls).not.toMatch(/(^|\s)(inline-)?flex(\s|$)/)
    // And the glyph inside it carries the kit's inline shift rather than the
    // line box's default, which is what the sweep below generalises.
    expect(run).toContain("align-[-0.06em]")
  })

  it("gives the band trimmable units so a short tile cannot crop it", () => {
    // Found from the render: with no [data-fit-item] anywhere, the fit pass had
    // nothing to shed and a 2×1 clipped the override line mid-sentence.
    const html = verdict({
      clauses: [{ value: "12d" }],
      note: "overridden by John Costa",
    })
    expect((html.match(/data-fit-item/g) ?? []).length).toBeGreaterThanOrEqual(
      2,
    )
  })

  it("trims the whole reason line, never half of it", () => {
    // A clause list cut mid-way still reads as complete, which is worse than
    // showing none of it.
    const html = verdict({
      clauses: [{ value: "12d" }, { value: "11 asks" }, { value: "104d" }],
    })
    const p = html.slice(html.indexOf("data-fit-list"), html.indexOf("104d"))
    expect((p.match(/data-fit-item/g) ?? []).length).toBe(1)
  })

  it("checks the shape of a clause's refs", () => {
    const errs = validateDoc({
      ...base,
      verdict: {
        level: "attn",
        word: "AMBER",
        clauses: [{ value: "12d", refs: [{ href: "https://example.test" }] }],
      },
    })
    expect(errs.join(" ")).toContain("verdict.clauses[0].refs[0].label")
  })

  it("checks a value's delta", () => {
    const doc = (delta: unknown) => ({
      ...base,
      stat: { value: 1, label: "x" },
      blocks: [
        {
          kind: "queue",
          rows: [
            {
              id: "a",
              title: "a",
              values: [{ label: "l", value: "v", delta }],
            },
          ],
        },
      ],
    })
    expect(
      validateDoc(doc({ value: "3d", direction: "sideways" })).join(" "),
    ).toContain("delta.direction must be one of up, down, flat")
    expect(validateDoc(doc("3d")).join(" ")).toContain("delta must be")
    expect(validateDoc(doc({ value: "3d", direction: "up" }))).toEqual([])
  })

  it("refuses a doc that sets both stat and verdict", () => {
    // Two hero figures at the glance is two glances.
    expect(
      validateDoc({
        ...base,
        stat: { value: 1, label: "x" },
        verdict: { level: "attn", word: "AMBER" },
      }),
    ).toContain("stat and verdict are alternatives — set one, not both")
  })

  it("refuses a doc with neither", () => {
    expect(validateDoc(base).join(" ")).toContain("stat or verdict is required")
  })
})

describe("the bottom line", () => {
  const base: ArtifactDoc = {
    slug: "s",
    generatedAt: "2026-07-30T09:00:00Z",
    verdict: { level: "attn", word: "Stalled" },
  }
  const sentence = "Nothing has merged in 58 hours."
  const withLine = (over: Partial<BottomLine> = {}) =>
    renderArtifact({ ...base, bottomLine: { text: sentence, ...over } }, "")

  it("renders under the glance and over the first band", () => {
    // The regression this exists for: corza-narrative moved onto the kit, took
    // `verdict` because its headline is a word, and its executive sentence had
    // no slot — so the run stopped writing one at all.
    const html = withLine()
    const at = html.indexOf(sentence)
    expect(at).toBeGreaterThan(html.indexOf("Stalled"))
  })

  it("carries the rank in ink and size, never a second colour", () => {
    // The accent budget is spent on the glance word directly above it.
    const html = withLine()
    const at = html.indexOf(sentence)
    const cls =
      /class="([^"]*)"/.exec(
        html.slice(html.lastIndexOf("<p ", at), at),
      )?.[1] ?? ""
    expect(cls).toContain("text-ink")
    expect(cls).toContain("text-base")
    expect(cls).not.toMatch(/text-(orange|red|green)/)
  })

  it("clamps on a tile rather than yielding to the fit pass", () => {
    // Every other band trims; this one is the floor. A tile that trimmed its
    // way out of the conclusion reports evidence for a verdict it no longer
    // states — so it degrades visibly at three lines instead.
    const html = withLine()
    const at = html.indexOf(sentence)
    const p = html.slice(html.lastIndexOf("<p ", at), at)
    expect(p).toContain("tile:line-clamp-3")
    expect(p).not.toContain("data-fit-item")
  })

  it("stays off the glance, where there is room for the glance alone", () => {
    // The clamp and the visibility gate cannot share an element: line-clamp
    // sets `display: -webkit-box`, which outranks `hidden` and put the
    // sentence back on the 340×160 tile under the word.
    const html = withLine()
    const at = html.indexOf(sentence)
    const p = html.lastIndexOf("<p ", at)
    const wrapper = /class="([^"]*)"/.exec(
      html.slice(html.lastIndexOf("<div ", p), p),
    )?.[1]
    expect(wrapper).toContain("hidden")
    expect(wrapper).toContain("beyond-glance:block")
    expect(wrapper).not.toContain("line-clamp")
  })

  it("links the keys it cites out of the frame", () => {
    const html = withLine({
      refs: [{ label: "#433", href: "https://example.test/433" }],
    })
    expect(html).toContain('href="https://example.test/433"')
    expect(html).toContain(">#433<")
  })

  it("checks its shape", () => {
    // A bare string is the shape an author reaches for first, and it would
    // otherwise render as nothing — the failure the field exists to fix.
    expect(validateDoc({ ...base, bottomLine: sentence }).join(" ")).toContain(
      "bottomLine must be an object with a text field",
    )
    expect(validateDoc({ ...base, bottomLine: {} }).join(" ")).toContain(
      "bottomLine.text is required",
    )
    expect(
      validateDoc({
        ...base,
        bottomLine: {
          text: sentence,
          refs: [{ href: "https://example.test" }],
        },
      }).join(" "),
    ).toContain("bottomLine.refs[0].label")
    expect(validateDoc({ ...base, bottomLine: { text: sentence } })).toEqual([])
  })
})

describe("value deltas", () => {
  it("marks direction and stays out of the accent budget", () => {
    const html = renderArtifact(
      {
        slug: "s",
        generatedAt: "2026-07-30T09:00:00Z",
        stat: { value: 1, label: "x" },
        blocks: [
          {
            kind: "queue",
            rows: [
              {
                id: "a",
                title: "A1",
                values: [
                  {
                    label: "measured",
                    value: "12d behind",
                    delta: { value: "3d", direction: "up" },
                  },
                ],
              },
            ],
          },
        ],
      },
      "",
    )
    // Drawn, never typed. `▲`/`▼` are outside the latin subset the board
    // injects, so they arrived from whatever face the OS offered — a
    // different weight and baseline per platform, mid-string. A text
    // direction glyph reappearing here is that regression.
    expect(html).not.toMatch(/[▲▼]/)
    expect(html).toContain("m5 12 7-7 7 7")
    expect(html).toContain("3d")
    // The shape cannot be read aloud, so the word travels with it.
    expect(html).toContain(">up </span>3d")
    // Ink-dim whichever way it points: down is good news on a slip and bad on
    // a burn-up, so a tone here would have to be per-column.
    const at = html.indexOf("m5 12 7-7 7 7")
    expect(html.slice(at - 300, at)).toContain("text-ink-dim")
  })

  it("draws every glyph the injected font subset cannot carry", () => {
    // The whole corpus, not one cell. `↔` (U+2194) in the matrix legend and
    // `↗` (U+2197) on the provenance link fell out of the same subset for the
    // same reason, and each put a fallback face inside an otherwise controlled
    // line. Measured against the injected file at 100px: `M` advances 60.00
    // and rises to 71.0, while every codepoint below advances 60.21 and sits
    // on its own baseline.
    //
    // Routine *content* can still carry any character it likes — this is the
    // markup the kit itself emits, which is the part the kit controls.
    const OUT_OF_SUBSET = /[▲▼↔↗→]/
    for (const name of ["status", "matrix", "ledger", "roster", "edge"]) {
      const doc: ArtifactDoc = JSON.parse(
        readFileSync(
          new URL(`../fixtures/${name}.json`, import.meta.url),
          "utf8",
        ),
      )
      // Only the glyphs the kit chose. A fixture that writes `→` into a
      // caption is the routine's own text and travels as data.
      const emitted = renderArtifact(doc, "").replace(
        /<script[\s\S]*?<\/script>/g,
        "",
      )
      const content = new Set(
        JSON.stringify(doc).match(new RegExp(OUT_OF_SUBSET, "g")) ?? [],
      )
      const kitGlyphs = [
        ...(emitted.match(new RegExp(OUT_OF_SUBSET, "g")) ?? []),
      ].filter((g) => !content.has(g))
      expect(kitGlyphs, `${name} emits an out-of-subset glyph`).toEqual([])
    }
  })
})

describe("a pinned row", () => {
  it("reaches the injected fit pass as data-fit-keep", () => {
    // No fixture pins a row any more — the two that did were both wrong, and
    // pinning a trailing band's quiet row collapsed the band above it. The
    // field is still real and still reachable, so it is pinned here instead,
    // where asserting it does not also publish a preview that misuses it.
    const html = renderArtifact(
      {
        slug: "s",
        generatedAt: "2026-07-30T09:00:00Z",
        stat: { value: 1, label: "x" },
        blocks: [
          {
            kind: "queue",
            rows: [
              { id: "a", title: "Ordinary" },
              { id: "b", title: "Load-bearing", keep: true },
            ],
          },
        ],
      },
      "",
    )
    // The pin rides the row's own <tbody> — the *same* element carrying
    // `data-fit-item`, because the trimmable unit and the pinnable one have to
    // be the same thing for the pass to honour one against the other. Both are
    // asserted on one slice: a pin on some other element would still satisfy a
    // document-wide search while being invisible to the pass that reads it.
    const unit = (title: string) =>
      html.slice(
        html.lastIndexOf("<tbody", html.indexOf(title)),
        html.indexOf(title),
      )
    const pinned = unit("Load-bearing")
    expect(pinned).toContain('data-fit-item="true"')
    expect(pinned).toContain('data-fit-keep=""')
    // Still trimmable, just not pinned — the pass needs both kinds of unit.
    const ordinary = unit("Ordinary")
    expect(ordinary).toContain('data-fit-item="true"')
    expect(ordinary).not.toContain("data-fit-keep")
  })
})

describe("grouped queues", () => {
  const doc: ArtifactDoc = {
    slug: "s",
    generatedAt: "2026-07-30T09:00:00Z",
    stat: { value: 1, label: "x" },
    blocks: [
      {
        kind: "queue",
        showHeader: true,
        groups: [
          {
            id: "blocked",
            label: "Blocked",
            count: "2",
            rows: [
              {
                id: "p1",
                title: "#41 fix the thing",
                values: [{ label: "age", value: "9d" }],
              },
            ],
          },
          {
            id: "open",
            label: "Open",
            count: "1",
            rows: [
              {
                id: "p2",
                title: "#44 add the other thing",
                values: [
                  { label: "age", value: "2d" },
                  { label: "ci", value: "passing" },
                ],
              },
            ],
          },
        ],
      },
    ],
  }

  it("puts every group in one table so the columns line up", () => {
    // The requirement `repo-pulse` names: one grid, sections laid into it, so
    // every state icon and age sits on the same vertical. A table per section
    // gives each its own column widths — the misaligned-state smell.
    const html = renderArtifact(doc, "")
    expect((html.match(/<table/g) ?? []).length).toBe(1)
    expect(html).toContain("Blocked")
    expect(html).toContain("Open")
  })

  it("unions columns across groups, not within one", () => {
    // The `ci` column is named only by the second group's row; the first
    // group's row still has to occupy it, or its cells slide left.
    const html = renderArtifact(doc, "")
    const bodies = [
      ...html.matchAll(/<tbody[^>]*data-fit-item[\s\S]*?<\/tbody>/g),
    ]
    const cells = (b: string) => (b.match(/<td/g) ?? []).length
    expect(bodies).toHaveLength(2)
    expect(cells(bodies[0][0])).toBe(cells(bodies[1][0]))
  })

  it("keeps a group heading untrimmable so a trimmed group still reports", () => {
    // Reduced to its heading, `Open · 12` still tells the reader there are 12.
    // Hiding it would say there are none — the same reasoning the kit already
    // applies to a yield-first band reduced to its label.
    const html = renderArtifact(doc, "")
    const heading = html.slice(
      html.indexOf("Blocked") - 200,
      html.indexOf("Blocked"),
    )
    expect(heading).not.toContain("data-fit-item")
  })

  it("drops an empty group rather than heading nothing", () => {
    const html = renderArtifact(
      {
        ...doc,
        blocks: [
          {
            kind: "queue",
            groups: [
              { id: "a", label: "Has rows", rows: [{ id: "r", title: "r" }] },
              { id: "b", label: "Empty", rows: [] },
            ],
          },
        ],
      },
      "",
    )
    expect(html).toContain("Has rows")
    expect(html).not.toContain("Empty")
  })
})

describe("viewer-neutral row data", () => {
  it("carries relationships, never a resolved viewer", () => {
    // One file is read by everyone the board is shared with, so "needs your
    // review" is settled at render time against the signed-in viewer — the
    // published markup names the author and the reviewers and nobody else.
    const html = renderArtifact(
      {
        slug: "s",
        generatedAt: "2026-07-30T09:00:00Z",
        stat: { value: 1, label: "x" },
        blocks: [
          {
            kind: "queue",
            rows: [
              {
                id: "p",
                title: "#41",
                data: { author: "kelly", reviewers: "devon sam" },
              },
            ],
          },
        ],
      },
      "",
    )
    expect(html).toContain('data-author="kelly"')
    expect(html).toContain('data-reviewers="devon sam"')
    expect(html).not.toMatch(/needs your|yours/i)
  })
})

describe("Avatar", () => {
  const face = (src?: string) =>
    renderArtifact(
      {
        slug: "s",
        generatedAt: "2026-07-30T09:00:00Z",
        stat: { value: 1, label: "x" },
        blocks: [
          {
            kind: "queue",
            rows: [{ id: "p", title: "#41", face: { name: "Kelly Ma", src } }],
          },
        ],
      },
      "",
    )

  it("drops a remote src rather than emitting a request that cannot succeed", () => {
    // The sandbox has no network, and neither does a scheduled run — the fetch
    // that used to lead the resolution chain reached avatars.githubusercontent
    // .com, so rows degraded to initials on exactly the runs nobody watched.
    const html = face("https://avatars.githubusercontent.com/u/1")
    expect(html).not.toContain("avatars.githubusercontent.com")
    expect(html).toContain("K") // the initial still renders
  })

  it("keeps a data URI", () => {
    expect(face("data:image/png;base64,iVBORw0KGgo=")).toContain(
      "data:image/png",
    )
  })

  it("names a face with no name as a field, not as a stack trace", () => {
    // Review caught this and it was worse than reported: the validator was
    // silent and the renderer threw "Cannot read properties of undefined" from
    // inside the minified bundle — the incidental failure validateDoc exists
    // to convert into a named field. `face` shipped without any coverage.
    const errs = validateDoc({
      slug: "s",
      generatedAt: "2026-07-30T09:00:00Z",
      stat: { value: 1, label: "x" },
      blocks: [
        {
          kind: "queue",
          rows: [
            { id: "a", title: "a", face: { src: "data:image/png;base64,x" } },
          ],
        },
      ],
    })
    expect(errs.join(" ")).toContain("blocks[0].rows[0].face.name is required")
  })

  it("renders rather than throws if one slips through", () => {
    // The validator is the gate a routine hits, but the component is exported.
    // Deleting the field rather than asserting a bad type keeps this honest
    // about what a malformed emit looks like at runtime.
    const doc: ArtifactDoc = {
      slug: "s",
      generatedAt: "2026-07-30T09:00:00Z",
      stat: { value: 1, label: "x" },
      blocks: [
        {
          kind: "queue",
          rows: [
            { id: "a", title: "a", face: { name: "gone", src: "data:x" } },
          ],
        },
      ],
    }
    const block = doc.blocks?.[0]
    if (block?.kind === "queue" && block.rows?.[0]?.face) {
      Reflect.deleteProperty(block.rows[0].face, "name")
    }
    expect(renderArtifact(doc, "")).toContain("</html>")
  })

  it("carries the name for hover and for screen readers", () => {
    const html = face()
    expect(html).toContain('title="Kelly Ma"')
    expect(html).toContain("Kelly Ma")
  })
})

describe("the burn-up", () => {
  // `null` omits `max` entirely, for the cases that are about what the kit
  // derives. A default parameter cannot express that: passing `undefined`
  // takes the default.
  const chart = (
    lines: SeriesSpec["lines"],
    max: number | null = 40,
    today?: string,
  ): ArtifactDoc => ({
    slug: "s",
    generatedAt: "2026-07-30T09:00:00Z",
    stat: { value: 1, label: "x" },
    blocks: [
      {
        kind: "series",
        label: "Burn-up",
        spec: {
          from: "2026-07-01",
          to: "2026-08-01",
          ...(max === null ? {} : { max }),
          ...(today ? { today } : {}),
          lines,
        },
      },
    ],
  })
  /** The chart's own markup, so a shared utility class elsewhere cannot match. */
  const figure = (doc: ArtifactDoc) =>
    /<figure[\s\S]*?<\/figure>/.exec(renderArtifact(doc, ""))?.[0] ?? ""
  const hero: SeriesSpec["lines"][number] = {
    id: "landed",
    label: "16 landed",
    role: "hero",
    points: [
      { x: "2026-07-01", y: 4 },
      { x: "2026-07-30", y: 16 },
    ],
  }

  it("is page-only without asking", () => {
    // A four-column tile is 1200px and still not a reading surface, and tiles
    // never scroll — a chart there steals the ledger's rows or opens into the
    // clipped region.
    expect(renderArtifact(chart([hero]), "")).toContain("hidden page-only:flex")
  })

  it("draws a ceiling as steps, not a slope", () => {
    // A membership count holds until the next recorded change. Interpolating
    // draws a gradual scope change that never happened.
    const html = renderArtifact(
      chart([
        {
          id: "scope",
          label: "40 scope",
          role: "ceiling",
          points: [
            { x: "2026-07-01", y: 32 },
            { x: "2026-07-30", y: 40 },
          ],
        },
      ]),
      "",
    )
    const d = /<path d="([^"]+)"/.exec(html)?.[1] ?? ""
    // Two segments per step: across at the old value, then up.
    expect((d.match(/L/g) ?? []).length).toBe(2)
  })

  it("separates end labels that would collide", () => {
    // The ghost line sits just above the hero by definition, so overlapping
    // labels are the normal case rather than the unlucky one.
    const fig = figure(
      chart([
        hero,
        {
          id: "inflight",
          label: "+1 in review",
          role: "ghost",
          points: [
            { x: "2026-07-01", y: 5 },
            { x: "2026-07-30", y: 17 },
          ],
        },
      ]),
    )
    // Percent of the plot, not user units: the labels are real 12px HTML now,
    // and the plot's height is a CSS clamp with no build-time pixel value.
    const tops = [
      ...fig.matchAll(/style="top:([\d.]+)%"[^>]*>[^<]*(?:landed|review)/g),
    ].map((m) => Number(m[1]))
    expect(tops).toHaveLength(2)
    // 9% is ~14px at the clamp's 160px floor, so the gap only grows on a
    // taller chart. Never shrinks below the one height it was calibrated at.
    expect(Math.abs(tops[0] - tops[1])).toBeGreaterThanOrEqual(9)
  })

  it("anchors the marker to the point, never to the nudged label", () => {
    // The label moves to stay legible; the dot must not, or the chart reports
    // a value it did not plot.
    const fig = figure(
      chart([
        hero,
        {
          id: "inflight",
          label: "+1 in review",
          role: "ghost",
          points: [
            { x: "2026-07-01", y: 5 },
            { x: "2026-07-30", y: 17 },
          ],
        },
      ]),
    )
    // y=16 of 40 — the dot sits at the value, in percent down the plot.
    const dot = /rounded-full[^"]*"[^>]*style="([^"]+)"/.exec(fig)?.[1] ?? ""
    expect(dot).toContain(`top:${((1 - 16 / 40) * 100).toFixed(3)}%`)
    // ...while its label was pushed clear of the ghost's above it.
    const label = /style="top:([\d.]+)%"[^>]*>16 landed/.exec(fig)?.[1]
    expect(Number(label)).toBeGreaterThan(60)
  })

  it("keeps every glyph out of the plot's coordinate space", () => {
    // The regression this component was rebuilt for. A fixed viewBox scaled to
    // `width: 100%` puts SVG text in *user units*, so `text-xs` rendered at 12
    // × the container's scale factor — ~30px labels on a wide board, beside
    // identical `text-xs` HTML at 12px. Strokes escape via `vector-effect`;
    // text has no equivalent, so text does not go in there at all.
    expect(figure(chart([hero]))).not.toContain("<text")
  })

  it("snaps the y axis to intervals somebody would choose", () => {
    // `ceil(peak / 4)` lands on a clean number only by luck: a real run put 66
    // in and got 0 / 17 / 34 / 51 — arithmetic nobody chose.
    const fig = figure(
      chart(
        [
          {
            ...hero,
            points: [
              { x: "2026-07-01", y: 20 },
              { x: "2026-07-30", y: 66 },
            ],
          },
        ],
        null,
      ),
    )
    const axis = /class="[^"]*tabular-nums[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(
      fig,
    )?.[1]
    expect(
      [...(axis ?? "").matchAll(/>(\d+)</g)].map((m) => Number(m[1])),
    ).toEqual([0, 20, 40, 60, 80])
  })

  it("never lets a target slope set the y scale", () => {
    // A target is where the line *would* have to go. Scaling to it spends the
    // top of the plot on a number nobody is claiming and squashes the two
    // lines the chart is about. It clips at the top edge instead.
    const fig = figure(
      chart(
        [
          hero,
          {
            id: "pace",
            label: "needs 40/wk",
            role: "target",
            points: [
              { x: "2026-07-30", y: 16 },
              { x: "2026-08-01", y: 60 },
            ],
          },
        ],
        null,
      ),
    )
    // Scaled to the hero's 16 → a ceiling of 20, so the target's 60 plots
    // above the plot rect and the SVG's own viewBox clip takes it.
    const dot = /rounded-full[^"]*"[^>]*style="([^"]+)"/.exec(fig)?.[1] ?? ""
    expect(dot).toContain(`top:${((1 - 16 / 20) * 100).toFixed(3)}%`)
    const pace = /<path d="M[\d.]+ [\d.]+ L[\d.]+ (-[\d.]+)"/.exec(fig)?.[1]
    expect(Number(pace)).toBeLessThan(0)
  })

  it("cannot print the today caption through the end date", () => {
    // Three absolutely-positioned spans do not know about each other, so a
    // `today` late in the window printed straight through the horizon —
    // `2026-0today8-06`, on every tile narrow enough to matter. Flex items
    // cannot overlap, so the gap is a floor rather than a hope.
    const fig = figure(chart([hero], 40, "2026-07-25"))
    // The caption stays on its own rule anyway: the spacer's basis backs out
    // the start label and half of `today`, both known `ch` widths.
    expect(fig).toMatch(/flex-basis:calc\([\d.]+% - 12\.5ch - 0\.5rem\)/)
    expect(fig).not.toMatch(/class="[^"]*absolute[^"]*"[^>]*>today/)
  })

  it("carries a legend for two lines and none for one", () => {
    // A single series needs no legend box — the band label names it.
    expect(renderArtifact(chart([hero]), "")).not.toContain("<figcaption")
    expect(
      renderArtifact(chart([hero, { ...hero, id: "b", role: "target" }]), ""),
    ).toContain("<figcaption")
  })

  it("draws nothing for a line that is a single dot", () => {
    // One point is not a trend, and a band that renders one is a chart making
    // a claim from a single observation.
    const html = renderArtifact(
      { ...chart([{ ...hero, points: [{ x: "2026-07-01", y: 4 }] }]) },
      "",
    )
    expect(html).not.toContain("Burn-up")
  })

  it("names a bad point rather than dropping the line", () => {
    // A non-numeric y plots as NaN, which SVG discards silently — the line
    // just stops mid-chart with no error anywhere.
    const errs = validateDoc({
      slug: "s",
      generatedAt: "2026-07-30T09:00:00Z",
      stat: { value: 1, label: "x" },
      blocks: [
        {
          kind: "series",
          spec: {
            from: "2026-07-01",
            to: "2026-08-01",
            lines: [
              {
                id: "a",
                label: "a",
                role: "hero",
                points: [{ x: "2026-07-01", y: "4" }],
              },
            ],
          },
        },
      ],
    })
    expect(errs.join(" ")).toContain("points[0].y must be a finite number")
  })

  it("rejects a role the kit has no encoding for", () => {
    const errs = validateDoc({
      slug: "s",
      generatedAt: "2026-07-30T09:00:00Z",
      stat: { value: 1, label: "x" },
      blocks: [
        {
          kind: "series",
          spec: {
            from: "2026-07-01",
            to: "2026-08-01",
            lines: [{ id: "a", label: "a", role: "secondary", points: [] }],
          },
        },
      ],
    })
    expect(errs.join(" ")).toContain(
      "role must be one of hero, ceiling, target, ghost",
    )
  })
})

describe("progress rails", () => {
  const doc = (rails: object[], stages?: object[]): ArtifactDoc =>
    JSON.parse(
      JSON.stringify({
        slug: "s",
        generatedAt: "2026-07-30T09:00:00Z",
        stat: { value: 1, label: "x" },
        blocks: [{ kind: "progress", label: "Closing", rails, stages }],
      }),
    )

  it("draws the tick where the calendar says, not where the fill is", () => {
    // Fill past the tick reads ahead, short of it reads behind — the reader
    // gets the verdict from the geometry before reading a word.
    const html = renderArtifact(
      doc([{ id: "g", label: "gate", percent: 40, tick: 68, tone: "attn" }]),
      "",
    )
    expect(html).toContain("width:40%")
    expect(html).toContain("calc(68% - 1px)")
  })

  it("never leaves the mark as the only encoding", () => {
    // A mark on a bar is not a thing a screen reader can report.
    const html = renderArtifact(
      doc([
        {
          id: "g",
          label: "gate",
          percent: 40,
          tick: 68,
          verdict: "12d behind",
        },
      ]),
      "",
    )
    expect(html).toMatch(
      /aria-label="gate: 40% complete, 68% elapsed, 12d behind"/,
    )
  })

  it("clamps rather than drawing outside the track", () => {
    const html = renderArtifact(
      doc([{ id: "g", label: "g", percent: 140, tick: -20 }]),
      "",
    )
    expect(html).toContain("width:100%")
    expect(html).toContain("calc(0% - 1px)")
  })

  it("sheds a whole rail rather than cropping one mid-track", () => {
    const html = renderArtifact(
      doc([
        { id: "a", label: "a", percent: 10 },
        { id: "b", label: "b", percent: 20, secondary: true },
      ]),
      "",
    )
    // One list and one unit per rail: half a progress bar is not a shorter
    // reading of it.
    expect((html.match(/data-fit-list/g) ?? []).length).toBe(2)
    expect((html.match(/data-fit-item/g) ?? []).length).toBe(2)
  })

  it("keeps the tone off the fill", () => {
    // Tinting the fill too would repaint the whole rail on a judgement the
    // tick is already making, and spend the tile accent twice.
    const html = renderArtifact(
      doc([{ id: "g", label: "g", percent: 40, tick: 68, tone: "bad" }]),
      "",
    )
    expect(html).toContain("bg-orange")
    expect(html).toContain("bg-red")
  })

  it("names a stage state in words beside its dot", () => {
    const html = renderArtifact(
      doc(
        [{ id: "g", label: "g", percent: 40 }],
        [
          { id: "s1", label: "Discovery", state: "done" },
          { id: "s2", label: "Build", state: "now" },
        ],
      ),
      "",
    )
    expect(html).toContain("(done)")
    expect(html).toContain("(now)")
  })

  it("needs width for the stage strip, not only height", () => {
    // A chain of nowrap labels with no way to shed one. Gated on height
    // alone, a 340×474 tile drew a four-act strip 166px wider than the frame
    // and ran the last act off the edge.
    const html = renderArtifact(
      doc(
        [{ id: "g", label: "g", percent: 40 }],
        [{ id: "s1", label: "Discovery", state: "done" }],
      ),
      "",
    )
    expect(html).toContain("tier-detail:taller:block")
    expect(html).not.toMatch(/class="hidden taller:block"/)
  })

  it("rejects a percent that is not a number", () => {
    // A non-numeric percent draws a zero-width fill, which reads as
    // "nothing done yet" rather than as an error.
    const errs = validateDoc(doc([{ id: "g", label: "g", percent: "40" }]))
    expect(errs.join(" ")).toContain("percent must be a finite number")
  })
})

describe("the day grid", () => {
  const day = (blocks: object[], now?: string): ArtifactDoc =>
    JSON.parse(
      JSON.stringify({
        slug: "s",
        generatedAt: "2026-07-30T09:00:00Z",
        stat: { value: 1, label: "x" },
        blocks: [
          {
            kind: "day",
            label: "Today",
            spec: { from: "08:00", to: "18:00", now, blocks },
          },
        ],
      }),
    )
  const block = (id: string, start: string, end: string, type = "deep") => ({
    id,
    start,
    end,
    type,
    label: id,
  })

  it("positions blocks by their real times, so a gap renders as a gap", () => {
    // Stacking them in order would close an unplanned hour up, and an
    // unplanned hour should look unplanned.
    const html = renderArtifact(
      day([block("a", "08:00", "09:00"), block("b", "11:00", "12:00")]),
      "",
    )
    // 08:00 is the day start; 11:00 is 3h into a 10h day.
    expect(html).toContain("top:0%")
    expect(html).toContain("top:30%")
  })

  it("recedes a past block rather than dropping it", () => {
    // A morning that is gone is still why the afternoon looks as it does.
    const html = renderArtifact(
      day(
        [block("done", "08:00", "09:00"), block("next", "15:00", "16:00")],
        "13:00",
      ),
      "",
    )
    expect(html).toContain("opacity-45")
    expect(html).toContain(">done<")
  })

  it("draws the now line only inside the plotted day", () => {
    expect(
      renderArtifact(day([block("a", "08:00", "09:00")], "13:00"), ""),
    ).toContain('aria-label="Now: 13:00"')
    // A plan for another day carries no line rather than one pinned to an edge.
    expect(
      renderArtifact(day([block("a", "08:00", "09:00")], "21:00"), ""),
    ).not.toContain("Now: 21:00")
    expect(
      renderArtifact(day([block("a", "08:00", "09:00")]), ""),
    ).not.toContain("Now:")
  })

  it("says the type and the hours in words", () => {
    // The block's colour is the fast read; a screen reader gets neither that
    // nor the geometry.
    expect(renderArtifact(day([block("a", "09:00", "10:30")]), "")).toContain(
      "(deep, 09:00–10:30)",
    )
  })

  it("is page-only without asking", () => {
    expect(renderArtifact(day([block("a", "08:00", "09:00")]), "")).toContain(
      "hidden page-only:flex",
    )
  })

  it("rejects a time it cannot parse", () => {
    // An unparseable time positions every block at the top of the day rather
    // than failing, which reads as a plan that starts all at once.
    const errs = validateDoc(day([{ ...block("a", "9am", "10:30") }]))
    expect(errs.join(" ")).toContain("start must be HH:MM")
  })
})

describe("the co-change field", () => {
  const labels = ["a", "b", "c", "d"]
  const doc = (cells: object[], marks?: object[]): ArtifactDoc =>
    JSON.parse(
      JSON.stringify({
        slug: "s",
        generatedAt: "2026-07-30T09:00:00Z",
        stat: { value: 1, label: "x" },
        blocks: [
          {
            kind: "matrix",
            label: "Co-change",
            spec: { labels, cells, marks },
          },
        ],
      }),
    )

  it("mirrors a triangle rather than making the emitter say it twice", () => {
    const html = renderArtifact(doc([{ a: 0, b: 2, value: 9 }]), "")
    expect(html).toContain("a and c: 9")
    expect(html).toContain("c and a: 9")
  })

  it("leaves the diagonal blank rather than drawing a self-pair", () => {
    // A module co-changes with itself on every commit. Drawing that puts the
    // darkest cells on the one axis carrying no information, and sets the
    // scale against a number that means nothing.
    const html = renderArtifact(doc([{ a: 0, b: 1, value: 4 }]), "")
    expect(html).not.toContain("a and a")
  })

  it("marks a named pair with a ring, not a hotter fill", () => {
    // The fill already spends itself on magnitude; a second claim in the same
    // channel leaves a dark cell ambiguous.
    const html = renderArtifact(
      doc(
        [{ a: 0, b: 1, value: 4 }],
        [{ a: 0, b: 1, label: "no declared import" }],
      ),
      "",
    )
    expect(html).toContain("ring-ink")
    expect(html).toContain("no declared import")
  })

  it("needs four labels to read as a field", () => {
    const small = doc([{ a: 0, b: 1, value: 4 }])
    const block = small.blocks?.[0]
    if (block?.kind === "matrix") block.spec.labels = ["a", "b"]
    expect(renderArtifact(small, "")).not.toContain("Co-change")
  })

  it("rejects an index outside the label set", () => {
    // Out of range addresses no cell, so the pair silently does not appear and
    // the field looks sparser than the data is.
    expect(validateDoc(doc([{ a: 0, b: 9, value: 4 }])).join(" ")).toContain(
      "b must be an index into spec.labels",
    )
  })

  it("names both axes, so a hot cell is a fact the reader can repeat", () => {
    // Shipped for months with row headers only: a reader could see the cluster
    // and not say which pair any cell was. ADR-0047 specified `scope`-carrying
    // row *and column* headers; only half of it was built.
    const html = renderArtifact(doc([{ a: 0, b: 2, value: 9 }]), "")
    expect(html).toContain('scope="col"')
    expect(html).toContain('scope="row"')
  })

  it("draws every cell, including the empty ones", () => {
    // The grid is the structure the eye reads a cluster against. Empty pairs
    // left at 6% opacity on the surface colour turned the field into floating
    // dots — which is not a sparser matrix, it is no matrix at all.
    const html = renderArtifact(doc([{ a: 0, b: 2, value: 9 }]), "")
    expect(html).toContain("a and b: 0")
  })
})

describe("sparklines", () => {
  const row = (spark: number[]): ArtifactDoc => ({
    slug: "s",
    generatedAt: "2026-07-30T09:00:00Z",
    stat: { value: 1, label: "x" },
    blocks: [
      {
        kind: "queue",
        rows: [
          {
            id: "a",
            title: "a",
            values: [{ label: "trend", value: "↗", spark }],
          },
        ],
      },
    ],
  })

  it("draws a flat series on the midline rather than dividing by zero", () => {
    // Flat is a real shape and should read as one, not vanish.
    const html = renderArtifact(row([5, 5, 5]), "")
    expect(html).toContain("<svg")
    expect(html).not.toContain("NaN")
  })

  it("draws nothing from a single point", () => {
    expect(renderArtifact(row([5]), "")).not.toContain("trend trend")
  })

  it("keeps the printed figure beside the shape", () => {
    // The line is texture under a claim the row already states.
    expect(renderArtifact(row([1, 2, 3]), "")).toContain("↗")
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

describe("reviewDoc", () => {
  const doc = (values: unknown[]) => ({
    slug: "s",
    generatedAt: "2026-07-30T09:00:00Z",
    stat: { value: 1, label: "x" },
    blocks: [{ kind: "queue", rows: [{ id: "a", title: "a", values }] }],
  })

  it("flags a value that is a quantity and nothing else", () => {
    // The defect this exists for: a tile never shows the column header, so a
    // `threshold` column reading `3 / 0d / 5d / 1` is four numbers with no
    // stated basis anywhere on the surface a reader is looking at.
    const notes = reviewDoc(doc([{ label: "age", value: "20" }]))
    expect(notes).toHaveLength(1)
    expect(notes[0]).toContain('column "age"')
    expect(notes[0]).toContain('"20"')
  })

  it("passes a value carrying its own unit", () => {
    expect(reviewDoc(doc([{ label: "age", value: "20d" }]))).toEqual([])
    expect(reviewDoc(doc([{ label: "n", value: "1.4k" }]))).toEqual([])
    expect(reviewDoc(doc([{ label: "files", value: "3 files" }]))).toEqual([])
    expect(reviewDoc(doc([{ label: "share", value: "40%" }]))).toEqual([])
  })

  it("passes a threshold, because the operator is the basis", () => {
    // `≥ 1` and `> 7d` say what they are without a header. That is exactly the
    // emit the rule wants more of, so it must not be what the rule punishes.
    expect(reviewDoc(doc([{ label: "threshold", value: "≥ 1" }]))).toEqual([])
    expect(reviewDoc(doc([{ label: "threshold", value: "> 0d" }]))).toEqual([])
  })

  it("accepts `title` as the documented escape hatch", () => {
    // For a qualifier too long to ride the value, or a scale with no unit noun
    // — "5 impact" is not English. `title` is hover text plus an sr-only
    // phrase, so the basis still travels with the number.
    const notes = reviewDoc(
      doc([{ label: "impact", value: "5", title: "impact, 1-5" }]),
    )
    expect(notes).toEqual([])
  })

  it("reports a column once, not a cell at a time", () => {
    // A unit is a property of the column — whoever fixes this edits one emit —
    // and a bare column is bare on every row, so per-cell notes would print
    // the same sentence N times and bury the columns that are fine.
    const notes = reviewDoc({
      slug: "s",
      generatedAt: "2026-07-30T09:00:00Z",
      stat: { value: 1, label: "x" },
      blocks: [
        {
          kind: "queue",
          rows: [
            { id: "a", title: "a", values: [{ label: "n", value: "1" }] },
            { id: "b", title: "b", values: [{ label: "n", value: "2" }] },
            { id: "c", title: "c", values: [{ label: "n", value: "3d" }] },
          ],
        },
      ],
    })
    expect(notes).toHaveLength(1)
    expect(notes[0]).toContain("2 of 3 rows")
  })

  it("reads rows out of groups as well as loose rows", () => {
    const notes = reviewDoc({
      slug: "s",
      generatedAt: "2026-07-30T09:00:00Z",
      stat: { value: 1, label: "x" },
      blocks: [
        {
          kind: "queue",
          groups: [
            {
              id: "g",
              label: "G",
              rows: [
                { id: "a", title: "a", values: [{ label: "n", value: "7" }] },
              ],
            },
          ],
        },
      ],
    })
    expect(notes).toHaveLength(1)
  })

  it("says nothing about the kit's own fixtures", () => {
    // The fixtures are what every archetype's sample is rendered from, so a
    // note here would ship as the worked example of the emit it warns about.
    const dir = new URL("../fixtures/", import.meta.url)
    for (const f of readdirSync(dir)) {
      const parsed: unknown = JSON.parse(readFileSync(new URL(f, dir), "utf8"))
      expect(reviewDoc(parsed), f).toEqual([])
    }
  })
})
