/**
 * Proof sheets for the mark: what it actually looks like, at the sizes it is
 * actually seen, on the grounds it actually sits on (ADR-0054).
 *
 *   node scripts/mark-sheet.ts
 *
 * Writes PNGs to `brand/proof/`. Local-only, like `render-icons.sh` and for
 * the same reason: headless Chrome does not rasterise identically across
 * machines, so these cannot be a CI drift check. The gates that *can* fail
 * automatically are in `mark.test.ts` and `theme.test.ts`; this is the
 * instrument for the judgement they cannot make, and the artefact an agent
 * reads when it needs to know how the mark renders rather than how it is
 * described. The mark shipped at 1.40:1 with every test green because nobody
 * had looked at it small since the geometry last moved.
 *
 * ## Two passes, and why
 *
 * The whole question is what survives at 16 device pixels, so pass one renders
 * every mark at its true size with `--force-device-scale-factor=1` and
 * screenshots that — the honest raster, antialiasing and all. Pass two embeds
 * that PNG and blows the cells up with `image-rendering: pixelated`, so the
 * magnified view shows the pixels Chrome produced rather than a clean
 * re-render of the vector at a larger size. Rendering the SVG at 8× would
 * answer a question nobody is asking.
 *
 * This script briefly grew a mode per design question — candidate cuts, tile
 * fill, colourways, hues. Those were scaffolding for a decision that has been
 * made (ADR-0053) and they are gone; what stays is the sheet you look at when
 * the mark or the palette moves.
 */
import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  buildMark,
  CHIP_TILT,
  CHIP_VIEWBOX,
  GLYPH_VIEWBOX,
  MARK_MINIMUM,
  MARK_SPAN,
  squirclePath,
  TILE_GRADIENT,
} from "../apps/web/app/lib/mark.ts"
import {
  CHIP_IDENTITY,
  MARK_IDENTITY,
  themeEntries,
  type ThemeMode,
} from "../apps/web/app/lib/theme.ts"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const outDir = path.join(root, "brand", "proof")
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

/** Cell box in pass one. Wide enough for the largest mark plus air. */
const CELL = 88
/** Every cell's magnified view lands near this width, so the sheet reads. */
const ZOOM_TARGET = 132

type Framing = "chip" | "glyph"
type Cell = { framing: Framing; size: number; ground: string; mode: ThemeMode }
type Row = { label: string; note?: string; cells: Cell[] }

const { wingL, wingR } = buildMark()
const TILE = squirclePath()

/** The bare glyph, level, in the mode's flat ember. */
function glyphSvg(mode: ThemeMode, px: number): string {
  const h = Math.round(
    (px * Number(GLYPH_VIEWBOX.split(" ")[3])) / MARK_SPAN.glyph,
  )
  const ink = MARK_IDENTITY[mode].wingFlat
  return `<svg width="${px}" height="${h}" viewBox="${GLYPH_VIEWBOX}">
    <path d="${wingL}" fill="${ink}"/><path d="${wingR}" fill="${ink}"/></svg>`
}

/** The chip: one colourway, the bow cut out of the drenched tile and turned. */
function chipSvg(px: number, id: string): string {
  const { tileTop, tileDeep, bow } = CHIP_IDENTITY
  const g = TILE_GRADIENT
  return `<svg width="${px}" height="${px}" viewBox="${CHIP_VIEWBOX}">
    <defs>
      <linearGradient id="t${id}" gradientUnits="userSpaceOnUse" x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}">
        <stop offset="0" stop-color="${tileTop}"/><stop offset="1" stop-color="${tileDeep}"/>
      </linearGradient>
    </defs>
    <path d="${TILE}" fill="url(#t${id})"/>
    <g transform="rotate(${CHIP_TILT} 32 32)">
      <path d="${wingL}" fill="${bow}"/><path d="${wingR}" fill="${bow}"/>
    </g>
  </svg>`
}

const cellSvg = (c: Cell, id: string) =>
  c.framing === "chip" ? chipSvg(c.size, id) : glyphSvg(c.mode, c.size)

// ─────────────────────────────────────────────────────────────── rendering

function chrome(html: string, w: number, h: number, out: string, dsf: number) {
  const tmp = path.join(
    os.tmpdir(),
    `steward-mark-sheet-${path.basename(out, ".png")}.html`,
  )
  writeFileSync(tmp, html)
  execFileSync(
    CHROME,
    [
      "--headless",
      "--disable-gpu",
      "--hide-scrollbars",
      `--force-device-scale-factor=${dsf}`,
      `--window-size=${w},${h}`,
      "--virtual-time-budget=4000",
      `--screenshot=${out}`,
      `file://${tmp}`,
    ],
    { stdio: ["ignore", "ignore", "ignore"] },
  )
  rmSync(tmp, { force: true })
}

/**
 * Pass one: every cell at its true device size on its true ground, laid out on
 * a rigid grid so pass two can crop by arithmetic rather than by search.
 */
function truthPng(rows: Row[], file: string): { w: number; h: number } {
  const w = Math.max(...rows.map((r) => r.cells.length)) * CELL
  const h = rows.length * CELL
  const cells = rows
    .flatMap((row, y) =>
      row.cells.map(
        (c, x) =>
          `<div style="position:absolute;left:${x * CELL}px;top:${y * CELL}px;width:${CELL}px;height:${CELL}px;background:${c.ground};display:flex;align-items:center;justify-content:center">${cellSvg(c, `${y}_${x}`)}</div>`,
      ),
    )
    .join("")
  chrome(
    `<!doctype html><meta charset=utf-8><style>html,body{margin:0;background:#000}</style><div style="position:relative;width:${w}px;height:${h}px">${cells}</div>`,
    w,
    h,
    file,
    1,
  )
  return { w, h }
}

/**
 * Pass two: the readable sheet. The truth raster is embedded and cropped by
 * CSS, once at 1:1 and once magnified with nearest-neighbour, so what the
 * reader enlarges is the 16px render itself.
 */
function composeSheet(
  rows: Row[],
  truth: string,
  dims: { w: number; h: number },
  title: string,
  out: string,
) {
  const data = `data:image/png;base64,${readFileSync(truth).toString("base64")}`
  const crop = (x: number, y: number, size: number, zoom: number) => {
    const box = size + 8 // a little air, so an edge case at the rim still shows
    const ox = x * CELL + (CELL - box) / 2
    const oy = y * CELL + (CELL - box) / 2
    return `<div class="crop" style="width:${box * zoom}px;height:${box * zoom}px;background-image:url(${data});background-size:${dims.w * zoom}px ${dims.h * zoom}px;background-position:${-ox * zoom}px ${-oy * zoom}px"></div>`
  }
  const body = rows
    .map((row, y) => {
      const heads = row.cells
        .map((c) => `<th>${c.framing} · ${c.size}px</th>`)
        .join("")
      const actual = row.cells
        .map((c, x) => `<td>${crop(x, y, c.size, 1)}</td>`)
        .join("")
      const zoomed = row.cells
        .map((c, x) => {
          const z = Math.max(2, Math.round(ZOOM_TARGET / (c.size + 8)))
          return `<td>${crop(x, y, c.size, z)}<div class="z">×${z}</div></td>`
        })
        .join("")
      return `<section><h2>${row.label}${row.note ? `<span> — ${row.note}</span>` : ""}</h2>
        <table><tr>${heads}</tr><tr class="a">${actual}</tr><tr>${zoomed}</tr></table></section>`
    })
    .join("")
  const html = `<!doctype html><meta charset=utf-8><style>
    :root{color-scheme:light}
    body{margin:0;padding:28px 32px;background:#fbf1c7;color:#3c3836;
      font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
    h1{font-size:15px;margin:0 0 4px;letter-spacing:-.2px}
    p.sub{margin:0 0 22px;color:#7c6f64}
    section{margin:0 0 26px}
    h2{font-size:13px;font-weight:600;margin:0 0 8px}
    h2 span{font-weight:400;color:#7c6f64}
    table{border-collapse:collapse}
    th{font-size:11px;font-weight:400;color:#7c6f64;text-align:center;padding:0 10px 4px}
    td{padding:4px 10px 2px;text-align:center;vertical-align:bottom}
    tr.a td{border-bottom:1px solid #ddccab;padding-bottom:10px}
    .crop{display:inline-block;image-rendering:pixelated;outline:1px solid #ddccab;outline-offset:2px}
    .z{font-size:10px;color:#928374;margin-top:5px}
  </style>
  <h1>${title}</h1>
  <p class="sub">Rendered at true device pixels (1×), then magnified with nearest-neighbour — the magnified view is the 1× raster, not a re-render.</p>
  ${body}`
  const rowHeight = (row: Row) => {
    const box = Math.max(...row.cells.map((c) => c.size + 8))
    const zoom = Math.max(
      ...row.cells.map(
        (c) =>
          (c.size + 8) * Math.max(2, Math.round(ZOOM_TARGET / (c.size + 8))),
      ),
    )
    return 49 + box + 14 + zoom + 21 + 26
  }
  // Size the window to the content: given a window much taller than the page,
  // headless Chrome paints the document a second time at the bottom.
  chrome(
    html,
    120 + Math.max(...rows.map((r) => r.cells.length)) * (ZOOM_TARGET + 22),
    118 + rows.reduce((sum, r) => sum + rowHeight(r), 0) + 28,
    out,
    2,
  )
  execFileSync("magick", [
    out,
    "-background",
    "#fbf1c7",
    "-trim",
    "+repage",
    "-bordercolor",
    "#fbf1c7",
    "-border",
    "40",
    out,
  ])
}

function sheet(rows: Row[], title: string, name: string) {
  const truth = path.join(outDir, `.${name}-truth.png`)
  const dims = truthPng(rows, truth)
  composeSheet(rows, truth, dims, title, path.join(outDir, `${name}.png`))
  rmSync(truth, { force: true })
  console.log(`  brand/proof/${name}.png`)
}

// ─────────────────────────────────────────────────────────────── the sheets

mkdirSync(outDir, { recursive: true })

const SIZES = [16, 20, 24, 32, 64]
const themesOf = (mode: ThemeMode) =>
  themeEntries.filter(([, t]) => t.mode === mode)

for (const mode of ["light", "dark"] as const) {
  const page = themesOf(mode)[0][1].tokens
  sheet(
    [
      {
        label: "the chip",
        note: "one colourway in both modes — a saturated object, not a surface",
        cells: SIZES.map((size) => ({
          framing: "chip" as const,
          size,
          ground: page.bg,
          mode,
        })),
      },
      {
        label: "the bare glyph, on the page",
        note: "flat ember on a surface it does not own",
        cells: SIZES.map((size) => ({
          framing: "glyph" as const,
          size,
          ground: page.bg,
          mode,
        })),
      },
      {
        label: "the bare glyph, on the sidebar",
        note: "where you read it every day",
        cells: SIZES.map((size) => ({
          framing: "glyph" as const,
          size,
          ground: page.bg1,
          mode,
        })),
      },
    ],
    `Steward mark — ${mode} surfaces`,
    `mark-${mode}`,
  )
}

// Every ground the mark is asked to hold, at the two sizes chrome uses it.
for (const mode of ["light", "dark"] as const) {
  sheet(
    themesOf(mode).map(([name, theme]) => ({
      label: name,
      cells: [
        {
          framing: "glyph" as const,
          size: MARK_MINIMUM.glyph,
          ground: theme.tokens.bg,
          mode,
        },
        {
          framing: "glyph" as const,
          size: MARK_MINIMUM.glyph,
          ground: theme.tokens.bg1,
          mode,
        },
        {
          framing: "chip" as const,
          size: MARK_MINIMUM.chip,
          ground: theme.tokens.bg,
          mode,
        },
      ],
    })),
    `Every ${mode} ground — page, sidebar, chip`,
    `grounds-${mode}`,
  )
}

// The chip's real habitat: browser and forge chrome, which is not Steward's.
sheet(
  [
    {
      label: "the tab strip and the forge",
      note: "Chrome light and dark, GitHub light and dark",
      cells: (["#dee1e6", "#202124", "#ffffff", "#0d1117"] as const).flatMap(
        (ground) =>
          [16, 32].map((size) => ({
            framing: "chip" as const,
            size,
            ground,
            mode: "light" as const,
          })),
      ),
    },
  ],
  "The chip where it actually lands",
  "chip-in-the-wild",
)
