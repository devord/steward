# Widget standard

The contract between the dashboard grid and the artifacts routines publish.
The `widget-artifact` skill (M4) enforces this when authoring; the dashboard
relies on it when rendering. Grid bounds are encoded in
`packages/schema/src/dashboard.ts`.

## The grid (dashboard side)

- CSS grid: the board's own **`grid.columns`** on desktop (default **4**,
  up to **6**), 2 on tablet, 1 on phone.
- Row unit **≈ 150 px** by default (`grid.rowHeight`, adjustable as board
  density), **12 px** gap. Canvas width is `grid.width` — `fixed` (centered)
  or `wide` (fills a large monitor).
- A widget declares `size: { cols: 1..columns, rows: 1..6 }` and a
  `position: { col, row }` in `data/dashboards/<slug>.yaml`.
- The widget body is an iframe:
  `<iframe srcdoc={artifactHtml} sandbox="allow-scripts">` — scripts allowed,
  **no** `allow-same-origin`, and the sandbox has no network.

## The artifact (inside the iframe)

Because the iframe _is_ the widget body, plain `@media` queries inside the
artifact respond to the widget's size — no postMessage protocol, no resize
observer, no JS required.

An artifact MUST:

1. **Be one self-contained HTML file.** No external requests of any kind —
   no CDNs, no web fonts, no `fetch`, no images by URL. Inline everything;
   the sandbox blocks the network, so anything external simply breaks.
2. **Respond to the standard breakpoints**, aligned with grid cell sizes:
   - width: `≤ 340 px` (1 col) / `≤ 700 px` (2 col) / wider
   - height: `≤ 160 px` (1 row) / taller
     A 1×1 widget shows the KPI essence; larger sizes add detail progressively
     (KPI row → line items → sparkline).
   - **Full view** (`≥ ~900 px` wide): the dashboard can lift any widget into
     a full-screen overlay — the same sandboxed, theme-injected iframe at
     nearly the whole viewport — so the reader sees every row of data. Author
     for it: the widest tier must read like a page, not a stretched cell. Cap
     the content column (a `max-width` around `72ch`/`900 px`, centered) so
     text never runs edge-to-edge on a wide monitor, and spend the extra
     height on the fullest detail level (all line items, full history, the
     large sparkline) rather than scaling one number up. There is no separate
     full-screen artifact to author — the one published file must serve the
     1×1 glance and the full page through its `@media` queries alone.
3. **Use the shared theme tokens** — the gruvbox-dark-hard palette as CSS
   custom properties with `color-scheme: dark`. The canonical values live in
   the theme registry (`apps/web/app/lib/theme.ts`, the gruvbox-dark entry);
   the `widget-artifact` skill inlines the same set. Do not invent colors,
   and always paint via `var(--color-*)`: when the user picks another theme,
   the dashboard appends an override of those same custom properties inside
   the iframe (ADR-0009) — hard-coded hexes won't retheme.
4. **Carry its generation time**:
   `<meta name="widget-generated-at" content="<ISO-8601>">` plus a visible
   compact timestamp in a `<footer>`. That footer is the artifact's
   _standalone_ chrome — for when it's opened raw. On the dashboard the
   widget-card's title bar already shows the routine name and freshness, so
   the frame hides the artifact's own `<footer>` to avoid writing the identity
   and run time twice.
5. **Degrade gracefully** when data is missing — an empty state is part of
   the artifact, not an error.

## Addressing & freshness

- Address: data repo, `artifacts` branch, `w/<slug>/index.html` — fixed the
  moment the routine is configured (ADR-0002).
- Freshness: the last commit touching that path is the widget's "Ran Xh ago"
  freshness readout; a run overdue relative to the routine's schedule shows a
  staleness badge. Never published → placeholder card.
