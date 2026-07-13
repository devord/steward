/**
 * Contact sheet for a widget artifact: renders it at every real tile size
 * plus the full view, framed exactly as the dashboard frames it
 * (frameArtifactHtml — footer hidden, tile guard + stamp, theme override),
 * and screenshots one sheet per theme with headless Chrome.
 *
 * The artifact goes inside `<iframe srcdoc sandbox="allow-scripts">` — the
 * board's own mechanism — because headless Chrome clamps its window to
 * ~500×288, so small tiles can't be honest viewports on their own.
 *
 *   node scripts/artifact-sheet.ts <artifact.html> [--theme <name>]... [--out <dir>]
 *
 * Defaults: gruvbox-dark + gruvbox-light sheets, written next to the
 * artifact as <name>-<theme>.png. Iterate on docs/samples/* with this
 * before touching the widget-artifact skill's design language.
 */
import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  frameArtifactHtml,
  themeNames,
  themes,
  type ThemeName,
} from "../apps/web/app/lib/theme.ts"

const CHROME =
  process.env.CHROME_BIN ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

/** Board cells ≈ 291px (1200 canvas, 4 columns, 12px gap); rows 150px. */
const SIZES = [
  { label: "1×1", w: 291, h: 150, view: "tile" },
  { label: "2×1", w: 594, h: 150, view: "tile" },
  { label: "2×2", w: 594, h: 312, view: "tile" },
  { label: "4×2", w: 1200, h: 312, view: "tile" },
  { label: "4×4", w: 1200, h: 636, view: "tile" },
  { label: "full view", w: 1400, h: 820, view: "full" },
] as const

function escAttr(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll('"', "&quot;")
}

const args = process.argv.slice(2)
const file = args.find((a) => !a.startsWith("--"))
if (!file) {
  console.error(
    "usage: node scripts/artifact-sheet.ts <artifact.html> [--theme <name>]... [--out <dir>]",
  )
  process.exit(1)
}
const themeArgs: ThemeName[] = []
for (let i = 0; i < args.length; i++) {
  if (args[i] !== "--theme") continue
  const requested = args[++i]
  const known = themeNames.find((n) => n === requested)
  if (!known) {
    console.error(
      `unknown theme: ${requested} (known: ${themeNames.join(", ")})`,
    )
    process.exit(1)
  }
  themeArgs.push(known)
}
const sheetThemes: ThemeName[] = themeArgs.length
  ? themeArgs
  : ["gruvbox-dark", "gruvbox-light"]
const outIdx = args.indexOf("--out")
const outDir = outIdx >= 0 ? args[outIdx + 1] : path.dirname(file)

const html = readFileSync(file, "utf8")
const name = path.basename(file, ".html")
mkdirSync(outDir, { recursive: true })
const tmpDir = path.join(os.tmpdir(), "steward-artifact-sheet")
mkdirSync(tmpDir, { recursive: true })

for (const themeName of sheetThemes) {
  const t = themes[themeName]
  const cells = SIZES.map(({ label, w, h, view }) => {
    const framed = frameArtifactHtml(html, themeName, view)
    return (
      `<div><p>${label} — ${w}×${h}</p>` +
      `<iframe sandbox="allow-scripts" srcdoc="${escAttr(framed)}"` +
      ` style="width:${w}px;height:${h}px"></iframe></div>`
    )
  }).join("")
  const sheet =
    `<!doctype html><html><head><meta charset="utf-8"><style>` +
    `body{margin:0;padding:24px;background:${t.tokens.bg};display:grid;` +
    `gap:20px;justify-items:start;font:12px ui-monospace,Menlo,monospace}` +
    `p{color:${t.tokens.inkDim};margin:0 0 6px}` +
    `iframe{border:1px solid ${t.tokens.border};border-radius:8px;display:block}` +
    `</style></head><body>${cells}</body></html>`
  const tmp = path.join(tmpDir, `${name}-${themeName}.html`)
  writeFileSync(tmp, sheet)
  const out = path.join(outDir, `${name}-${themeName}.png`)
  const height = SIZES.reduce((a, s) => a + s.h + 44, 48)
  execFileSync(
    CHROME,
    [
      "--headless",
      "--disable-gpu",
      "--hide-scrollbars",
      `--screenshot=${out}`,
      `--window-size=1480,${height}`,
      "--virtual-time-budget=8000",
      `file://${tmp}`,
    ],
    { stdio: "pipe" },
  )
  console.log(out)
}
