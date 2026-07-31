import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { escapeContextBlock, footerTimestamp } from "./Shell.tsx"
import { type ArtifactDoc, renderArtifact } from "./render.tsx"
import type { SeriesSpec } from "./components/Series.tsx"
import type { Verdict } from "./components/VerdictBand.tsx"
import { validateDoc } from "./validate-doc.ts"

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
    // Three redundant encodings, picked together by the level so no caller can
    // separate them: the state has to survive colour-vision deficiency,
    // grayscale and forced-colors, and two of the three carry no colour.
    const levels: [Verdict["level"], string][] = [
      ["good", "bg-green"],
      ["attn", "bg-orange"],
      ["bad", "bg-red"],
      ["pending", "bg-ink-dim"],
    ]
    for (const [level, dot] of levels) {
      const html = verdict({ level, word: "X" })
      expect(html, level).toContain(dot) // 1. the dot
      expect(html, level).toContain(">X<") // 2. the word
      expect(html, level).toContain("<svg") // 3. the glyph
    }
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
    expect(html).toContain("▲")
    expect(html).toContain("3d")
    // Ink-dim whichever way it points: `▼` is good news on a slip and bad on a
    // burn-up, so a tone here would have to be per-column.
    const d = html.slice(html.indexOf("▲") - 120, html.indexOf("▲"))
    expect(d).toContain("text-ink-dim")
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
    // The pin rides the row's own <tbody> — the same element carrying
    // `data-fit-item`, because the trimmable unit and the pinnable one have to
    // be the same thing for the pass to honour one against the other.
    const unit = (title: string) =>
      html.slice(
        html.lastIndexOf("<tbody", html.indexOf(title)),
        html.indexOf(title),
      )
    expect(unit("Load-bearing")).toContain("data-fit-keep")
    expect(unit("Ordinary")).not.toContain("data-fit-keep")
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
  const chart = (lines: SeriesSpec["lines"], max = 40): ArtifactDoc => ({
    slug: "s",
    generatedAt: "2026-07-30T09:00:00Z",
    stat: { value: 1, label: "x" },
    blocks: [
      {
        kind: "series",
        label: "Burn-up",
        spec: { from: "2026-07-01", to: "2026-08-01", max, lines },
      },
    ],
  })
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
    const html = renderArtifact(
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
      "",
    )
    const ys = [
      ...html.matchAll(
        /<text x="[\d.]+" y="([\d.]+)"[^>]*>[^<]*(?:landed|review)/g,
      ),
    ].map((m) => Number(m[1]))
    expect(ys).toHaveLength(2)
    expect(Math.abs(ys[0] - ys[1])).toBeGreaterThanOrEqual(14)
  })

  it("anchors the marker to the point, never to the nudged label", () => {
    // The label moves to stay legible; the dot must not, or the chart reports
    // a value it did not plot.
    const html = renderArtifact(chart([hero]), "")
    const cy = Number(/<circle cx="[\d.]+" cy="([\d.]+)"/.exec(html)?.[1])
    // y=16 of 40 over a 220px plot inset 12 from the top: 232 - 16/40*220.
    expect(cy).toBeCloseTo(232 - (16 / 40) * 220, 1)
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
    expect(html).toContain("a ↔ c: 9")
    expect(html).toContain("c ↔ a: 9")
  })

  it("leaves the diagonal blank rather than drawing a self-pair", () => {
    // A module co-changes with itself on every commit. Drawing that puts the
    // darkest cells on the one axis carrying no information, and sets the
    // scale against a number that means nothing.
    const html = renderArtifact(doc([{ a: 0, b: 1, value: 4 }]), "")
    expect(html).not.toContain("a ↔ a")
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
