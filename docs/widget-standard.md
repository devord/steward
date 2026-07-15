# Widget standard

The contract between the dashboard grid and the artifacts routines publish.
The `widget-artifact` skill (M4) enforces this when authoring; the dashboard
relies on it when rendering. Grid bounds are encoded in
`packages/schema/src/dashboard.ts`.

## The grid (dashboard side)

- A react-grid-layout grid (ADR-0041): the board's own **`grid.columns`** on
  desktop (default **4**, up to **6**), 2 on tablet, 1 on phone. In edit mode,
  dragging a widget onto or between others slides the neighbours aside
  (vertical compaction — a displaced widget floats back up once the space frees).
- Row unit **≈ 150 px** by default (`grid.rowHeight`, adjustable as board
  density), **12 px** gap. Canvas width is `grid.width` — `fixed` (centered)
  or `wide` (fills a large monitor).
- A widget declares `size: { cols: 1..columns, rows: 1..6 }` and a
  `position: { col, row }` in `data/dashboards/<slug>.yaml` (1-indexed; the
  board maps it to the grid engine's own 0-indexed layout).
- The widget body is an iframe:
  `<iframe srcdoc={artifactHtml} sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox">`
  — scripts allowed, links open real new tabs (ADR-0028), **no**
  `allow-same-origin`, no in-frame navigation, and the sandbox has no
  network.
- **Tiles never scroll** (ADR-0019). The frame pins `overflow: hidden`
  inside the tile iframe and stamps `data-steward-tile` on the artifact's
  `<html>`; if content overflows anyway, the frame fades the bottom edge out
  so the truncation is visible ("there's more — expand"), never an ambiguous
  mid-line crop. The full view scrolls freely — that's where every row lives.

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
     (KPI row → line items → sparkline). **Fit the height at every tier**:
     tiles never scroll and the frame clips overflow (ADR-0019), so content
     that doesn't fit must degrade to fewer items plus a visible `+N more`
     line — silent cropping is a contract violation. Gate the fit-to-height
     measurement on `html[data-steward-tile]` (the board's stamp) so the raw
     page and the full view keep every row; the `widget-artifact` skill
     carries the reference snippet.
   - **Full view** (`≥ ~900 px` wide): the dashboard can lift any widget into
     a full-screen overlay — the same sandboxed, theme-injected iframe at
     nearly the whole viewport — so the reader sees every row of data. Author
     for it: the widest tier must read like a page, not a stretched cell. The
     artifact **fills the full width it is given** — the board controls the
     widget's width, so the content is never capped; a ledger/table artifact
     wants its columns to breathe edge to edge. (The one exception is
     long-form prose: cap the measure on the text block itself, ~`72ch`, not
     on the whole artifact.) Spend the extra height on the fullest detail
     level (all line items, full history, the large sparkline) rather than
     scaling one number up. There is no separate full-screen artifact to
     author — the one published file must serve the 1×1 glance and the full
     page through its `@media` queries alone.
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
6. **Type at a readable floor.** The artifact is the content that glows, so
   it never reads smaller than the chrome around it: body/data text at
   **14px**, section labels at **12px** (the absolute floor — nothing
   smaller, no faint sub-12px uppercase eyebrow). Earn hierarchy with weight,
   color, and the palette accents, not by shrinking type. The 1×1 tier leans
   on its KPI number; detail tiers carry the 14px body. (Type sizes are baked
   into each published file — a rescale only lands when the routine reruns.)
   The `--font-mono` token leads with `"Geist Mono Variable"` — the chrome's
   mono — but the artifact still loads no webfont itself (rule 1 holds): the
   dashboard injects the face into the iframe at render time, the same way it
   injects the theme (ADR-0031), and the raw page falls back to the system
   mono.
7. **Link out, in a new tab.** Anything the artifact names that lives
   elsewhere — a PR, an issue, an event — is an anchor to it; the tile is
   triage, the source system is the follow-through. Every `<a href>`
   carries `target="_blank" rel="noopener"`: in-frame navigation is
   sandbox-blocked (ADR-0028), so a bare href goes nowhere on the raw
   page. (On the board the frame retargets forgotten anchors as a
   backstop.) Style links with the design language's link component —
   calm ink, never browser blue.
8. **Compose from the shared design language** (ADR-0027). The
   `widget-artifact` skill's `design.md` defines the component set —
   shell, section rules, ledger rows, the stat tier, pills, dots, meters,
   sparklines, empty states — and the per-tier playbook. Artifacts pick
   from it rather than inventing per-routine visuals, so a board of
   widgets from different routines reads as one product; the canonical
   samples live in `docs/samples/`. These double as the built-in templates'
   picker previews (ADR-0037) — keyed to the template by basename — so a
   repo template can ship its own preview as a
   `templates/routines/<id>.sample.html` sibling.

## Person-relative content (ADR-0039)

An artifact is authored once and rendered for whoever can see the board, so
"you" is a **render-time** fact, never the routine runner. Two shapes:

- **Person-owned** (a daily plan, a personal digest — one subject): name the
  owner in the **third person** — "Daniel's Daily Plan," "Daniel has 3 deep
  blocks left" — resolved at build time, because the subject is fixed at
  build time. Never "your" — a stranger opening the board must read _whose_
  it is, not a false second person.
- **Shared with per-viewer facets** (a PR queue, a repo pulse — meaningful
  to everyone, but "yours"/"needs your review" differ per reader): publish
  **viewer-neutral**, then resolve the viewer at render time.

For the shared shape:

1. **The static render is neutral and honest.** Group by an objective axis
   (e.g. PRs by state), carry no "you"/"yours", and stamp each row with the
   raw relationship data it needs (`data-author`, directly-requested
   reviewers) — never a pre-computed "mine". This is what the raw page, and
   a viewer with no stake, see.
2. **Read the injected viewer.** On the board the frame sets
   `window.__STEWARD_VIEWER__ = { login, name? }` inside the iframe (same
   render-time injection as the theme and font). Read it in a
   `DOMContentLoaded` handler — never at parse time — and treat it as
   possibly `undefined` (the raw page injects nothing).
3. **Enhance progressively, degrade to neutral.** If the viewer participates
   (authors or is directly requested on a row), re-group into the
   second-person view ("Needs your review" / "Yours") and relabel; wrap it
   in `try`/`catch` so a missing viewer, a non-participant, or any failure
   leaves the neutral render. Never claim a queue is "yours" without a
   matched viewer.

The file stays self-contained (§1): the viewer is injected, not fetched.
This is the one sanctioned use of JS for _content_ (not fit/responsiveness);
the `widget-artifact` skill carries the read snippet.

## Addressing & freshness

- Address: data repo, `artifacts` branch, `w/<slug>/index.html` — fixed the
  moment the routine is configured (ADR-0002).
- Freshness: the last commit touching that path is the widget's "Ran Xh ago"
  freshness readout; a run overdue relative to the routine's schedule shows a
  staleness badge. Never published → placeholder card.
