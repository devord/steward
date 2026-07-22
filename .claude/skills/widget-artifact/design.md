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
weight, color, and alignment, never from shrinking type below the floors
(14px body, 12px labels/meta).

**No motion.** An artifact is glanced at, not watched: it must look settled
the moment it paints. Never animate chart geometry or values on load. Bars
growing, numbers counting up, and labels traveling read as flicker in a tile
and overlap mid-transition. If something genuinely must move (it almost never
does), keep it ≤200ms ease-out and gate it behind
`@media (prefers-reduced-motion: no-preference)`.

Stretch the tiers so each artifact has **one datum that is clearly the most
prominent**: the heading where there is one, the stat number at 1×1,
otherwise the datum that answers the glance. The three type tiers (heading →
section label → body) must read as three, not one narrow band. The heading is
the heaviest and darkest (16px medium on tiles, 18px semibold on the page;
see Heading); the section label is the _quiet_ organizer (12px, ink-dim,
uppercase, tracked, small and dim, never a second heading); body is the
content between them. Cards carry no border by design, so this hierarchy plus
the whitespace rhythm between blocks _is_ the separation. Never let a section
label out-weigh the heading it sits under.

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
/* Sections breathe more than rows (rows run 4–6px, sections 14px), and the
   separation is a `gap` on every element that stacks sections — `main` and
   each column wrapper, which is what `.stack` marks. Two properties make the
   gap the right tool and a sibling margin the wrong one: a gap skips a
   section hidden by a tier query, and it skips a visually-hidden heading,
   where `+` would count both and open the tile on dead space. Its one cost is
   that it reaches only direct children — so a wrapper that stacks sections
   and forgets `.stack` drops its rhythm to zero. That is the bug this rule
   exists to prevent; the validator checks for it. */
main,
.stack {
  display: grid;
  align-content: start;
  gap: 14px;
  min-height: 0;
}
main {
  /* Never let the flex body squeeze main: a compressed main hides its
     overflow inside the body box, where the fit script can't measure it
     (scrollHeight stays clean) and content paints over the footer. Unshrunk,
     overflow pushes past the body edge and the fit pass sees it. */
  flex-shrink: 0;
}
/* A second label inside one section is the case no gap can reach. */
:is(section, .section) > * + h2 {
  margin-top: 14px;
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

Off the board (raw page, full-view lightbox, with no `data-steward-tile`
stamp), trade tile compactness for page generosity inside the ≥900px
media block:

```css
@media (min-width: 900px) {
  main,
  footer {
    /* Fill the frame the board gives you — but up to a cap, never the raw
       1400px. An uncapped ledger flings its trailing values to the far edge
       (see Ledger rows · cap the measure); a prose widget runs past a
       readable line. So cap the measure and left-align, letting the slack
       fall to the right: ~56rem for a trailing-value ledger, wider for a
       genuine multi-column table, ~72ch for long-form prose. */
    width: 100%;
    max-width: 56rem;
    margin-inline: 0 auto;
  }
  /* The page opens the rhythm up: parts of a page, not rows of a tile. This
     one keys on the stamp rather than the width, unlike the layout rules
     around it — a 4-column tile is also ≥900px, and there the extra air is
     paid for in data rows the tile can't spare. */
  :root:not([data-steward-tile]) :is(main, .stack) {
    gap: 28px;
  }
  :root:not([data-steward-tile]) :is(section, .section) > * + h2 {
    margin-top: 28px;
  }
  :root:not([data-steward-tile]) body {
    /* No bottom padding here — the spacer below carries it. */
    padding: 40px 32px 0;
    overflow: auto;
  }
  /* A scroll container's own `padding-bottom` is not part of its scrollable
     overflow in Chromium and WebKit, and `body` is both the padded box and
     the scroller. Declared as padding, the page's bottom space silently
     disappears the moment the content overflows: scroll to the end of a raw
     page or a full-view lightbox and the footer sits flush against the frame
     edge. Carrying it as a flex item instead makes it a real box that scrolls
     with the content. Measured, not assumed — the artifact's own inline
     `<script>`s are `body`'s last children, so the tempting
     `body > :last-child { padding-bottom }` puts the space on a
     `display: none` element and changes nothing. */
  :root:not([data-steward-tile]) body::after {
    content: "";
    flex: 0 0 40px;
  }
}
```

Tiles keep their `12px 14px` padding and never scroll, so the spacer is
page-only: on a tile it would spend a row of content on empty space.

**One capped column is the single-block case, not the default.** The cap
above keeps one ledger's trailing values near their labels; it is not a
licence to stack five blocks in a 56rem ribbon down the left of a 2000px
frame. An artifact carrying several independent blocks (a ledger, a
composition, two breakdowns) should become a **real multi-column page** at
the wide tier: the lead block takes the larger share, the parallel lists run
as columns beside it, and the provenance line spans the foot. The cap then
moves down a level, so each block bounds its **own** measure and the page
grid spends the width on content instead of margin. Gate it on both axes
(`min-width: 1100px` and `min-height: 560px`); a wide-but-short tile has no
room for a tall left stack beside two lists and should keep the stacked
layout.

Flatten wrappers with `display: contents` so nested blocks become real
columns of the page grid, and place by `grid-template-areas`, since the
areas map is the layout, readable at a glance:

```css
@media (min-width: 1100px) and (min-height: 560px) {
  main {
    /* Shares, not caps: `minmax(0, 34rem)` sizes the track to its
       max-content and stops, so columns hug and the outer allowance is
       never spent. An fr component makes them divide the frame. */
    grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 1fr);
    grid-template-areas:
      "head head head"
      "led  proj req"
      "comp proj req"
      "prov prov prov";
    grid-template-rows: auto auto 1fr auto;
    align-items: start;
    column-gap: 40px;
    row-gap: 30px;
  }
  .breakdowns,
  .breakdowns .cols {
    display: contents;
  }
}
```

**The outer cap scales with the column count**, so the shell's `56rem` is a
floor, not a constant: ~56rem for one capped column, ~72rem for two
(`repo-intel`'s main + rail), ~88rem for three (`request-queue`'s ledger +
two breakdowns). Different numbers across artifacts are the rule working,
not drift; what stays fixed is that the cap exists and the slack falls to
the right.

Give `main` **`flex-grow: 1`** at this tier and let the last content row
take `1fr`, so the provenance line lands on the page's bottom edge as a real
foot rather than the content trailing off mid-frame with dead space beneath
it. Grow only: never write it as `flex: 1 1 auto`, which resets
`flex-shrink` to 1 and hands back the squeeze the shell pins shut above, so
overflow would hide inside the body box where the fit pass cannot see it.
Do **not** answer leftover height by padding rows or by uncapping a list
that is capped for editorial reasons: an artifact with little to say should
look calm, not inflated.

Width alone cannot tell a wide tile from the full view, since a 4-column
tile is also ≥900px. Layout (columns, roomier rows) and the page heading key
on the media query; only the generosity that would break a tile (outer
padding, `overflow: auto`) keys on `:root:not([data-steward-tile])`. Never
gate an element on the stamp while still reserving its grid row: on a wide
tile the row then sits empty and reads as dead top margin (show it from the
wide grid up instead).

## Components

### Heading

The artifact's own page title, the document's `<h1>`, in **two registers**.
On a tile the chrome's own title bar (widget name, 16px mono semibold) sits
directly above the artifact, and the artifact's heading must never out-size
or out-weigh it, because an inner heading larger than the widget's name reads
as two products stacked. So on tiles the visible heading is mono, **16px,
weight 500**, full ink: within the chrome's scale, a step _below_ the
chrome's 600 weight. Off the board (raw page, full-view lightbox, with no
`data-steward-tile` stamp) there is no chrome bar competing, and the heading
steps up to **18px semibold** as the page's own title. Either register takes
an optional ink-dim subtitle (14px sans) for a caption. The iframe is its own outline, so this
`<h1>` roots the section `<h2>`s below (never a `<p>` sitting above orphaned
headings). The glance tiers lean on the chrome's title bar (name +
freshness) and drop the _visible_ title, but hide it visually (the
`.sr-only` pattern below), never `display: none`, so the `<h1>` stays in the
a11y tree and keeps rooting the section `<h2>`s at every iframe size; restore
the visible title from the wide grid up (≥900px) and on the raw/full page,
where there's room. Distinct from the chrome's freshness: carry the content
the title bar can't, so for daily-plan that is the day the plan is _for_, not
when it ran.

An artifact that shows no visible title (glance-only, leaning entirely on the
chrome bar, e.g. repo-pulse) still roots its sections with a visually-hidden
`<h1>` (the widget's name), so the document outline is never a run of `<h2>`s
with no parent.

The heading is the artifact's anchor, the most prominent element on any tier
that shows it, a clear step above the 12px section labels below it (which
stay ink-dim and quiet); a hair of negative tracking keeps the mono from
reading as a data string. **No word in the heading takes an accent color**,
not the owner's name and not the date: the accent budget belongs to the data
(one accent element per tile tier), and a colored name pulls the eye to the
least actionable pixel on the surface.

```css
.heading {
  font-family: var(--font-mono);
  font-size: 16px;
  font-weight: 500;
  letter-spacing: -0.01em;
  color: var(--color-ink);
}
/* Page register: no chrome title bar to defer to. */
:root:not([data-steward-tile]) .heading {
  font-size: 18px;
  font-weight: 600;
}
.heading .sub {
  margin-top: 2px;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--color-ink-dim);
}
/* Visually hide the title (glance tiers, or an always-hidden glance-only
   root) without dropping the <h1> from the a11y tree. Reverse each property
   at the wide grid up to reveal the visible title. */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}
```

```html
<h1 class="heading">Monday, July 13</h1>
```

(The daily-plan sample names this element `.date`; the class is the
artifact's to pick, and the treatment is the shared one above. The shell's `*`
reset zeroes the browser's default `<h1>` margin, so no reset is needed.)

### Section

A 12px mono label, an optional count, and a hairline rule filling the
width. Drop the label entirely when the section is self-evident; never
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

**Rhythm: sections get more space than rows.** The space _between_ sections
must clearly beat the space _between rows_ inside one, or the artifact reads
as a single undifferentiated list instead of a page with parts. Keep rows
tight (4–6px); the shell separates sections at 14px on a tile, opening to 28px
on the page, so the "sections of a page" read strengthens exactly where
there's room for it.

**Every element that stacks sections carries `.stack`.** The separation is a
`gap`, and a `gap` reaches only its direct children — so the moment a section
sits inside a column wrapper that forgot the class, its label lands flush
against the row above, at zero. When a tier query reveals such a wrapper,
reveal it as `display: grid` — a `display: block` override silently drops the
gap and reintroduces the same flush labels. A healthy-looking `main { gap }` is no
evidence the rhythm survived; it is the usual companion to this bug, because
`main`'s own gap stops at `main`'s own children. Mark the wrapper and the
rhythm is right at any depth.

The tempting alternative — a sibling margin (`section + section`), which
reaches any depth without marking anything — is wrong here, and worth knowing
why. `+` matches siblings that are `display: none` and siblings that are
visually hidden. Tier queries hide sections constantly (the 1×1 stat, a
column that only appears on the page) and every artifact opens with an
`.sr-only` heading, so a margin-based rhythm silently prepends dead space to
whatever leads each tier — worst exactly at the glance sizes with the least
room to spare. A `gap` skips both, because a hidden element is not a grid
item at all.

### Ledger rows

The workhorse. One grid per list, rows as subgrid items, so key columns
(time, rank, repo, status dot) align down the whole list and wrapped text
keeps a hanging indent, so text never wraps under its bullet.

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
  /* One shared line box for the row — see below. */
  line-height: 20px;
}
.key {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-ink-dim);
  white-space: nowrap;
}
```

**One shared line box per row.** `align-items: baseline` shares a baseline
but _not_ a box. A row mixing 14px body with 12px mono keys builds line
boxes of 20.3px and 17.4px, so the row's height comes from the tallest cell
while every shorter cell carries different leading. Each cell's optical
centre then lands somewhere else, the group sits low inside its own padding,
and a column of those rows reads as drifting rather than set. Give the `li`
a **length** `line-height` (not a unitless ratio): a length inherits at the
same computed value whatever the cell's font-size, so every cell builds an
identical box and baseline and centre coincide. This is the ledger form of
the rule the app chrome already follows, that cells only align across a row
if they share a line-height.

Keep `align-items: baseline` once the boxes match. Baseline is what makes
mixed-size text sit on one line; centring equal boxes instead would leave
adjacent 14px and 12px text on baselines ~1px apart, which reads as a step.

```html
<ul>
  <li><time class="key">10:00</time><span class="body">Team standup</span></li>
</ul>
```

Add trailing columns by widening the template
(`max-content 1fr max-content`): the right column takes the value that
answers the glance (a count, an age, "9 need you"). Key colors are semantic:
orange for ranks/priority, aqua for times, yellow for carry-overs.

**Keep the track count equal to the children count.** A `subgrid` row
inherits every track the parent declares, whether or not the row has a cell
for it. Declare three tracks, give each `li` two spans, and the third track
still reserves its width: invisible dead space down the right of every row
that no cell will ever fill, silently widening the block past the measure
you thought you set. When a trailing value lives _inside_ a composed cell (a
bar and its number in one `.mag-cell`), that cell is **one** child, so the
parent declares two tracks, not three.

**The one-grid rule.** When the columns must line up across the _whole_
artifact rather than within one list — several sections under shared column
headers, the queue table below — the grid moves up to `main` and every layer
between it and the row relays it with `subgrid`. A grid per `<ul>` gives each
section its own column widths, which is the misaligned-state smell.

The relay is the part that gets dropped. `subgrid` inherits its tracks from
the parent grid, so an element whose parent is _not_ a grid has nothing to
inherit: the value computes to `none`, the row becomes a one-column grid, and
every cell stacks onto its own line. A `<section>` carrying the label and the
hairline is exactly the wrapper that gets left as a plain block. Every layer
relays, or none does:

```css
main {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) max-content max-content;
}
section, /* the relay — a plain block here collapses every row below it */
ul,
li {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: subgrid;
}
```

A broken relay fails `validate.mjs`, because it does not read as a CSS
mistake: the CSS looks right, and a header row that happens to sit directly
under `main` still aligns perfectly while every list under a section
collapses.

**Everything that is not a cell must be told to span.** Moving the grid up
to `main` turns every previously-innocent block into a grid _item_, and an
unplaced item lands in track 1 and sizes it. Three bite every time:

- The section `<h2>`. Left unplaced it sits in the first column and sizes
  that track to the label plus its action button — a dead rail down the left
  of every row — while its own `flex: 1` hairline collapses to nothing in a
  `max-content` track. The heading is not a cell.
- The fit script's `[data-fit-more]` note. It is an `<li>`, so a subgridded
  row rule claims it and drops "+2 more" into the **state** column, sizing
  that track to the note — and only on the tiers that actually overflow,
  which is why it reads as "the icons are indented on small tiles only".
- The **provenance line**. It is authored as a sibling of `main` in the
  samples, so it never meets the grid there; moving it inside — a one-line
  edit, and a tempting one, since the line reads as content — hands track 1
  a full sentence of dot-separated facts. That track is `max-content`, so it
  inflates to the whole sentence and the `minmax(0, 1fr)` body column beside
  it goes to **zero**: every row title vanishes and the trailing cells slide
  off the tile. Nothing about the CSS looks wrong, which is why this reads as
  "the widget broke" rather than as a mistake with an address.

All three want the same escape, and a subgridded row rule must not
out-specify it:

```css
main > :is(h1, .stat),
.tbl > h2 {
  grid-column: 1 / -1;
}
.tbl [data-fit-more] {
  grid-column: 1 / -1;
  display: block; /* opt out of the row rule above */
}
```

`validate.mjs` catches the general case: an unplaced direct child of a grid
whose first track is content-sized and whose tracks are relayed by a subgrid
descendant. It cannot catch a grid that spends its own tracks on its own
children (a ruler beside its list, in `max-content 1fr`), where
auto-placement is the design — so the rule above is the author's to hold.

The same trap catches any element whose `display` is tier-gated: folding it
into the relay rule (`.tbl, .tbl .colhead, .tbl ul { display: grid }`)
out-specifies its own `display: none` default and pins it open on every
tier. Relay the tracks there, and let the media query own `display`.

**Lead + detail.** A row body is never one undifferentiated sentence. A
list whose every row is a uniform 14px line reads as a wall, however good
the data. The body opens with a short **lead** (the item's name, the thing
to do, under ~6 words) at weight 500 full ink, and everything
else (evidence, ages, provenance, parentheticals) follows as **detail**
in ink-dim regular. Identifiers inside the body (ticket keys, PR numbers,
file paths) go 12px mono: they read as data riding in prose, not prose.
The emphasis is what makes a dense list scannable; more whitespace is not.

```css
.body .lead-txt {
  font-weight: 500;
}
.body .detail {
  color: var(--color-ink-dim);
}
.body .id {
  font-family: var(--font-mono);
  font-size: 12px;
}
```

```html
<span class="body"
  ><span class="lead-txt">Sign the Salesforce access PDF</span>
  <span class="detail"
    ><span class="id">DM-126</span> · Highest, open 5+ days</span
  ></span
>
```

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

**Scope the ledger's own rules to its direct children** — `.thing > ul` and
`.thing > ul > li`, never `.thing ul` / `.thing li`. Written as descendant
selectors they read fine right up until a row gains a nested list (a
Disclosure, a detail nest), at which point the inner list silently inherits
the ledger's grid template, its gaps, its row padding and its hairlines. The
grid template is the one that bites hardest: the inner list's columns are
resolved against tracks meant for a different row shape, so a 12px glyph
column can land at `0px` and the glyph overprints the text beside it. Nothing
errors and the validator can't see it; it just looks subtly wrong.

**Never let the value drift to the far edge.** A trailing value pinned to
the frame's right while its label sits at the left forces an eye-trek
across dead space, and the wider the surface the worse it reads. The `1fr`
body column is the culprit: it swallows every pixel of slack and flings the
value off to the right. Two tools close the gap, and a ledger with a trailing
value uses both.

**Cap the measure.** A trailing-value ledger should _not_ run edge to edge;
cap it (`max-inline-size` around `56rem`, left-aligned, slack falling to the
right, which is the daily-plan page idiom) so the value never sits more than
a saccade from its label. Only a genuinely wide multi-column table earns more
width, and it still caps: filling the frame means "up to the cap", never the
raw 1400px. This refines the shell's fill-the-frame note.

**Dot-leaders.** For a single-line row with one trailing value, end the body
in a quiet dotted rule that runs to the value, so the reader can track from
label to value along one line. The body becomes a baseline flex row: the words, then
a `.lead` that grows to fill the column up to the value. Leaders are for
single-line rows only; where bodies wrap (the page tier of a prose-ish
ledger), drop the leader and lean on the measure cap and the row hairlines.

```css
.body {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}
.body > span:first-child {
  /* the words — clamp to one line so the leader has a clean start */
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lead {
  flex: 1;
  align-self: baseline;
  height: 0.5em;
  min-width: 16px;
  border-bottom: 1px dotted var(--color-border-dim);
}
```

```html
<li>
  <time class="key">14:00</time>
  <span class="body"
    ><span>Deep — render path</span><span class="lead" aria-hidden="true"></span
  ></span>
  <span class="dur">1h30</span>
</li>
```

#### Magnitude bar (the drift-list archetype)

When the trailing value is a **count meant to be compared across rows** (N
drifts per Figma file, N failing checks per repo, N open per label), a bare
number flung right reads one row at a time, forcing the reader to fetch each
figure and hold it to rank them. Render the count as an inline bar whose
**length** encodes it against the section's max, the figure kept at the bar's
end. Now the rows sort themselves by length at a glance and the exact number
is still there to read. Bars share one origin and one scale, with the section
setting `--max` and each row setting `--n`, so lengths compare honestly. It's
a bar, not a meter: no track behind it, because a count of drifts has no
denominator to fill.

```css
ul.mag {
  grid-template-columns: max-content 1fr minmax(120px, 180px);
}
.mag-cell {
  display: grid;
  grid-template-columns: 1fr max-content;
  align-items: center;
  gap: 8px;
}
.mag-cell .track {
  position: relative;
  height: 6px;
}
.mag-cell .track > i {
  position: absolute;
  inset: 0 auto 0 0;
  width: calc(clamp(0, var(--n) / var(--max), 1) * 100%);
  min-width: 2px;
  border-radius: 3px;
  background: var(--color-orange);
}
.mag-cell .n {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-ink-dim);
  text-align: right;
}
```

```html
<ul class="mag" style="--max: 12">
  <li style="--n: 12">
    <a class="key" href="…" target="_blank" rel="noopener">Checkout</a>
    <span class="mag-cell"
      ><span class="track"><i></i></span><span class="n">12</span></span
    >
  </li>
  <li style="--n: 3">
    <a class="key" href="…" target="_blank" rel="noopener">Settings</a>
    <span class="mag-cell"
      ><span class="track"><i></i></span><span class="n">3</span></span
    >
  </li>
</ul>
```

Colour the bar only when the count carries state. For a drift list orange
is right, since drifts want attention; an inert magnitude stays a quiet
neutral (`var(--color-ink-faint)`). The one-accent-per-tier rule still
holds: on a drift list the bars _are_ that accent, so nothing else on the
tile competes.

**The inline-span trap.** Every bar in this language is drawn on a
`<span>`, and `height` / `width` **do nothing on an inline box**. The
markup above only works because `.mag-cell` is `display: grid`, which
blockifies `.track` as a grid item. Lift that same `<span class="track">`
into an ordinary inline context — a hand-rolled `name · bar · %` row, a
bar dropped inside a `<summary>` — and it computes to `display: inline`,
collapses to **0×0**, and the percentage-width `<i>` inside it resolves
against a zero-width containing block. The bar vanishes in total silence:
no error, no overflow, no layout shift, and the row still looks plausible
because the trailing number is right there. It is invisible in review and
has shipped that way.

So any bar outside a grid/flex parent states its own box:

```css
.track {
  display: block;
  width: 100%;
  position: relative;
  height: 4px;
}
.track > i {
  position: absolute;
  inset: 0 auto 0 0;
  height: 100%;
}
```

Verify by measurement, never by eye: a bar whose
`getBoundingClientRect().height` is `0` is the bug, and a screenshot of a
cropped tile will not tell you.

#### Queue table (the PR-queue archetype)

For rows of tracked items that each carry an identity plus several
independent states: a PR queue (review state, CI, who's waited on), an
issue triage, a job board. Two rules make or break it:

**Every state gets its own column.** A cell holding two states ("approved"
_and_ a CI cross _and_ a needs-you marker) can never align with its
neighbours, which is the misaligned-state smell. The row template reserves
one fixed column per state, aligned down the whole artifact by the one-grid
subgrid rule, and a row without that state leaves the cell **empty** (no
dash, no filler dot, since absence reads cleaner than punctuation):

```css
ul.queue {
  /* key · title · review · ci · marker · age
     (+ ticket/size columns from the wide tier up) */
  grid-template-columns: max-content 1fr max-content max-content max-content max-content;
}
.st {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-mono);
  font-size: 12px;
}
.st.ok {
  color: var(--color-green);
}
.st.bad {
  color: var(--color-red);
}
.st.dim {
  color: var(--color-ink-faint);
}
.st .word {
  /* tile tiers: the word lives in the a11y tree and the title attr */
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}
@media (min-width: 700px) {
  .st .word {
    position: static;
    width: auto;
    height: auto;
    clip: auto;
  }
}
```

**States compress to icons on tiles, words on the page.** At tile widths
the state cell is the icon vocabulary alone (with the word one hover away
via `title` and present for the a11y tree, via the sr-only span above); from
the wide tier (`≥700px`) and on the page the 12px mono word returns beside
the icon. Never a worded pill per row in a queue: twelve "changes
requested" pills out-shout the twelve titles they annotate.

```html
<li>
  <a class="avatar-link" href="…" target="_blank" rel="noopener" title="…">…</a>
  <span class="body"
    ><a href="…" target="_blank" rel="noopener"
      >#341 seed Admin registration mutations</a
    ></span
  >
  <span class="st bad" title="changes requested"
    ><svg><!-- lucide circle-x --></svg><span class="word">changes</span></span
  >
  <span class="st ok" title="CI passing"
    ><svg><!-- lucide check --></svg><span class="word">ci</span></span
  >
  <span class="st"><!-- needs-you marker: enhancer-added --></span>
  <span class="key">3d</span>
</li>
```

The queue's glance answer is the **marker column** (needs you / blocked),
not a rainbow of state pills: keep review-state icons in their semantic
tone at low volume (a passing CI check is `ink-faint`, since healthy states
stay quiet), and let the one orange marker carry the "act here" signal.
A marker earns its column only where it **varies** row to row: if the
section heading already asserts what the marker would say (a `Needs your
review` group whose every row is "needs you"), the marker is the heading
restated in the accent color on each line — drop it and its column there,
and let the heading carry the signal.

**A recommendation list is a queue, not a ledger.** The archetype reaches
past PRs to anything that is _findings plus per-finding qualifiers_ — a
gap/drift audit, a triage list, a lint report. The tell that one has been
built as a ledger instead: a worded pill per row, and two qualifiers sharing
one trailing cell. `docs/samples/ticket-gaps.html` is the worked example.
Three failures come as a set, and so do their fixes:

- **The pill rail.** Fifteen `gap`/`drift` capsules down the left out-shout
  the fifteen titles, and stretching them to fill a fixed column only makes
  each one wider. Same fix as any queue state: the glyph column, word
  sr-only + `title` on tiles, word back from `≥700px`. Capsules are for
  states that appear _occasionally_; a column where every row has a value is
  a column, not fifteen badges.
- **The trailing blob.** A confidence and a ticket key rendered side by side
  in one flex cell, both 12px mono ink-faint, read as one string — and an
  unnamed `high` reads as a _priority_, which is a different claim about the
  row. Give each its own track, and from the 2×2 tier up **name the value
  columns** in a 12px mono ink-faint header row that relays the same subgrid.
  Naming the column is the fix; restyling the value is not.
- **The rating that spends an accent.** A three-step qualifier (confidence,
  certainty, severity-of-evidence) does not need a colour or a new glyph:
  keep the word and step it down the **neutral ink ramp** (`high` ink, `med`
  ink-dim, `low` ink-faint), so trust reads as how loud the row is and the
  column self-sorts. State is still never colour alone — the word carries it.

The absence rule earns its keep here: with the column named, ten rows of
`no ticket` become ten empty cells, and the eye stops reading filler.

**Per-row actions are icon buttons.** A row-level action (copy, dismiss,
open) is the icon vocabulary in a borderless button, never an outlined
capsule per row — that is the pill rail again wearing a border. Keep it
always present and tappable rather than revealed on hover, give it ≥24px of
target centred on the row's _first_ line, and put the word in an sr-only
span so it is still the button's accessible name and can flip to "Copied".
One button that acts on the whole section (Copy all) keeps its word: it is
one, not fifteen.

### Disclosure (the rows behind a derived figure)

A widget states derived figures — a bar's %, a readiness count, a verdict.
The reader who wants to _check_ one needs the rows it was derived from, and
that evidence is far too long to sit on the surface. A `<details>` under the
figure carries it: **the summary line is real information even closed**, and
opening it lists the underlying records.

Use it when a figure is an aggregate someone will want to audit or reconcile.
Not for content that simply didn't fit — that's the fit pass's job, and
`+N more` is its honest answer.

**Page tier only.** Tiles never scroll (ADR-0019), so a body that opens on a
tile expands straight into the clipped region. This is the Meter's
progressive-disclosure rule made concrete: hidden on tiles, shown on the
raw/full page. Where the summary line was already visible content (a caption
under a rail), keep it on tiles and drop only the affordance and the body.

Native `<details>`, never a modal or a popover. It needs no JS and no
same-origin, several can be open at once (which is the point when the reader
is comparing rows), it is keyboard-operable for free, and it keeps the
evidence in place instead of covering the figure that prompted the question.

```css
.disclose > summary {
  display: flex;
  align-items: baseline;
  gap: 6px;
  cursor: pointer;
  list-style: none;
}
.disclose > summary::-webkit-details-marker {
  display: none;
}
.disclose > summary:focus-visible {
  outline: 1px solid var(--color-ink-dim);
  outline-offset: 3px;
}
.chev {
  width: 12px;
  height: 12px;
  flex: none;
  align-self: center;
  color: var(--color-ink-faint);
}
.disclose[open] > summary .chev {
  transform: rotate(90deg);
}
/* The one sanctioned motion: state feedback on a user toggle, not entrance
   choreography. The no-motion rule governs what happens on load. */
@media (prefers-reduced-motion: no-preference) {
  .chev {
    transition: transform 120ms ease-out;
  }
}
.dsum {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-ink-dim);
}
.dbody {
  display: grid;
  gap: 14px 32px;
  margin: 8px 0 2px 18px;
}
html[data-steward-tile] .disclose > .dbody,
html[data-steward-tile] .disclose > summary .chev {
  display: none;
}
html[data-steward-tile] .disclose > summary {
  pointer-events: none;
  cursor: default;
}
```

```html
<details class="disclose">
  <summary>
    <svg class="chev" aria-hidden="true"><!-- lucide chevron-right --></svg>
    <span class="dsum">19 tickets · 6 landed · 2 in review · 8 planned</span>
  </summary>
  <div class="dbody">…</div>
</details>
```

**The summary line earns its row.** `Show details` is a wasted line; a
distribution (`19 tickets · 6 landed · 2 in review · 8 planned`) is the
figure's composition, readable without opening anything. When some rows want
attention, put the tally there too, so a problem is findable without opening
every disclosure in the list.

**One grid for the whole body, not one per group.** A grouped body is the
one-grid rule's case exactly: put the tracks on `.dbody`, relay `subgrid`
through group → list → row, and span group headings `1 / -1`. Sized
per-group instead, each group resolves its own `max-content` and the
trailing column steps right at every heading. The groups are headings
_within one list_, so the columns line up across the whole of it — and every
layer relays or none does, `.dgroup` included.

**Group on the axis the parent leaves open.** A disclosure under a workstream
has its workstream fixed, so it groups by milestone and each row carries
state; the same component under a milestone groups by state and each row
carries the workstream. Repeating the group's own axis on every row inside it
is the redundancy to avoid — the row template differs, the component does not.

The trailing-value rules apply in full: give the list a trailing slack column
so its metadata column sits a saccade from the row, never at the frame edge.

### Link

Anything that names an object living elsewhere, such as a PR, an issue, or
an event, is an anchor to it, always with `target="_blank" rel="noopener"`
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
one supporting line. Not a hero metric; it replaces the sections at 1×1
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
Color only when it means something; a healthy state usually needs no
pill at all. A pill may lead with its state's icon (the Icon vocabulary,
12px, `currentColor`), since icon + word in one capsule reads faster than
the word alone and costs 16px. When pills sit in a ledger column, the column
is fixed-width and the pill **centers vertically on its row**
(`align-self: center`, never baseline, because a capsule on a text baseline
floats high) and aligns with its neighbours down the list.

**One pill per row is a column wearing a costume.** If every row in a list
carries one, it is a state column and belongs in the Queue table's glyph
form, not a capsule rail — see that section. And centring only survives
single-line rows: on a row whose body wraps to a lead plus a detail line,
`align-self: center` floats the marker down _between_ the two lines, where it
reads as annotating the wrong row. A marker beside a possibly-wrapping body
takes `align-self: start` on a box the height of the row's line-height, so it
centres on the row's **first** line.

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
.pill svg {
  width: 12px;
  height: 12px;
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
unreachable). Never encode state by the dot alone; pair it with text
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

Pictograms are inline lucide SVGs from the app chrome's icon set (paste the
paths from lucide.dev): 12px in ledger keys, `stroke="currentColor"` so
the key's semantic color carries through, stroke-width 2, round caps,
`aria-hidden="true"`. An icon never replaces visible text, since the section
label or row body carries the meaning. There is **one exception**: a fixed
state column at tile widths (the queue table), where the word lives
sr-only + in the cell's `title` and returns visibly from the wide tier up.
No dingbat glyphs (↻ ⟳ ⚠ ➜): they render soft and font-dependent, never
sharp.

**One vocabulary, board-wide.** The same state always wears the same lucide
glyph, so a reader who learned one widget has learned them all:

| state                       | lucide               | tone                                       |
| --------------------------- | -------------------- | ------------------------------------------ |
| approved / passing / done   | `check`              | green, or ink-faint when healthy-is-boring |
| changes requested / failing | `circle-x`           | red                                        |
| draft / in progress         | `pencil`             | ink-faint                                  |
| pending / waiting           | `clock`              | ink-dim                                    |
| drift (built ≠ spec)        | `git-compare-arrows` | yellow                                     |
| gap (spec'd, not built)     | `circle-dashed`      | orange                                     |
| carried over                | `redo-2`             | yellow                                     |
| blocked                     | `octagon-x`          | red                                        |
| record in doubt / to check  | `circle-alert`       | yellow                                     |

Don't mint a new glyph when a listed state fits; when a genuinely new
state needs one, pick the plainest lucide match and use it everywhere.
Plainest, specifically: `git-compare-arrows` is six strokes and turns to
mush at 12px, which is why "record in doubt" takes `circle-alert` rather
than borrowing the drift glyph.

**The progress-ring family (a lifecycle, not a set of states).** When a
row's state is one **position along a single track** — planned → in
progress → in review → landed — the glyphs are not independent
pictograms, they are one disc at four fill fractions: `○` planned (ring
only), `◐` in progress (half wedge), `◕` in review / nearing
(three-quarter wedge), `●` landed (full disc, and the only tinted one,
`--color-green`). Fill fraction _is_ the encoding, so shape carries the
vocabulary and colour stays out of it.

Two rules keep the family readable:

- **Never mix a pictogram into the ring family.** Swapping lucide
  `check` in for "landed" is the tempting move — it means done
  everywhere else in this table — but a bare tick has no disc, so it
  breaks the silhouette the other three rows teach and the column stops
  reading as one scale. Inside a lifecycle, `●` means done; `check`
  stays for standalone binary states (a CI cell, an approval).
- **Draw the fraction as an arc, never a pie slice.** A circle plus a
  radius plus an arc renders as a **clock face** at 12px, which reads as
  "pending/scheduled" — a different state in the table above. The radius
  line is what makes the hand; drop it and stroke a thick arc over a thin
  base ring instead.

One geometry serves all four: `r="5"` gives a circumference of
`2π·5 = 31.42`, so the fraction is just the first number of the
`stroke-dasharray`, and `rotate(-90 6 6)` starts it at twelve o'clock.

```html
<!-- planned: base ring only -->
<svg class="ring" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
  <circle
    cx="6"
    cy="6"
    r="5"
    fill="none"
    stroke="var(--color-border-dim)"
    stroke-width="1.3"
  />
</svg>

<!-- in progress: half arc (15.71 = 31.42 / 2) -->
<svg class="ring" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
  <circle
    cx="6"
    cy="6"
    r="5"
    fill="none"
    stroke="var(--color-border-dim)"
    stroke-width="1.3"
  />
  <circle
    cx="6"
    cy="6"
    r="5"
    fill="none"
    stroke="var(--color-ink)"
    stroke-width="2.4"
    stroke-dasharray="15.71 31.42"
    transform="rotate(-90 6 6)"
  />
</svg>

<!-- in review: three-quarter arc (23.56) — swap the dasharray only -->
<!-- landed: solid disc, the one tinted state -->
<svg class="ring" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
  <circle cx="6" cy="6" r="5" fill="var(--color-green)" />
</svg>
```

A dropped/cancelled row stays in the family too: the base ring plus a
small ink-faint ✕, not a red pictogram.

Where a widget shows both an aggregate strip of these counts and rows
carrying the same states, the strip is what teaches the vocabulary, so
the rows **must** use the identical four glyphs.

**Align the glyph to the first line, not the row.** A state glyph in its
own grid cell defaults to sitting against the row's full height, so on a
row that wraps to three lines the icon drifts to the vertical middle and
detaches from the key it labels. Inline glyphs (`.key svg` above) already
ride the first line via `vertical-align`; a glyph that owns a cell states
it:

```css
.row > .glyph {
  align-self: start;
  /* optical: centre the 12px glyph on the first line box, not its top */
  margin-top: 0.15em;
}
```

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

(That path set is lucide `redo-2`, the daily-plan sample's carried-over
key.)

### Avatar

A person as a ledger key: an 18px round image inlined as a data URI
(fetched at generation time, ≤48px source, since widget-standard rule 1
forbids images by URL), wrapped in a link to the person's profile so
the picture is the click-through to _who_. The link's `title` and the
img's `alt` carry the person's **display name** (`Daniel Moraes`, not
the handle `danielmoraes`), so hover answers _who_; identity never
rides on the picture alone. When no image could be inlined, fall back
to the initial form: same footprint, one mono capital, still linked.
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

#### Where the face comes from (ADR-0044)

Rule 1 means the bytes must be in the file, so a run has to resolve every
person **before** it authors anything. Resolve once per person and reuse on
every row — a window has far fewer people than it has rows.

Four steps, each falling into the next:

1. **The people registry**, when the routine sets `params.people` (an
   `owner/repo:path` naming a committed JSON map, `login → { name, src,
jira? }`, whose `src` is a 48px `data:` URI). Read it from the mounted
   checkout; fall back to `gh api repos/<owner>/<repo>/contents/<path>`
   (base64 in `.content`) if the repo is a source the environment did not
   check out. Keys are lowercased, so look up
   `login | tr '[:upper:]' '[:lower:]'`.
   **This is the only step that cannot fail by environment** — no network,
   no host, no token scope. It is why the chain exists in this order.
2. **`gh api users/<login>`** for the display name (`.name // .login`) of
   anyone the registry doesn't carry. `api.github.com` is reachable
   everywhere, so this step is dependable even where the next one isn't.
3. **The avatar image**, best-effort, for those same people:

   ```bash
   for attempt in 1 2; do
     [ -n "$avatar_url" ] && gh api "${avatar_url}&s=48" > "$tmp/$login" 2>/dev/null && break
     curl -fsSL "${avatar_url}&s=48" -o "$tmp/$login" && break        # no auth header
     curl -fsSL "https://github.com/$login.png?size=48" -o "$tmp/$login" && break
     sleep 2
   done
   ```

   Verify it is an image (`file -b --mime-type`) before base64ing it into a
   `data:<mime>;base64,…` URI — never inline an error page as if it were a
   face. **Expect this step to fail on scheduled runs.** Every path here
   ends at `avatars.githubusercontent.com`, which a repository-scoped cloud
   session does not reach; the same code gets every face locally. That split
   is the whole reason for step 1, and it is not worth reporting.

4. **The initial circle** — the floor, and a legitimate render.

**Report a missing face only when it has an address.** Someone _in_ the
registry rendering as an initial is a data bug worth one clause in the
provenance line (they need a `github:` or an `avatar:` upstream). Someone
outside it — a bot, an outside contributor, a first-time committer — is
expected and silent. An undifferentiated "avatars unavailable" caveat says
nothing actionable and trains the reader to skip the line.

#### When the person is a ticket assignee, not a login (ADR-0045)

The chain above resolves a **GitHub login**. A widget built on Jira holds no
login — it holds whatever the assignee field carried. Those widgets join on
the assignee's **`accountId`**, matched against each registry entry's `jira`
(compared as typed: accountIds are case-sensitive and opaque, unlike a login).
Steps 2 and 3 have no equivalent here — there is no reachable
`api.github.com` for a Jira identity — so the chain is two steps: registry,
then the monogram.

**Never join on the display name.** It is right there in the payload and it
looks like the key. It is not: Jira and a Slack-sourced roster disagree about
a third of a team — `Mark Cosca` is `Mark Dylan`, `Joshua Roxas` is
`Joshua Gabriel`, `John Albert De Guzman Angeles` is `John Angeles`. A name
join resolves most rows and silently drops the rest, and a dropped row is
indistinguishable from a person who never uploaded a photo, so it fails
without ever looking broken. The email is not a key either — the same person
is `dylan@theformfactory.co`. Any identity space worth joining on has an
opaque stable id; use it, and treat the readable field as a label.

The `accountId` arrives free: it sits in the same assignee object a query
already returns when it asks for the field at all, so this costs no extra
call.

**A registry that is set but unreadable is the loud case.** Registries live
in private repos, and a run reaches one only if that repo is in the
routine's `repos:` (ADR-0018) and the account running it has access —
neither of which is true by default, and both of which can be revoked
without touching the routine. The fallback chain will quietly carry such a
run all the way down to initials, which looks exactly like a routine that
never configured a registry at all. So: `params.people` set and the read
failing is a **configuration defect**, named in the provenance line with the
repo it could not read. Silence there is how this bug class stays invisible
for another few months.

### Meter (and the one-progress rule)

Progress as a segmented bar (done/total), 4px tall: one shape plus its
exact value, the way the sparkline pairs a line with its endpoint label.
Use for genuinely bounded progress only.

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

**One progress representation per widget.** Progress is a single
question (_how far along?_), so it gets a single answer. A bar, a percent
ring, and a numbered stepper stacked together are the same number drawn
three times: the reader has to reconcile three things that must always
agree, and none of them carries what the others left out. Pick the _one_
encoding that fits the glance, then demote the rest:

- **Meter** when the whole is small and countable and the _shape_ of
  done-against-todo means something.
- **A single mono caption** (`8/13`, or `62%`, never both) when only the
  magnitude matters and there's no room for a bar. It rides in the section
  count (`h2 .count`) or beside the bar as 12px mono ink-dim, and it _is_
  the meter's text label either way, so the bar never stands on color and
  length alone (a screen reader needs the number, so `role="img"` +
  `aria-label` carries it). One shape and one number are still one
  representation, the way the stat is a num plus its label; two textual
  encodings of the same total (a percent _and_ a fraction) are not.
- **The ledger's own order** when "progress" really means _which items are
  done_. The list already shows that, and a bar on top of it is the
  redundant copy. Let done rows recede (ink-faint) and the live ones sit
  full ink.

The structures a progress widget reaches for all collapse into that one:

- A **second or third bar/ring/stepper** of the same total → delete.
- A **legend** decoding the colors → delete; one encoding with semantic
  tone needs no key, and any state word rides on its own row (the
  status-dot rule), never in a separate map.
- A **stepper** of numbered circles → the meter's segments already _are_
  the steps. Keep numbered steps only when they're named stages the reader
  acts on, and then they're ledger rows (rank in the mono key), not a
  second bar above the first.
- **Sub-rows** splitting each item into parts → progressive disclosure:
  hidden on tiles, shown on the raw/full page
  (`:root:not([data-steward-tile])`). If the per-item breakdown _is_ the
  widget's one representation, with each row carrying its own meter, then the
  board-level total is what demotes: it drops to a mono count in the
  section label, not a second aggregate bar.

Same discipline as the day strip (Time blocks): one underlying quantity,
one rendering per tier, never three at once on the same surface. The
collapse:

```html
<!-- ✗ one 8-of-13 quantity drawn six ways: a ring AND a bar AND a
     stepper, a percent AND a fraction, a legend, plus per-item sub-rows -->

<!-- ✓ one shape, one number; the ledger carries which items -->
<h2>Migration <span class="count">8/13</span></h2>
<div class="meter" role="img" aria-label="8 of 13 widgets migrated">
  <span class="on"></span><span class="on"></span><span></span
  ><!-- … -->
</div>
<ul>
  <li class="done"><span class="key">daily-plan</span><span>migrated</span></li>
  <li><span class="key">ticket-gaps</span><span>pending</span></li>
</ul>
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

### Coupling matrix (a pairwise quantity)

The one two-dimensional component (ADR-0047). Every other component says
something about one subject; this one says something about a **pair** —
how strongly two modules are coupled, how often two people review each
other, any square relation the artifact needs to show as a field rather
than as a list. Reach for it when the finding is a _cluster_: forty pair
names in a ledger hide what one dense corner of a matrix shows at a
glance.

**Never draw a node-link graph instead.** Layout is the part a blind,
single-pass author cannot do — no solver in the sandbox, no measurement
of the box, and edge crossings decide readability by luck. A matrix has
no layout: the labels place the cells. It also degrades in place, so the
tile and the full view show the same picture with fewer rows, not two
unrelated pictures.

**Rows and columns carry the same order, so the row labels are the
column key.** Columns are numbered `1..N` matching the row at that
index; full words never sit above a 14px column, so nothing rotates and
nothing is abbreviated into unreadability. The column `<th>` carries the
real name as its accessible name.

Markup is a real `<table>` — this is tabular data, and `scope`'d headers
give screen readers row/column association no `<div>` grid can:

```html
<table class="matrix">
  <caption class="sr-only">
    Module co-change, last 90 days
  </caption>
  <thead>
    <tr>
      <td></td>
      <th scope="col" aria-label="cart">1</th>
      <th scope="col" aria-label="checkout">2</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th scope="row"><span class="n">1</span> cart</th>
      <td class="dg" title="cart — 41 files">
        <span class="sr-only">cart, 41 files</span>
      </td>
      <td
        style="--c: 71"
        class="undeclared"
        title="cart ↔ checkout — 71%, no import"
      >
        <span class="sr-only">cart and checkout, 71 percent, no import</span>
      </td>
    </tr>
    <tr>
      <th scope="row"><span class="n">2</span> checkout</th>
      <td
        style="--c: 71"
        class="undeclared"
        title="checkout ↔ cart — 71%, no import"
      >
        <span class="sr-only">checkout and cart, 71 percent, no import</span>
      </td>
      <td class="dg" title="checkout — 12 files">
        <span class="sr-only">checkout, 12 files</span>
      </td>
    </tr>
  </tbody>
</table>
```

```css
.matrix {
  border-collapse: separate;
  border-spacing: 2px;
  font-family: var(--font-mono);
  font-size: 12px; /* the label floor — never smaller to fit more columns */
  color: var(--color-ink-dim);
}
.matrix th {
  font-weight: 400;
  white-space: nowrap;
}
.matrix tbody th {
  text-align: left;
  padding-right: 6px;
}
.matrix tbody th .n {
  color: var(--color-ink-faint);
  margin-right: 4px;
}
.matrix td {
  width: 14px;
  height: 14px;
  padding: 0;
  border-radius: 2px;
  /* One token, one ramp: --c is the pair's strength, 0–100. */
  background: color-mix(
    in srgb,
    var(--color-orange) calc(var(--c, 0) * 1%),
    var(--color-bg2)
  );
}
/* The diagonal is the module against itself — the spine, not the
   strongest coupling on the board. Quiet tone, never the accent. */
.matrix td.dg {
  background: var(--color-bg3);
}
/* The finding: this pair changes together with nothing declared
   between them. The ring survives any shade underneath it. */
.matrix td.undeclared {
  box-shadow: inset 0 0 0 1.5px var(--color-red);
}
```

**The marker is the argument.** A hot cell only means "these change
together"; a hot cell with **no declared edge** means coupling nobody
wrote down — invisible to the import graph and to every linter guarding
it. Mark that case and only that case. The inverse (a declared edge that
never co-changes) is a healthy seam and needs no marker; the ledger's
own fan-in/fan-out already carries it.

**Color never stands alone, and `title` is not the answer.** Every cell
carries a real **`.sr-only` text node** stating its pair and value. A
tooltip is supplemental hover text: it is unreachable by touch, skipped
by keyboard navigation, and announced inconsistently across screen
readers — so a cell whose only text is a `title` is, to a good share of
readers, an empty box. Keep the `title` for the sighted hover, and let
the sr-only node be the accessible content. Empty cells with a tooltip
are the failure this rule exists to prevent; the same discipline as the
meter, which pairs its shape with a number rather than standing on color.

Values inside the node are **spoken, not typed**: `71 percent`, not
`71%`, and `and` rather than `↔`, because a screen reader reads the glyph
aloud or drops it.

**Cap by tier; never crop.** N modules cost N² cells, so the matrix is a
designed tier like everything else (ADR-0019): tiles render a **fixed**
top N by whatever the artifact ranks on — an exact number with a stated
tie-breaker, never "about eight", or two runs over one tree draw
different matrices — the full view renders all of them, and the count
held back is **stated**, computed from the uncapped set
(`+12 modules in full view`). A matrix sliced by the frame's clip is a
contract violation, not a compromise. Below 4 rows there is no field left
to see — drop to the ledger and let the pairs be rows.

### Time blocks (the Newport day)

The plan archetype plans the whole day, not just meetings: every
30-minute slot has a job. A block's **label is concise**, carrying the type,
the project, and a few words (`Deep — Corza: review queue`), never an
enumeration of tickets; work blocks name their project (`Type — Project: task`)
so time can be summed per project. Details live beside the block, not inside
it (see the details column below). Blocks are typed classes carrying a
`--tone`; `--s` is the span in 30-minute slots:

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

- **Tile ledger**: the rows component with a trailing duration column
  (`14:00 · Deep — … · 1h30`). Hierarchy by ink, not fills: deep bodies
  full ink at weight 500, free bodies ink-faint, the rest ink-dim.
- **Day strip**: a 6px proportional bar under the section rule, one
  segment per block at `color-mix(tone 65%)` (free stays `bg3`, the
  unfilled track), a 2px orange tick at now. Script-built from the list;
  the shape of the day at glance size, kept on every tier. Above the
  time grid it's the day's summary line.
- **Time grid (any wide surface tall enough for the day)**: the paper
  planner, gated on size, not the tile stamp:
  `@media (min-width: 900px) and (min-height: 600px)`. The raw page,
  the full view, and board tiles from ~4 rows up all render it; shorter
  tiers keep the ledger. Pages get 26px per 30-minute slot; tiles never
  scroll, so there the day flexes to spend exactly the section's height
  (`container-type: size` on the day, children take
  `--slot: max(22px, calc(100cqh / var(--slots)))`, with
  `--slots` script-set from the block list). A script-built 12px mono
  ruler labels every slot from day start to day end (hours `08:00`
  ink-dim, half-hours a quiet `:30` ink-faint); the ruler's hairline
  right edge is the grid's only ruled line, with no hour or half-hour
  rules across the day, so the boxes and the now line alone cross it. A
  block is a drawn box spanning `--s` grid rows: 1px
  `color-mix(tone 45%)` border over a `color-mix(tone 12%)` wash, with no
  time key inside the box (the ruler carries the times). Free slots
  stay unboxed, so blank space against the ruler reads as unplanned time.
  The box carries **only the concise label**, and everything else moves
  off the block into a **details column** to the grid's
  right (a third grid column, `minmax(180px, 280px)`) carries each
  block's `goal:` note as 12px ink-dim text spanning the same grid rows
  as its block, top-aligned to the block's start, a hairline's gap from
  the box it annotates, and clamped to the block's height **in whole
  line boxes**: round the available height down to a multiple of the
  line box (`max-height: max(1lh, round(down, calc(100% - 2px), 1lh))`
  over an `overflow: hidden`, with the raw `calc(100% - 2px)` clamp
  declared first as the fallback), so an overflowing note truncates at
  a line edge. A mid-line crop of half-height letters is the one way
  this column must never degrade: the widget standard's no-ambiguous-
  crop rule applies inside the artifact too, not just at the tile edge.
  The note sits _beside_ the time it belongs to and the grid stops
  wasting its right half. Every block still carries a `title` tooltip
  with its full range, label, and note, so nothing clamped is lost. The now line crosses the grid at the
  current time, its mono chip sitting in the ruler gutter,
  calendar-style; the script measures a ruler row for its position (the
  tile tier's `--slot` is a container expression, not a length). The chip
  masks the line where the text crosses it, so its background matches the
  page surface: the authored `--color-bg1` on the raw page and full view,
  but `--color-bg` on a tile (`html[data-steward-tile] .nowline span`),
  which the frame flushes the page to; the gutter is bare page, not an
  elevated `bg1` panel, so a fixed `bg1` chip reads as a pale block there.

Two `.totals` lines (12px mono) state the process metrics on wide tiers
and the page, showing where the time goes **by type** (tone dots:
`4.5h deep · 1h meetings · 3h shallow · 30m free`) and **by project**
(no dots, ink-dim: `corza 4h · steward 1h30`), summed from the work
blocks' `Type — Project: task` labels. Personal and free blocks carry no
project and stay out of the second line.

### Now marker (timelines)

For today-scoped time lists: dim rows whose time has passed
(`color: var(--color-ink-faint)` on key and body; `opacity: 0.55` on
grid boxes) and insert a thin accent rule with a mono `HH:MM now` label
between past and future. Gate on the generated-at date still being
today. Keep it live: re-render the whole now state (dimming, marker,
grid now line, strip tick) on a 30-second timer plus `visibilitychange`
and `resize`, so an open page tracks the day without a refresh, and
clear it once the date rolls past the plan's. Past rows are never
hidden, on any tier: the plan is a record of the day, not a queue;
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

### Stage strip (the act timeline)

A project's named acts as one horizontal row: a **real sequence with one
current act**, the altitude read ("which act are we in"). It is not a
progress bar and never duplicates one. The meter answers _how far_, the
strip answers _where_, and a widget may carry one of each, no more.

Anatomy is **dot → label → connector**, per item: the connector joins an
item to the _next_ one, so a label can never collide with the following
act's dot (connector-before-label is the collision bug). Done acts read
ink-dim with a filled dot; the current act full ink at weight 500 with an
**orange now-dot** (the sanctioned now marker, which spends the tile's
accent budget); upcoming acts ink-faint with a hollow ring. The strip is
a whole row of chrome, so gate it on **height** (roughly
`min-height: 560px`, meaning page-tall surfaces), never width: a
short-wide tile spends its rows on content.

```css
.stage ol {
  list-style: none;
  padding: 0;
  display: flex;
  align-items: center;
}
.stage li {
  display: flex;
  align-items: center;
  flex: 1;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-ink-faint);
}
.stage li:last-child {
  flex: none;
}
.stage .dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  flex: none;
  border: 1px solid var(--color-ink-faint);
}
.stage .label {
  margin-left: 6px;
  white-space: nowrap;
}
.stage .conn {
  flex: 1;
  min-width: 14px;
  height: 1px;
  background: var(--color-border-dim);
  margin: 0 10px;
}
.stage li.done {
  color: var(--color-ink-dim);
}
.stage li.done .dot {
  border-color: var(--color-ink-dim);
  background: var(--color-ink-dim);
}
.stage li.now {
  color: var(--color-ink);
  font-weight: 500;
}
.stage li.now .dot {
  border-color: var(--color-orange);
  background: var(--color-orange);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-orange) 25%, transparent);
}
```

```html
<ol>
  <li class="done">
    <span class="dot"></span><span class="label">Discovery</span
    ><span class="conn"></span>
  </li>
  <li class="now">
    <span class="dot"></span><span class="label">Build</span
    ><span class="conn"></span>
  </li>
  <li><span class="dot"></span><span class="label">Launch</span></li>
</ol>
```

(The Meter's anti-stepper rule stands: numbered circles duplicating a
bar are still banned. Use the strip only when the acts are genuinely
named stages and the current one is a fact, not a percent.)

### Provenance line

The run's method facts (what was audited, how much, what was held back,
which knobs applied) belong to the reader who asks "can I trust this?",
not to the glance. They render as **one quiet mono line directly above the
footer**, dot-separated facts, never a paragraph:

```html
<p class="provenance">
  38 kb pages audited · 9 features · 8 data · 9 integrations · 11 nfrs · 12 held
  back as duplicates
</p>
```

```css
.provenance {
  /* Inert wherever the line is a plain block, load-bearing the moment it
     sits inside a grid: as an unplaced item it would land in track 1 and
     size that track to the whole sentence (see · Everything that is not a
     cell must be told to span). Carry it always — the line moves between
     shells more often than the shells get re-read. */
  grid-column: 1 / -1;
  display: none;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-ink-faint);
}
@media (min-width: 700px) {
  .provenance {
    display: block;
    margin-top: auto;
    padding-top: 10px;
  }
  /* The provenance line takes over the footer's auto margin — two autos
     would split the slack and strand the line mid-page. */
  .provenance + footer {
    margin-top: 0;
  }
}
```

Author it as a **sibling of `main`**, directly before the `<footer>`, the way
the samples do; it is the run's chrome, not a section. Inside a page grid it
is legitimate too (the `"prov prov prov"` area above), which is exactly why
the span above travels with the component.

**Never prose.** A sentence about the method sitting among the sections
reads as misplaced body copy (the blob smell); decompose it into countable
facts. **Never content.** Anything the reader should _act_ on (a ticket
already unblocked, a finding) is a section or a row, however
provenance-flavored it sounds. **Glance tiers drop it.** It appears from
the wide tier up and on the page, where the trust question gets asked.

### Empty state

A designed fact, not an apology: what's missing in ink-dim,
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

Design each tier deliberately; a tier is a viewport, not a crop:

- **1×1**: the stat, nothing else. One number, its label, one optional
  support line.
- **2×1 / 1×2**: one ledger, single-line rows, no detail nests.
- **2×2**: the full ledger set or detail nests; fit-lists trim from the
  bottom.
- **Wide tile (3–4 cols)**: spend width on columns (two sections side by
  side, or trailing-value columns), not on longer lines; the page heading
  earns its row here.
- **Full view / raw page**: a page, with a capped column, top-anchored,
  hairline-separated rows, every item shown, the page heading and page-only
  generosity (outer padding, scroll) allowed.

**Let the fit pass drop sections; don't hard-code the drop in a height
query.** A rule like `@media (max-height: 379px) { .rows ~ .rows { display:
none } }` reads as tier design ("a short tile answers one question"), but it
is really a bet that the _leading_ section fills the tier. When it doesn't —
two blocked PRs on a 2×2 — the tile spends most of its height on nothing,
and the sections it hid are hidden so completely the reader cannot tell they
exist. The fit pass already enforces the same intent adaptively: it trims
bottom-up, so the leading section is the last to give way, and it collapses
a whole section rather than orphaning its heading. A tier query is right for
content that is _never_ part of a tier (the provenance line on a glance
tile); it is wrong as a proxy for "there won't be room", which is a
measurement, not a media feature.

Bans, on top of the board's own: no invented colors or fonts; no boxes
inside the tile (the card is the box, so sections separate with rules and
space, never nested cards); no side-stripe accents; no more than one
accent-colored element per tile tier; no more than one progress
representation per widget (a bar, a percent, and a stepper are the same
number three times; see Meter); body text never below 14px, nothing below
12px.
