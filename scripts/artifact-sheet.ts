/**
 * Contact sheet for a widget artifact: renders it at every real tile size
 * plus the full view, framed exactly as the dashboard frames it
 * (frameArtifactHtml — footer hidden, tile guard + stamp, theme override, and
 * the runtimes the kit's hidden controls wait for), and screenshots one sheet
 * per theme with headless Chrome.
 *
 * The artifact goes inside `<iframe srcdoc sandbox="allow-scripts">` — the
 * board's own mechanism — because headless Chrome clamps its window to
 * ~500×288, so small tiles can't be honest viewports on their own.
 *
 *   node scripts/artifact-sheet.ts <artifact.html> [--theme <name>]... [--out <dir>]
 *
 * Defaults: gruvbox-dark + gruvbox-light sheets, written next to the
 * artifact as <name>-<theme>.png.
 *
 * This is the **primary visual gate** on a kit change (ADR-0050): render a
 * fixture through `render.mjs` and put the sheet in front of a human. Nearly
 * every layout defect the kit has shipped was found this way rather than by a
 * test — a stranded heading, a cropped band, a tile advertising its calmest
 * rows. A blank tier is usually a flaky capture; re-run before believing it.
 */
import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  artifactFontStyle,
  artifactKitStyle,
  artifactThroughputScript,
  frameArtifactHtml,
  themeNames,
  themes,
  type ThemeName,
} from "../apps/web/app/lib/theme.ts"

// The board injects the chrome mono into every frame (ADR-0031); the sheet
// must too, or its tiles lie about the type. Plain Node has no Vite ?inline,
// so read the woff2 from the web app's own dependency.
const ARTIFACT_FONT_STYLE = artifactFontStyle(
  "data:font/woff2;base64," +
    readFileSync(
      new URL(
        "../apps/web/node_modules/@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2",
        import.meta.url,
      ),
    ).toString("base64"),
)

// The board injects the kit stylesheet into every frame (ADR-0050), so a
// sheet that skipped it would render the artifact against whatever CSS it was
// published with — which is exactly the drift the injection exists to hide.
// Read from disk for the same reason as the font: plain Node has no Vite
// `?raw`.
const ARTIFACT_KIT_STYLE = artifactKitStyle(
  readFileSync(
    new URL("../.claude/skills/widget-artifact/kit/kit.css", import.meta.url),
    "utf8",
  ),
)

// The throughput band ships every control `hidden` (ADR-0039) and the board
// injects this to reveal them. Without it the sheet is the one viewer that
// sees a band the board never shows: columns under a row of controls that
// aren't there — so the gate would pass a broken toggle without comment.
// Read from disk for the same reason as the two above.
const ARTIFACT_THROUGHPUT_SCRIPT = artifactThroughputScript(
  readFileSync(
    new URL(
      "../.claude/skills/widget-artifact/kit/throughput.js",
      import.meta.url,
    ),
    "utf8",
  ),
)

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
    const framed = frameArtifactHtml(
      html,
      themeName,
      view,
      ARTIFACT_FONT_STYLE,
      undefined,
      ARTIFACT_KIT_STYLE,
      ARTIFACT_THROUGHPUT_SCRIPT,
    )
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
