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
artifact the same bones: content top-aligned so lists read top-down (only
the one-row glance tier centers its lone KPI, so it's never adrift in a
corner), footer pinned to the bottom on the raw page, tabular digits
everywhere.

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
  min-height: 0;
}
/* One-row glance tiles are inherently sparse — center the lone KPI so it
   isn't adrift. Taller tiles (and raw/full pages) read top-down. */
@media (max-height: 160px) {
  [data-steward-tile] main {
    margin-block: auto;
  }
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
    /* Fill the frame — the artifact takes the full width it's given, and
       the board sizes the widget. No content-width cap: a ledger/table
       artifact wants its columns to breathe edge to edge. If a widget is
       long-form prose, cap the measure on the text block itself (~72ch),
       never on the whole artifact. */
    width: 100%;
  }
  :root:not([data-steward-tile]) body {
    padding: 40px 32px;
    overflow: auto;
  }
}
```

Width alone cannot tell a wide tile from the full view — a 4-column tile
is also ≥900px. Layout (columns, roomier rows) and the page heading key on
the media query; only the generosity that would break a tile — outer
padding, `overflow: auto` — keys on `:root:not([data-steward-tile])`. Never
gate an element on the stamp while still reserving its grid row: on a wide
tile the row then sits empty and reads as dead top margin (show it from the
wide grid up instead).

## Components

### Heading

The artifact's own page title, matching the app's page headings so a wide
tile, raw page, or full view reads like the rest of the product: mono, 18px,
medium weight, full ink — with an optional ink-dim subtitle (14px sans) for a
caption. The glance tiers lean on the chrome's title bar (name + freshness)
and skip it; show it from the wide grid up (≥900px) and on the raw/full page,
where there's room. Distinct from the chrome's freshness — carry the content
the title bar can't: for daily-plan the day the plan is _for_, not when it ran.

```css
.heading {
  font-family: var(--font-mono);
  font-size: 18px;
  font-weight: 500;
  color: var(--color-ink);
}
.heading .sub {
  margin-top: 2px;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--color-ink-dim);
}
```

```html
<p class="heading">Monday, July 13</p>
```

(The daily-plan sample names this element `.date` — the class is the
artifact's to pick; the treatment is the shared one above.)

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

### Link

Anything that names an object living elsewhere — a PR, an issue, an
event — is an anchor to it, always with `target="_blank" rel="noopener"`
(widget-standard §7: in-frame navigation is blocked, so a bare href is a
dead link). Links keep the ink register: no browser blue, a hairline
underline that inks up on hover.

```css
a {
  color: inherit;
  text-decoration: underline;
  text-decoration-color: var(--color-border);
  text-underline-offset: 2px;
}
a:hover {
  text-decoration-color: var(--color-ink-dim);
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

### Icon

Pictograms are inline lucide SVGs — the app chrome's icon set (paste the
paths from lucide.dev): 12px in ledger keys, `stroke="currentColor"` so
the key's semantic color carries through, stroke-width 2, round caps,
`aria-hidden="true"`. An icon never replaces text — the section label or
row body carries the meaning. No dingbat glyphs (↻ ⟳ ⚠ ➜): they render
soft and font-dependent, never sharp.

```html
<span class="key"
  ><svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13" /></svg
></span>
```

```css
.key svg {
  width: 12px;
  height: 12px;
  vertical-align: -1.5px;
}
```

(That path set is lucide `redo-2` — the daily-plan sample's carried-over
key.)

### Avatar

A person as a ledger key: an 18px round image inlined as a data URI
(fetched at generation time, ≤48px source — widget-standard rule 1
forbids images by URL), wrapped in a link to the person's profile so
the picture is the click-through to _who_. The link's `title` and the
img's `alt` carry the person's **display name** (`Daniel Moraes`, not
the handle `danielmoraes`), so hover answers _who_; identity never
rides on the picture alone. When no image could be inlined, fall back
to the initial form — same footprint, one mono capital, still linked.
Avatars are the one raster exception in an otherwise vector language:
earn them (a row genuinely about a person), never decorate with them.

```css
.avatar-link {
  align-self: center;
  display: inline-flex;
  border-radius: 999px;
  text-decoration: none;
}
.avatar-link:hover .avatar {
  border-color: var(--color-ink-dim);
}
.avatar {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
}
span.avatar {
  /* fallback: the initial */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1;
  color: var(--color-ink-dim);
  background: var(--color-bg3);
}
```

```html
<a
  class="avatar-link"
  href="https://github.com/octocat"
  target="_blank"
  rel="noopener"
  title="The Octocat"
>
  <img class="avatar" src="data:image/png;base64,…" alt="The Octocat" />
</a>
<a
  class="avatar-link"
  href="https://github.com/hubot"
  target="_blank"
  rel="noopener"
  title="hubot"
>
  <span class="avatar">H</span>
</a>
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

### Time blocks (the Newport day)

The plan archetype plans the whole day, not just meetings: every
30-minute slot has a job. Blocks are typed classes carrying a `--tone`;
`--s` is the span in 30-minute slots:

```css
.t-deep {
  --tone: var(--color-orange); /* executes a top priority */
}
.t-mtg {
  --tone: var(--color-aqua); /* externally fixed time */
}
.t-shal {
  --tone: var(--color-purple); /* batched email/review work */
}
.t-per {
  --tone: var(--color-ink-faint); /* life around the work */
}
.t-free {
  --tone: var(--color-bg3); /* honest slack — the meter's off tone */
}
```

One block list, three renderings (see `docs/samples/daily-plan.html`):

- **Tile ledger** — the rows component with a trailing duration column
  (`14:00 · Deep — … · 1h30`). Hierarchy by ink, not fills: deep bodies
  full ink at weight 500, free bodies ink-faint, the rest ink-dim.
- **Day strip** — a 6px proportional bar under the section rule, one
  segment per block at `color-mix(tone 65%)` (free stays `bg3`, the
  unfilled track), a 2px orange tick at now. Script-built from the list;
  the shape of the day at glance size, kept on every tier — above the
  time grid it's the day's summary line.
- **Time grid (any wide surface tall enough for the day)** — the paper
  planner, gated on size, not the tile stamp:
  `@media (min-width: 900px) and (min-height: 600px)` — the raw page,
  the full view, and board tiles from ~4 rows up all render it; shorter
  tiers keep the ledger. Pages get 26px per 30-minute slot; tiles never
  scroll, so there the day flexes to spend exactly the section's height
  (`container-type: size` on the day, children take
  `--slot: max(22px, calc(100cqh / var(--slots)))`, with
  `--slots` script-set from the block list). A script-built 12px mono
  ruler labels every slot from day start to day end (hours `08:00`
  ink-dim, half-hours a quiet `:30` ink-faint); the ruler's hairline
  right edge is the grid's only ruled line — no hour or half-hour
  rules across the day, the boxes and the now line alone cross it. A
  block is a drawn box spanning `--s` grid rows — 1px
  `color-mix(tone 45%)` border over a `color-mix(tone 12%)` wash, no
  time key inside the box (the ruler carries the times) — free slots
  stay unboxed: blank space against the ruler is honest slack. `goal:`
  notes render inline on ≥1h blocks; every block carries a `title`
  tooltip with its full range, label, and note, so
  nothing truncated is lost. The now line crosses the grid at the
  current time, its mono chip sitting in the ruler gutter,
  calendar-style; the script measures a ruler row for its position (the
  tile tier's `--slot` is a container expression, not a length).

A `.totals` line (12px mono, tone dots) states the process metric on
wide tiers: `4.5h deep · 1h meetings · 3h shallow · 30m free`.

### Now marker (timelines)

For today-scoped time lists: dim rows whose time has passed
(`color: var(--color-ink-faint)` on key and body; `opacity: 0.55` on
grid boxes) and insert a thin accent rule with a mono `HH:MM now` label
between past and future. Gate on the generated-at date still being
today. Keep it live: re-render the whole now state (dimming, marker,
grid now line, strip tick) on a 30-second timer plus `visibilitychange`
and `resize`, so an open page tracks the day without a refresh — and
clear it once the date rolls past the plan's. Past rows are never
hidden, on any tier — the plan is a record of the day, not a queue;
passed time recedes, it doesn't disappear. Never collapse past rows
into an `N earlier` line: late in the day that empties the whole
section. When a tile runs out of height the fit-list trims for space,
honestly (`+N more`), never by pastness. See the script in
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
  side, or trailing-value columns), not on longer lines; the page heading
  earns its row here.
- **Full view / raw page** — a page: capped column, top-anchored,
  hairline-separated rows, every item shown, the page heading and page-only
  generosity (outer padding, scroll) allowed.

Bans, on top of the board's own: no invented colors or fonts; no boxes
inside the tile (the card is the box — sections separate with rules and
space, never nested cards); no side-stripe accents; no more than one
accent-colored element per tile tier; body text never below 14px, nothing
below 12px.
