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
    padding: 40px 32px;
    overflow: auto;
  }
}
```

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
(`max-content 1fr max-content`): the right column takes the value that
answers the glance (a count, an age, "9 need you"). Key colors are semantic:
orange for ranks/priority, aqua for times, yellow for carry-overs.

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

Don't mint a new glyph when a listed state fits; when a genuinely new
state needs one, pick the plainest lucide match and use it everywhere.

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

Bans, on top of the board's own: no invented colors or fonts; no boxes
inside the tile (the card is the box, so sections separate with rules and
space, never nested cards); no side-stripe accents; no more than one
accent-colored element per tile tier; no more than one progress
representation per widget (a bar, a percent, and a stepper are the same
number three times; see Meter); body text never below 14px, nothing below
12px.
