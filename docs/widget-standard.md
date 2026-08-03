# Widget standard

The contract between the dashboard grid and the artifacts routines publish.
The `widget-artifact` skill (M4) enforces this when authoring; the dashboard
relies on it when rendering. Grid bounds are encoded in
`packages/schema/src/dashboard.ts`.

## The grid (dashboard side)

- A react-grid-layout grid (ADR-0041): the board's own **`grid.columns`** on
  desktop (default **4**, up to **6**), 2 on tablet, 1 on phone. In edit mode,
  dragging a widget onto or between others slides the neighbours aside
  (vertical compaction; a displaced widget floats back up once the space frees).
- Row unit **≈ 150 px** by default (`grid.rowHeight`, adjustable as board
  density), **12 px** gap. Canvas width is `grid.width`, either `fixed`
  (centered) or `wide` (fills a large monitor).
- A widget declares `size: { cols: 1..columns, rows: 1..6 }` and a
  `position: { col, row }` in `data/dashboards/<slug>.yaml` (1-indexed; the
  board maps it to the grid engine's own 0-indexed layout).
- The widget body is an iframe:
  `<iframe srcdoc={artifactHtml} sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox">`.
  Scripts allowed, links open real new tabs (ADR-0028), **no**
  `allow-same-origin`, no in-frame navigation, and the sandbox has no
  network.
- **Tiles never scroll** (ADR-0019). The frame pins `overflow: hidden`
  inside the tile iframe and stamps `data-steward-tile` on the artifact's
  `<html>`; if content overflows anyway, the frame fades the bottom edge out
  so the truncation is visible ("there's more, expand"), never an ambiguous
  mid-line crop. The full view scrolls freely; that's where every row lives.

## The artifact (inside the iframe)

Because the iframe _is_ the widget body, plain `@media` queries inside the
artifact respond to the widget's size. No postMessage protocol, no resize
observer, no JS required.

An artifact MUST:

1. **Be one self-contained HTML file.** No external requests of any kind: no
   CDNs, no web fonts, no `fetch`, no images by URL. Inline everything; the
   sandbox blocks the network, so anything external simply breaks.
2. **Respond to the standard breakpoints**, aligned with grid cell sizes:
   - width: `≤ 340 px` (1 col) / `≤ 700 px` (2 col) / wider
   - height: `≤ 160 px` (1 row) / taller
     A 1×1 widget shows the KPI essence; larger sizes add detail progressively
     (KPI row → line items → sparkline). **Fit the height at every tier**:
     tiles never scroll and the frame clips overflow (ADR-0019), so content
     that doesn't fit must degrade to fewer items plus a visible `+N more`
     line. Silent cropping is a contract violation. The measurement is gated
     on `html[data-steward-tile]` (the board's stamp) so the raw page and the
     full view keep every row, and the pass itself is **injected by the
     board** (ADR-0050) rather than carried by each file — what the artifact
     owes is trimmable units inside its lists, which the kit emits.
   - **Full view** (`≥ ~900 px` wide): the dashboard can lift any widget into
     a full-screen overlay, the same sandboxed, theme-injected iframe at
     nearly the whole viewport, so the reader sees every row of data. Author
     for it: the widest tier must read like a page, not a stretched cell.

     **Width: a ledger fills the frame, with exactly one flexible column.**
     No cap and no centring on the document (`Shell.tsx` carries no
     `max-width` and no `margin-inline: auto`), and inside a `<table>` the
     title column takes `w-full` while every other cell is
     `w-0 whitespace-nowrap`, so the surplus has one home and the trailing
     values anchor to the right edge. The one measure that _is_ capped is
     long-form prose, and the cap goes **on the text block, never on a
     cell** — a paragraph has a readable line length whatever the frame
     does, but a `max-width` on a `<td>` sizes the table too. Column gutters
     ride the **leading** edge of each value column (`pl-3`) rather than the
     trailing edge of its neighbour, so the last column ends flush and the
     ledger, the section rule above it and the provenance line below it
     share one right edge.

     Two earlier readings were wrong, in opposite directions. The first said
     to "cap the content column (~72ch/900px, centered)", which puts two
     margins where one edge reads better and throws away the width a genuine
     multi-column table wants. The second replaced it with shrink-to-fit —
     surplus as one trailing right gutter — arguing that stretching "opens a
     hole in the middle of every row between the label and its trailing
     values". That hole is real and is still the price; what the argument
     missed is what shrink-to-fit cost instead. It never actually shrank to
     the content: the flexible column carried a 52ch reading measure, so the
     table stopped at roughly 620px whatever frame it was given — a dead
     band over a quarter of an 880px tile and nearly half the full view —
     and a title longer than the measure wrapped to a second line _while
     that band sat empty beside it_, a wrap and a gutter at once, the extra
     line spending height budget on a tile that clips (ADR-0019). It
     misaligned the ledger against its own artifact: every band draws a
     full-width rule (`Section`) and the provenance foot justifies across
     the frame, so a ledger ending at 55% under a rule running to 100% reads
     as a fault rather than as a margin. And it moved columns between runs,
     since shrink-to-fit sizes the title column to whichever title happens
     to be longest _this_ run — these artifacts regenerate on a schedule,
     and a layout that reflows on refresh is the opposite of glanceable.

     Spend the extra height on the fullest detail level (all line items, full
     history, the large sparkline) rather than scaling one number up. There is
     no separate full-screen artifact to author; one published file serves the
     1×1 glance and the full page alike.

3. **Use the shared theme tokens**, the gruvbox-dark palette as CSS custom
   properties with `color-scheme: dark`. The canonical values live in the
   theme registry (`apps/web/app/lib/theme.ts`, the gruvbox-dark entry) and
   are _derived_ from it into the kit's stylesheet by
   `scripts/gen-artifact-tokens.ts`, CI-checked for drift, so there is no
   second copy to keep identical. Do not invent colors,
   and always paint via `var(--color-*)`: the dashboard appends an override
   of those same custom properties inside the iframe for **every** theme,
   gruvbox-dark included (ADR-0009), so hard-coded hexes won't retheme —
   and won't track the registry when a palette is retranscribed either. The
   inlined values are only what the file paints when opened raw.
4. **Carry its generation time**:
   `<meta name="widget-generated-at" content="<ISO-8601>">` plus a visible
   compact timestamp in a `<footer>`. That footer is the artifact's
   _standalone_ chrome, for when it's opened raw. On the dashboard the
   widget-card's title bar already shows the routine name and freshness, so
   the frame hides the artifact's own `<footer>` to avoid writing the identity
   and run time twice.
5. **Degrade gracefully** when data is missing. An empty state is part of
   the artifact, not an error.
6. **Type at a readable floor.** The artifact is the content that glows, so
   it never reads smaller than the chrome around it: body/data text at
   **14px**, section labels at **12px** (the absolute floor; nothing
   smaller, no faint sub-12px uppercase eyebrow). Earn hierarchy with weight,
   color, and the palette accents, not by shrinking type. The 1×1 tier leans
   on its KPI number; detail tiers carry the 14px body. (The kit owns the
   scale, and the board injects its stylesheet, so a rescale reaches every
   stamped artifact on the next page load rather than on its next run.)
   The `--font-mono` token leads with `"Geist Mono Variable"`, the chrome's
   mono, but the artifact still loads no webfont itself (rule 1 holds): the
   dashboard injects the face into the iframe at render time, the same way it
   injects the theme (ADR-0031), and the raw page falls back to the system
   mono.
7. **Link out, in a new tab.** Anything the artifact names that lives
   elsewhere, such as a PR, an issue, or an event, is an anchor to it; the
   tile is triage, the source system is the follow-through. Every `<a href>`
   carries `target="_blank" rel="noopener"`: in-frame navigation is
   sandbox-blocked (ADR-0028), so a bare href goes nowhere on the raw
   page. (On the board the frame retargets forgotten anchors as a
   backstop.) The kit emits both attributes on every anchor it renders, and
   styles links calm ink, never browser blue — what the routine supplies is
   the `href`.
8. **Be compiled from the shared kit** (ADR-0027, ADR-0050). The design
   language is not documentation an author imitates; it is
   `packages/artifact-kit/`, and an artifact is `render.mjs` over a
   `data.json` the routine emits. The kit owns the shell, the tier system,
   the type scale, the queue table, the stat and verdict, meters,
   sparklines, the coupling matrix (ADR-0047), the day grid, rails, the
   provenance line and empty states; `widget-artifact/kit/CONTRACT.md` is the
   input shape and `design.md` is what is left to judgment. This is what makes
   a board of widgets from different routines read as one product — and, since
   the board injects the current stylesheet into every stamped artifact, what
   lets a design fix reach a widget published months ago without rerunning it.

   Picker previews (ADR-0037) are keyed to the template by basename:
   `docs/samples/<id>.html` for a built-in, generated in CI by rendering an
   archetype fixture, and `templates/routines/<id>.sample.html` for a repo
   template that ships its own.

9. **Carry a briefing for Claude** (ADR-0043) — a SHOULD, not a MUST. A tile
   is a compressed view: it shows 15 of 61 rows and a bar standing in for 200
   tickets. Embed the fuller story as markdown in an inert
   `<script type="text/markdown" id="steward-context">`, and the board grows a
   Chat-with-Claude button that copies it, paste-ready. The block is
   **richer than the render**: what the tile cropped, the caveats the run hit,
   and a closing `## Ask me about` naming the questions this widget invites.
   Browsers neither execute nor render an unknown script type, so it costs no
   layout and no request; only `</script>` terminates it, so a briefing that
   quotes markup escapes it as `<\/script>`. Artifacts without a block keep
   working — they just show no button.

## Person-relative content (ADR-0039)

An artifact is authored once and rendered for whoever can see the board, so
"you" is a **render-time** fact, never the routine runner. Two shapes:

- **Person-owned** (a daily plan, a personal digest, anything with one
  subject): name the owner in the **third person**, as in "Daniel's Daily
  Plan" or "Daniel has 3 deep blocks left", resolved at build time, because
  the subject is fixed at build time. Never "your". A stranger opening the
  board must read _whose_ it is, not a false second person.
- **Shared with per-viewer facets** (a PR queue, a repo pulse: meaningful
  to everyone, but "yours"/"needs your review" differ per reader): publish
  **viewer-neutral**, then resolve the viewer at render time.

For the shared shape:

1. **The static render is neutral and honest.** Group by an objective axis
   (e.g. PRs by state), carry no "you"/"yours", and stamp each row with the
   raw relationship data it needs (`data-author`, directly-requested
   reviewers), never a pre-computed "mine". This is what the raw page, and
   a viewer with no stake, see.
2. **The viewer is read for you.** On the board the frame sets
   `window.__STEWARD_VIEWER__ = { login, name? }` inside the iframe (same
   render-time injection as the theme and font), and the board's enhancer
   reads it against the row data above. A routine opts in by naming the
   groups it wants (`viewerGroups`, `kit/CONTRACT.md`) — it writes no
   JavaScript, and there is no per-artifact copy of the read to drift
   (ADR-0050).
3. **Enhance progressively, degrade to neutral.** If the viewer participates
   (authors or is directly requested on a row), the render re-groups into the
   second-person view ("Needs your review" / "Yours"). A missing viewer, a
   non-participant, or any failure leaves the neutral render standing. A queue
   is never claimed as "yours" without a matched viewer.

The file stays self-contained (§1): the viewer is injected, not fetched.
What remains the routine's own responsibility is every **string** it writes —
a title, a row detail, a briefing. "Your" baked into text cannot be un-said at
render time, and no mechanism will catch it for you (the validator warns).

## Addressing & freshness

- Address: data repo, `artifacts` branch, `w/<slug>/index.html`, fixed the
  moment the routine is configured (ADR-0002).
- Freshness: the last commit touching that path is the widget's "Ran Xh ago"
  freshness readout; a run overdue relative to the routine's schedule shows a
  staleness badge. Never published → placeholder card.
