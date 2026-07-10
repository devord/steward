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
scripts allowed, **no** same-origin, **no network**. Anything external
simply breaks. The iframe is the widget body, so plain `@media` queries
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
card), body text `--color-ink` at 13px, section headings 10px uppercase
mono in `--color-ink-faint`, accents from the named colors — orange for
priorities/primary, aqua for times, yellow for warnings/carry-overs, red
only for genuinely bad states.

## Reference

`docs/samples/daily-plan.html` in the shared repo is the canonical example —
structure, breakpoint technique, and footer included.

## Checklist before publishing

- [ ] No external request of any kind (grep for `http`, `//`, `url(`)
- [ ] Renders sensibly at 340×160 (1×1) — the KPI essence, no overflow
- [ ] Reveals more at 700×310 and full size
- [ ] `widget-generated-at` meta + visible footer timestamp
- [ ] Only palette colors; `color-scheme: dark` set
- [ ] Empty state designed, not accidental
