---
name: widget-artifact
description: >-
  The artifact authoring contract (docs/widget-standard.md): how to write
  the single self-contained HTML file a steward widget renders. Use
  whenever producing or reviewing a widget artifact. Routine skills author
  content, this skill dictates the file.
---

# widget-artifact

The artifact is rendered inside `<iframe srcdoc sandbox="allow-scripts">`:
scripts allowed, **no** same-origin. **No network is the contract, not a
browser guarantee.** The sandbox doesn't block fetches, but external
resources are forbidden by hard requirement 1 and may break, hang, or leak
at render time. The iframe is the widget body, so plain `@media` queries
respond to the widget's grid size, with no JS needed for responsiveness.

## Hard requirements

1. **One self-contained HTML file.** No CDNs, no web fonts, no `fetch`, no
   images by URL. Inline everything (SVG inline; raster only as data: URI).
2. **Standard breakpoints**, aligned with grid cell sizes:
   - width: `≤ 340px` (1 col) / `≤ 700px` (2 col) / wider
   - height: `≤ 160px` (1 row) / taller
     A 1×1 widget shows the KPI essence; larger sizes add detail
     progressively (KPI row → line items → sparkline). Author with
     `min-width`/`min-height` queries that reveal sections, like the
     reference artifact.
   - **Fit the height at every tier** (ADR-0019): tiles never scroll, since
     the board pins the iframe's overflow shut, so a list that doesn't fit must
     degrade to fewer items plus a visible `+N more` line, never crop
     mid-line. Use the fit-to-height snippet below on every unbounded list.
   - **Full view** (`≥ ~900px`): the dashboard lifts the widget into a
     full-screen overlay rendering this same file (no separate full-screen
     variant to author). The widest tier must read like a page: cap the
     content column (`max-width` ~`72ch`/`900px`, centered) so nothing runs
     edge-to-edge, and use the height for the fullest detail (every row, full
     history), not a bigger single number.
3. **The shared theme tokens only**, the gruvbox palette below, with
   `color-scheme: dark`. Do not invent colors.
4. **Generation time**: `<meta name="widget-generated-at" content="<ISO-8601 UTC>">`
   plus a visible compact timestamp in a `<footer>`
   (`<slug>` left, `YYYY-MM-DD HH:MMZ` right). The footer is standalone
   chrome (shown when the artifact is opened raw); on the board the frame
   hides it, since the widget-card footer already carries name + freshness.
5. **Graceful degradation**: missing data renders a designed empty state
   ("no live data", "nothing to show today"), never an error or a blank
   file.

## The token snippet

Inline exactly this in `:root`. The values MUST stay identical to the
`@theme` block in `apps/web/app/app.css` (ADR-0007); if they differ, fix
whichever side drifted:

```css
:root {
  color-scheme: dark;
  --color-bg: #1d2021;
  --color-bg1: #282828;
  --color-bg2: #32302f;
  --color-bg3: #3c3836;
  --color-border: #504945;
  --color-border-dim: #3c3836;
  --color-ink: #ebdbb2;
  --color-ink-dim: #a89984;
  --color-ink-faint: #928374;
  --color-orange: #fe8019;
  --color-orange-deep: #d65d0e;
  --color-yellow: #fabd2f;
  --color-green: #b8bb26;
  --color-aqua: #8ec07c;
  --color-blue: #83a598;
  --color-purple: #d3869b;
  --color-red: #fb4934;
  --font-sans: system-ui, sans-serif;
  --font-mono: "Geist Mono Variable", ui-monospace, "SF Mono", Menlo, monospace;
}
```

The mono stack leads with **"Geist Mono Variable"**, the chrome's own
mono, but the artifact never loads a webfont itself (rule 1 stands): the
board injects the face into the iframe at render time (ADR-0031), so on
the dashboard the artifact matches the chrome, and the raw page falls back
to the system mono after the comma.

Conventions on top: page background `--color-bg1` (matches the widget
card), body/data text `--color-ink` at **14px** (the readable floor, since
the artifact is the content that glows, so it never reads smaller than the
chrome body around it; **nothing below 12px**), section labels **12px** mono
`--color-ink-dim` (readable, not a faint 10px eyebrow; earn hierarchy with
weight and color, and drop the label entirely when the section is
self-evident), accents from the named colors: orange for
priorities/primary, aqua for times, yellow for warnings/carry-overs, red
only for genuinely bad states. At the 1×1 tier the KPI number carries the
glance; detail tiers get the 14px body.

**Compose from the design language.** Read `design.md` (next to this
file) before authoring. It carries the shared shell (vertical centering,
tile-vs-page split) and the component set every artifact picks from:
section rules, ledger rows, the stat tier, pills, dots, meters,
sparklines, the now marker, empty states, and the tier playbook. One
board, one language; don't invent per-routine visuals.

## The fit-to-height snippet

The board stamps `data-steward-tile` on `<html>` and clips overflow
(ADR-0019); the raw page and the full-view lightbox carry no stamp and keep
every row. Mark each unbounded list with `data-fit-list` and inline this.
It hides trailing items until the page fits and says how many it hid:

```html
<script>
  // Fit lists to the tile (widget-standard §2, ADR-0019): tiles never
  // scroll, so collapse trailing items that overflow into "+N more".
  // Runs only on the board — the frame stamps data-steward-tile.
  ;(function () {
    // The collapsible unit is the whole section — heading included. Trimming
    // a list to zero items would otherwise leave an <h2> advertising content
    // that is no longer under it.
    function owner(list) {
      return list.closest("[data-fit-section], section") || list
    }
    function reset(list) {
      var box = owner(list)
      if (box.hasAttribute("data-fit-collapsed")) {
        box.removeAttribute("data-fit-collapsed")
        box.hidden = false
      }
      var more = list.querySelector("[data-fit-more]")
      if (!more) {
        more = document.createElement("li")
        more.setAttribute("data-fit-more", "")
        list.appendChild(more)
      }
      more.hidden = true
      return more
    }
    function fit() {
      if (!document.documentElement.hasAttribute("data-steward-tile")) return
      var doc = document.documentElement
      // Bottom-most lists give way first — the top of the tile is the glance.
      var lists = [].slice
        .call(document.querySelectorAll("[data-fit-list]"))
        .reverse()
      // Reset every list before measuring: a re-fit after a resize must start
      // from the whole artifact, or a tile can only ever shrink.
      var state = lists.map(function (list) {
        var more = reset(list)
        // `.now` and [data-fit-keep] rows are load-bearing — the now marker,
        // a repo that has gone quiet, the one failing check. Trimming them is
        // how a tile ends up cheerfully reporting only good news.
        var items = [].filter.call(list.children, function (el) {
          return (
            el !== more &&
            !el.classList.contains("now") &&
            !el.hasAttribute("data-fit-keep")
          )
        })
        items.forEach(function (el) {
          el.hidden = false
        })
        return {
          list: list,
          more: more,
          items: items,
          // Trimming is resumable across sweeps, so the running count and
          // the exhausted flag live here rather than in the loop below.
          hidden: 0,
          done: false,
          // A pinned row is itself a reason for the section to stay —
          // collapsing would discard the row that was marked load-bearing.
          pinned: list.querySelectorAll("[data-fit-keep], .now").length,
        }
      })
      // Overflow lives on <body> — html/body pin overflow:hidden, so the
      // clipped region never surfaces on documentElement.scrollHeight.
      function height() {
        return Math.max(doc.scrollHeight, document.body.scrollHeight)
      }
      function over() {
        return height() > doc.clientHeight
      }
      // Trim one list as far as it will go right now; report whether it
      // moved. Resumable — a list that yields early resumes from its own
      // `hidden` count on a later sweep rather than starting over.
      function trim(s) {
        if (s.done) return false
        var moved = false
        while (over() && s.hidden < s.items.length) {
          // The next hide would empty this list: drop the whole section
          // instead. A tier is a viewport, not a crop — a section that does
          // not fit this tier is not part of it. A pinned row overrides that:
          // the section stays, carrying the row that had to survive.
          if (s.hidden + 1 === s.items.length && s.pinned === 0) {
            var box = owner(s.list)
            box.setAttribute("data-fit-collapsed", "")
            box.hidden = true
            s.done = true
            return true
          }
          var before = height()
          var el = s.items[s.items.length - ++s.hidden]
          el.hidden = true
          // Hiding this row freed no height: in a multi-column tier some
          // other column is the constraint right now. Put it back and
          // yield — a later sweep retries once that column has given way.
          if (height() >= before) {
            el.hidden = false
            s.hidden--
            return moved
          }
          moved = true
          s.more.hidden = false
          s.more.textContent = "+" + s.hidden + " more"
        }
        if (s.hidden >= s.items.length) s.done = true
        return moved
      }
      // Sweep until nothing moves. One ordered pass is not enough in a
      // multi-column tier: the ledger in the right column frees no height
      // while the left column is the taller one, so it yields — and a
      // single-pass fit never returns to it, leaving the tile overflowing
      // with rows still available to trim. Each sweep either hides at least
      // one row or ends the loop, and rows are finite, so this terminates.
      var progress = true
      while (over() && progress) {
        progress = false
        state.forEach(function (s) {
          if (trim(s)) progress = true
        })
      }
    }
    addEventListener("DOMContentLoaded", fit)
    addEventListener("resize", fit)
    // The board injects the chrome mono into every frame (ADR-0031), and it
    // lands *after* DOMContentLoaded. Fitting only on that event measures
    // fallback-font metrics and then never looks again: the swap grows every
    // row a little and the tile silently over-fills — trailing rows and the
    // provenance line clip below the fold with no "+N more" to admit it.
    // Re-fit once the faces settle.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit)
  })()
</script>
```

Style `[data-fit-more]` as a 12px mono `--color-ink-dim` line; it is a
count, not content. **It is an `<li>`, so a subgridded row rule
(`.tbl li { display: grid }`) will claim it as a row and drop its text into
the first column, sizing that track to the note.** Where rows are subgrid,
opt it back out (`display: block`, `grid-column: 1 / -1`). Non-list layouts
follow the same rule by other means
(shorter text via `min-height` queries, clamped paragraphs); what matters
is that nothing overflows a tile silently.

**In a multi-column tier, every column needs a trimmable list.** The sweep
can only free height from lists that carry `data-fit-list`, so a column
holding none of them is a floor the pass cannot get under — it will trim the
other column to nothing and still overflow. This is the case that hides: the
short list nobody thought to mark (three moves, four stats) is the one that
sets the tall column's height, while the long ledger opposite it is already
marked and yields uselessly. Mark **every** unbounded list, short ones
included, and drop whole sections by tier query where a tier was never meant
to carry them.

**Rows that carry bad news survive the trim.** Mark them `data-fit-keep`
(the now marker's `.now` class does the same job). Fit-trimming is
bottom-up, and the rows that sort to the bottom are often the quiet
ones — a repo with zero commits, a check that never ran. Left untagged,
the tile trims away exactly the absence the reader needed to see.

**A trimmed-to-nothing section collapses whole.** A heading over a bare
`+7 more` is the worst reading of a tier: it names content and delivers
none, and it spends the heading's height doing it. The snippet drops the
owning `<section>` instead — wrap a list in its own `<section>`, or mark
the unit with `data-fit-section` when one section holds two lists and only
one should go. Better still, decide the tier deliberately: a section the
2×2 tier was never meant to carry belongs behind a `min-width`/`min-height`
query, so it is never rendered and never trimmed.

## Person-relative content (ADR-0039)

"You" is resolved when the artifact is _rendered_, not when it is built,
since the same file is shown to everyone who can see the board. Two shapes:

- **Person-owned** (one subject, such as a daily plan): name the owner in
  the **third person** ("Daniel's Daily Plan", "Daniel has 3 left"), decided
  at build time. Never write "your"; a stranger must read whose it is.
- **Shared, per-viewer facets** ("yours" / "needs your review" differ per
  reader): publish **viewer-neutral**, grouping by an objective axis,
  stamping rows with raw relationship data (`data-author`, requested
  reviewers), and carrying no "you", then enhance against the injected
  viewer.

The board injects `window.__STEWARD_VIEWER__ = { login, name? }` into the
iframe at render time (like the theme/font); the raw page injects nothing.
Read it in a `DOMContentLoaded` handler, treat it as maybe-undefined, and
always leave a working neutral render behind:

```html
<script>
  // Person-relative enhancement (widget-standard, ADR-0039): the static
  // markup is viewer-neutral; if a viewer is injected and has a stake,
  // re-group into "yours" / "needs you". Any failure leaves the neutral
  // render — never claim a queue is yours without a matched viewer.
  ;(function () {
    function personalize() {
      try {
        var viewer = window.__STEWARD_VIEWER__
        if (!viewer || !viewer.login) return // raw page, or signed out
        var me = viewer.login
        // …bucket [data-author=me] into "Yours", rows whose requested
        // reviewers include me into "Needs your review", relabel the
        // section headings, reorder by actionability, update the KPI.
        // Bail (leave neutral) if `me` matches no row.
      } catch (e) {
        /* neutral render stands */
      }
    }
    addEventListener("DOMContentLoaded", personalize)
  })()
</script>
```

Run `personalize` before `fit` (register it first, or re-fit at its end):
re-grouping changes what overflows, so the fit-to-height pass must see the
final DOM.

## Reference

The canonical samples in the app repo's `docs/samples/` show the design
language end-to-end, including structure, breakpoint technique, and footer.
Open the one matching your archetype before authoring; imitate
its structure (never a previous run's markup, per `run-routine` §4):

- `daily-plan.html`: the plan/ledger archetype, with sections, ledger rows,
  lead + detail bodies, the Newport time grid with its details column,
  the by-type and by-project totals, the now marker.
- `repo-pulse.html`: the stats/pulse + queue archetype, with the stat tier,
  the queue table with per-state icon columns, avatars, dots, trailing
  values.
- `ticket-gaps.html`: the recommendations archetype — the queue table read
  as findings-plus-qualifiers, with the glyph state column, named value
  columns, confidence on the ink ramp, per-row icon actions, the provenance
  line.

## Validate before publishing

Run the bundled validator on the finished file. It checks the
deterministic half of the contract (self-containment, token drift,
meta/footer, fit-list wiring, type floors, anchor targets, media-query
grammar):

```bash
node <steward checkout>/.claude/skills/widget-artifact/scripts/validate.mjs <artifact.html>
```

Fix every **error** and re-run until clean; never publish with errors.
**Warnings** are judgment calls: resolve or consciously accept each one.
The validator cannot see composition (hierarchy, density, alignment);
that half stays on you and `design.md`.

## Checklist before publishing

- [ ] `validate.mjs` passes with zero errors
- [ ] No external request of any kind (grep for `http`, `//`, `url(`)
- [ ] Renders sensibly at 340×160 (1×1): the KPI essence, no overflow
- [ ] Reveals more at 700×310 and full size
- [ ] Nothing overflows any tile height; unbounded lists carry
      `data-fit-list` + the fit-to-height snippet, and truncation shows as
      `+N more`, never a mid-line crop
- [ ] Full view (~1400×900) reads like a page, with the content column
      capped and centered, extra height spent on detail, not one giant number
- [ ] `widget-generated-at` meta + visible footer timestamp
- [ ] Only palette colors; `color-scheme: dark` set
- [ ] Empty state designed, not accidental
- [ ] No "you"/"your" baked into the static render; person-owned artifacts
      name the owner (third person); shared ones publish viewer-neutral and
      enhance from `window.__STEWARD_VIEWER__`, degrading to neutral (ADR-0039)
