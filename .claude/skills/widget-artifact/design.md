# The artifact design language

Every widget on the board shares one visual system, so a dashboard of
artifacts written by different routines reads as one product. Author by
**picking from these components**, not by inventing a new language per
routine. The samples show the system end-to-end:
`docs/samples/daily-plan.html` (the plan/ledger archetype) and
`docs/samples/repo-pulse.html` (the stats/pulse archetype) in the app
repo.

The register is the board's own: terminal-calm, near-monochrome, color
only where it means something. Mono for machine values (times, counts,
slugs, repo names, ages), sans for human titles. Hierarchy comes from
weight, color, and alignment — never from shrinking type below the floors
(14px body, 12px labels/meta).

## The shell

Copy this skeleton on top of the token snippet (SKILL.md). It gives every
artifact the same bones: content on the tile's optical center when sparse
(never adrift in a corner), footer pinned to the bottom on the raw page,
tabular digits everywhere.

```css
* {
  box-sizing: border-box;
  margin: 0;
}
[hidden] {
  display: none !important;
}
html,
body {
  height: 100%;
}
body {
  display: flex;
  flex-direction: column;
  padding: 12px 14px;
  background: var(--color-bg1);
  color: var(--color-ink);
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.45;
  font-variant-numeric: tabular-nums;
  overflow: hidden;
}
main {
  display: grid;
  gap: 12px;
  margin-block: auto;
  min-height: 0;
}
footer {
  margin-top: auto;
  padding-top: 8px;
  display: flex;
  justify-content: space-between;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-ink-faint);
}
```

Off the board (raw page, full-view lightbox — no `data-steward-tile`
stamp), trade tile compactness for page generosity inside the ≥900px
media block:

```css
@media (min-width: 900px) {
  main,
  footer {
    width: 100%;
    max-width: 920px;
    margin-inline: auto;
  }
  :root:not([data-steward-tile]) body {
    padding: 40px 32px;
    overflow: auto;
  }
  :root:not([data-steward-tile]) main {
    margin-block: 0;
  } /* pages read top-down */
}
```

Width alone cannot tell a wide tile from the full view — a 4-column tile
is also ≥900px. Layout (columns, roomier rows) keys on the media query;
page generosity (outer padding, page-only elements like a date headline)
keys on `:root:not([data-steward-tile])`.

## Components

### Section

A 12px mono label, an optional count, and a hairline rule filling the
width. Drop the label entirely when the section is self-evident — never
substitute a smaller/fainter one.

```css
h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--color-ink-dim);
  margin-bottom: 6px;
}
h2 .count {
  font-weight: 400;
  color: var(--color-ink-faint);
}
h2::after {
  content: "";
  flex: 1;
  height: 1px;
  background: var(--color-border-dim);
}
```

```html
<h2>Top priorities <span class="count">3</span></h2>
```

### Ledger rows

The workhorse. One grid per list, rows as subgrid items, so key columns
(time, rank, repo, status dot) align down the whole list and wrapped text
keeps a hanging indent — text never wraps under its bullet.

```css
ol,
ul {
  list-style: none;
  padding: 0;
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 4px 10px;
}
li {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: subgrid;
  align-items: baseline;
}
.key {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-ink-dim);
  white-space: nowrap;
}
```

```html
<ul>
  <li><time class="key">10:00</time><span class="body">Team standup</span></li>
</ul>
```

Add trailing columns by widening the template
(`max-content 1fr max-content`) — right column for the value that answers
the glance (a count, an age, "9 need you"). Key colors are semantic:
orange for ranks/priority, aqua for times, yellow for carry-overs.
On single-row tiles clamp bodies to one line
(`white-space: nowrap; overflow: hidden; text-overflow: ellipsis`); let
them wrap on taller tiers. At ≥900px give rows breathing room and
hairlines:

```css
li {
  padding-block: 6px;
}
li + li {
  border-top: 1px solid var(--color-border-dim);
}
```

### Stat (the 1×1 tier)

The one number that answers the glance, plus what it counts, plus at most
one supporting line. Not a hero metric — it replaces the sections at 1×1
only (`@media (max-width: 340px) and (max-height: 160px)`).

```css
.stat .num {
  font-family: var(--font-mono);
  font-size: 32px;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.02em;
}
.stat .label {
  color: var(--color-ink-dim);
}
```

Color the number only when it carries state (orange = needs you, red =
failing); default ink.

### Pill

The chrome's tag vocabulary, mirrored: mono 12px, tone/10 fill, tone/40
border. Tones: `ok` green, `bad` red, `attn` orange, neutral ink-faint.
Color only when it means something — a healthy state usually needs no
pill at all.

```css
.pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 18px;
  padding: 0 7px;
  border-radius: 999px;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1;
  color: var(--color-ink-dim);
  border: 1px solid color-mix(in srgb, var(--color-ink-faint) 40%, transparent);
  background: color-mix(in srgb, var(--color-ink-faint) 10%, transparent);
}
.pill.ok {
  color: var(--color-green);
  border-color: color-mix(in srgb, var(--color-green) 40%, transparent);
  background: color-mix(in srgb, var(--color-green) 10%, transparent);
}
.pill.bad {
  color: var(--color-red);
  border-color: color-mix(in srgb, var(--color-red) 40%, transparent);
  background: color-mix(in srgb, var(--color-red) 10%, transparent);
}
```

### Status dot

A 7px dot as a ledger key when a row has a binary/ternary state (CI up,
unreachable). Never encode state by the dot alone — pair it with text
somewhere on the row (`CI ✓`, `unreachable`).

```css
.dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  align-self: center;
  background: var(--color-green);
}
.dot.bad {
  background: var(--color-red);
}
```

### Meter

Progress as a segmented bar (done/total), 4px tall. Use for genuinely
bounded progress only.

```css
.meter {
  display: flex;
  gap: 3px;
  height: 4px;
}
.meter span {
  flex: 1;
  border-radius: 2px;
  background: var(--color-bg3);
}
.meter span.on {
  background: var(--color-orange);
}
```

### Sparkline

Inline SVG, one series, no chart junk: 1.5px line in a named color,
optional area fill at low opacity, a dot on the last point. No axes, no
grid at tile sizes; label the endpoint value in 12px mono instead.

```html
<svg
  viewBox="0 0 120 28"
  width="120"
  height="28"
  role="img"
  aria-label="runs, last 14 days"
>
  <path
    d="M0 22 L… L120 8"
    fill="none"
    stroke="var(--color-aqua)"
    stroke-width="1.5"
  />
  <circle cx="120" cy="8" r="2.5" fill="var(--color-aqua)" />
</svg>
```

### Now marker (timelines)

For today-scoped time lists: dim rows whose time has passed
(`color: var(--color-ink-faint)` on key and body) and insert a thin
accent rule with a mono `HH:MM now` label between past and future. Gate
on the generated-at date still being today. On the board, tiles are a
"what's next" glance: collapse past rows into the marker's `N earlier`
counter (CSS keyed on `html[data-steward-tile]`), while the raw page and
full view keep every row. See the script in
`docs/samples/daily-plan.html`.

```css
.now {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-orange);
}
.now .rule {
  flex: 1;
  height: 1px;
  background: var(--color-orange-deep);
}
.now .past {
  display: none;
  color: var(--color-ink-faint);
}
html[data-steward-tile] .blocks li[data-past] {
  display: none;
}
html[data-steward-tile] .now .past {
  display: inline;
}
```

### Empty state

A designed fact, not an apology and not italics: what's missing in ink-dim,
the next action in one line, vertically centered by the shell. A neutral
pill can carry the state word (`unreachable`, `no data`).

```html
<section class="empty">
  <p>No repositories configured</p>
  <p class="hint">Set the routine's Repositories on the board</p>
</section>
```

```css
.empty p {
  color: var(--color-ink-dim);
}
.empty .hint {
  font-size: 12px;
  font-family: var(--font-mono);
  color: var(--color-ink-faint);
  margin-top: 4px;
}
```

## The tier playbook

Design each tier deliberately — a tier is a viewport, not a crop:

- **1×1** — the stat, nothing else. One number, its label, one optional
  support line.
- **2×1 / 1×2** — one ledger, single-line rows, no detail nests.
- **2×2** — the full ledger set or detail nests; fit-lists trim from the
  bottom.
- **Wide tile (3–4 cols)** — spend width on columns (two sections side by
  side, or trailing-value columns), not on longer lines.
- **Full view / raw page** — a page: capped column, top-anchored,
  hairline-separated rows, every item shown, page-only elements (a date
  headline) allowed.

Bans, on top of the board's own: no invented colors or fonts; no boxes
inside the tile (the card is the box — sections separate with rules and
space, never nested cards); no side-stripe accents; no more than one
accent-colored element per tile tier; body text never below 14px, nothing
below 12px.
