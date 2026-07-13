# Artifacts borrow the chrome mono: the frame injects Geist Mono

The chrome's monospace is Steward's brand voice — the wordmark, widget
titles, timestamps, and every machine string set in it — and it became a
designed face (Geist Mono Variable, bundled via fontsource) when the
chrome moved off the system mono stack. Artifacts, though, are
self-contained single files with a hard no-network rule (widget-standard
§1): they can't load a webfont, so their mono stayed
`ui-monospace, "SF Mono", Menlo, monospace` — a different face per
platform, and none of them the brand's. The board read as two type
systems: chrome in Geist Mono, every widget's content in whatever the OS
ships.

Decision, in the standard's two usual layers:

- **Platform**: `frameArtifactHtml` gains a font injection alongside the
  theme injection (ADR-0009) — a `<style data-steward-font>` block whose
  `@font-face` supplies "Geist Mono Variable" as an inlined woff2 data URI
  (latin subset, ~30 kB base64). A data URI, never an asset URL: the
  sandboxed iframe has an opaque origin, so fetching even a same-origin
  font would be blocked as cross-origin. `theme.ts` stays platform-pure —
  it exports `artifactFontStyle(dataUri)` and each host inlines the file
  its own way (widget-card via Vite `?inline`, artifact-sheet via
  `readFileSync`), so the module keeps working in the browser bundle and
  under plain Node.
- **Contract** (widget-standard §6, the widget-artifact skill): the
  artifact's `--font-mono` token leads with `"Geist Mono Variable"`,
  followed by the old system stack. The artifact itself still loads
  nothing — the family name is a hook that resolves only where the host
  provides the face. Framed on the board (tile, lightbox, contact sheet)
  it renders the brand mono; opened raw it falls back to the system mono
  after the comma.

The injection is render-time and in-memory, like the theme override:
nothing is added to published files, so data repos don't grow and
already-published artifacts pick the face up immediately — the leading
family name only reaches new artifacts as routines rerun, which is the
same eventual-consistency every contract change rides (widget-standard
§6's own note on type sizes).

## Considered options

- **Inline the woff2 into every artifact** — works standalone too, but
  adds ~40 kB base64 to every published HTML file, re-committed on every
  run in the data repo's history, duplicated across every widget. The
  raw page is a debug surface; paying repo growth forever to brand it is
  the wrong trade.
- **`@font-face` with an app asset URL** — smallest injection, but dead
  on arrival: the sandbox's opaque origin fails the font fetch, and the
  artifact would silently fall back anyway.
- **Keep system mono in artifacts** — zero surface change, but the board
  permanently reads as two type systems, and the most content-dense
  pixels never carry the brand face. Rejected: widgets are the content
  that glows; they deserve the designed mono most.

## Consequences

- Artifacts match the chrome's mono on every framed surface, on every
  platform, including Windows/Linux where `ui-monospace` degrades worst.
- The raw artifact page renders in the system mono — accepted; it links
  and reads correctly, just without the brand face.
- Each mounted iframe carries its own ~40 kB srcdoc overhead (base64 in
  memory, shared woff2 bytes in Chrome's font cache). At board scale
  (tens of widgets) this is noise.
- `scripts/artifact-sheet.ts` must keep passing the font style; a sheet
  rendered without it lies about tile typography.
