---
name: widget-artifact
description: >-
  The artifact authoring contract (docs/widget-standard.md): how to write
  the single self-contained HTML file a bulletin widget renders. Use
  whenever producing or reviewing a widget artifact — routine skills author
  content, this skill dictates the file.
---

# widget-artifact

The artifact is rendered inside `<iframe srcdoc sandbox="allow-scripts">`:
scripts allowed, **no** same-origin. **No network is the contract, not a
browser guarantee** — the sandbox doesn't block fetches, but external
resources are forbidden by hard requirement 1 and may break, hang, or leak
at render time. The iframe is the widget body, so plain `@media` queries
respond to the widget's grid size — no JS needed for responsiveness.

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
   - **Fit the height at every tier** (ADR-0019): tiles never scroll — the
     board pins the iframe's overflow shut — so a list that doesn't fit must
     degrade to fewer items plus a visible `+N more` line, never crop
     mid-line. Use the fit-to-height snippet below on every unbounded list.
   - **Full view** (`≥ ~900px`): the dashboard lifts the widget into a
     full-screen overlay rendering this same file (no separate full-screen
     variant to author). The widest tier must read like a page — cap the
     content column (`max-width` ~`72ch`/`900px`, centered) so nothing runs
     edge-to-edge, and use the height for the fullest detail (every row, full
     history), not a bigger single number.
3. **The shared theme tokens only** — the gruvbox palette below, with
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

Inline exactly this in `:root` — the values MUST stay identical to the
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
  --font-mono: ui-monospace, "SF Mono", Menlo, monospace;
}
```

Conventions on top: page background `--color-bg1` (matches the widget
card), body/data text `--color-ink` at **14px** (the readable floor — the
artifact is the content that glows, so it never reads smaller than the
chrome body around it; **nothing below 12px**), section labels **12px** mono
`--color-ink-dim` (readable, not a faint 10px eyebrow — earn hierarchy with
weight and color, and drop the label entirely when the section is
self-evident), accents from the named colors — orange for
priorities/primary, aqua for times, yellow for warnings/carry-overs, red
only for genuinely bad states. At the 1×1 tier the KPI number carries the
glance; detail tiers get the 14px body.

## The fit-to-height snippet

The board stamps `data-bulletin-tile` on `<html>` and clips overflow
(ADR-0019); the raw page and the full-view lightbox carry no stamp and keep
every row. Mark each unbounded list with `data-fit-list` and inline this —
it hides trailing items until the page fits and says how many it hid:

```html
<script>
  // Fit lists to the tile (widget-standard §2, ADR-0019): tiles never
  // scroll, so collapse trailing items that overflow into "+N more".
  // Runs only on the board — the frame stamps data-bulletin-tile.
  ;(function () {
    function fit() {
      if (!document.documentElement.hasAttribute("data-bulletin-tile")) return
      var doc = document.documentElement
      // Bottom-most lists give way first — the top of the tile is the glance.
      var lists = [].slice
        .call(document.querySelectorAll("[data-fit-list]"))
        .reverse()
      lists.forEach(function (list) {
        var more = list.querySelector("[data-fit-more]")
        if (!more) {
          more = document.createElement("li")
          more.setAttribute("data-fit-more", "")
          list.appendChild(more)
        }
        var items = [].filter.call(list.children, function (el) {
          return el !== more
        })
        items.forEach(function (el) {
          el.hidden = false
        })
        more.hidden = true
        var hidden = 0
        while (doc.scrollHeight > doc.clientHeight && hidden < items.length) {
          items[items.length - ++hidden].hidden = true
          more.hidden = false
          more.textContent = "+" + hidden + " more"
        }
      })
    }
    addEventListener("DOMContentLoaded", fit)
    addEventListener("resize", fit)
  })()
</script>
```

Style `[data-fit-more]` as a 12px mono `--color-ink-dim` line — it is a
count, not content. Non-list layouts follow the same rule by other means
(shorter text via `min-height` queries, clamped paragraphs); what matters
is that nothing overflows a tile silently.

## Reference

`docs/samples/daily-plan.html` in the shared repo is the canonical example —
structure, breakpoint technique, and footer included.

## Checklist before publishing

- [ ] No external request of any kind (grep for `http`, `//`, `url(`)
- [ ] Renders sensibly at 340×160 (1×1) — the KPI essence, no overflow
- [ ] Reveals more at 700×310 and full size
- [ ] Nothing overflows any tile height — unbounded lists carry
      `data-fit-list` + the fit-to-height snippet, and truncation shows as
      `+N more`, never a mid-line crop
- [ ] Full view (~1400×900) reads like a page — content column capped and
      centered, extra height spent on detail, not one giant number
- [ ] `widget-generated-at` meta + visible footer timestamp
- [ ] Only palette colors; `color-scheme: dark` set
- [ ] Empty state designed, not accidental
