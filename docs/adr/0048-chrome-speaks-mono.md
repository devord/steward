# Chrome speaks mono

The chrome had two type systems in one column. DESIGN.md's rule was
per-string — "if git or the schema would care about the string, it's mono" —
so the rail rendered `corza` and `alex` in Geist Mono and `Routines` and
`New dashboard` in Geist sans, at the same 15px, two rows apart. The same
fork ran through the account pill (a display name was sans, a bare login
mono), the repo caption (sans when the repo had a display name), and the
routines ledger (a preset cron read as sans prose, an off-preset one as
mono). Each fork was individually defensible and the sum read as drift:
a reader doesn't perceive "this string is an identifier", they perceive
that the column keeps changing material.

Three smaller things had drifted with it. The type scale was bumped one
step off Tailwind's defaults (`--text-sm` 15px, `--text-xs` 13px) because
"the old 12/14 base read a touch small for a glanceable board" — measured
on the sans. The uppercase caption idiom shipped at 11px in the rail and
13px on the board, undocumented, a gap too small to read as hierarchy and
big enough to read as a mistake. And `ink-faint`, the ≥3:1 metadata role,
carried the freshness readout: measured across the registry it clears
4.5:1 on **one** palette of fourteen and bottoms out at 3.20:1 (rose-pine
on `bg1`), so the number the product is built around was the least legible
text on the board.

Decision, one register rather than six patches:

- **Mono is the chrome face.** `font-mono` moves onto `body`; the sans is
  opted back in by the two prose surfaces — the landing page
  (`data-prose-surface`) and the docs (`#nd-docs-layout`) — which are read
  at a 65–75ch measure where mono is the slower face. Every per-string
  sans/mono conditional is deleted. `--font-heading` follows the chrome, so
  dialog, sheet, and card titles set in mono too.
- **The scale steps back to Tailwind's own.** `--text-sm` 14px, `--text-xs`
  12px, the two overrides removed rather than restated. Geist Mono at 14px
  reads with the presence the sans had at 15px, so the bump's goal survives
  and its density cost does not. One tier sits below as a real token:
  `--text-2xs` (11px), the tracked UPPERCASE caption, replacing eleven
  `text-[11px]` arbitrary values.
- **`ink-faint` is retired as a text role.** Every timestamp, count, table
  head, and note moves to `ink-dim`, which clears 4.5:1 on all fourteen
  palettes (worst 4.64, github-dark on `bg2`). `ink-faint` survives for what
  3:1 genuinely covers — resting glyphs, hover-revealed icon buttons,
  disabled controls. De-emphasis is spent on size and weight instead of a
  third contrast step, the pattern the registry already uses where a palette
  has no AA-clearing dimmer ink.
- **One caption tier.** `railCaptionCls` in `lib/utils.ts`: mono,
  `text-2xs`, semibold, tracked, caps, `ink-dim`. The rail's repo caption,
  its section labels, the board's band headings, and the template picker's
  group headers all resolve to it. A band heading earns its prominence from
  its chevron, its count, and the air above it, not from two extra pixels.
- **Captions carry counts.** Rail sections and board bands show their
  member count at rest (`aria-hidden` — the items are listed directly
  below). A bare word at the head of a list is decoration; the number is
  what makes it navigation. A collapsed band swaps the number for the
  existing "N hidden" phrase rather than showing both.
- **A rhythm law: tight within, air between.** Rows keep their 2px, a
  caption still hugs its content at 8px, but the gap that opens a new group
  goes 12→20px in the rail (`mt-5`) and 16→32px between board bands
  (`mb-8`). Measured after: 2px between sibling rows, 22px before the next
  caption.
- **`--radius` 8px → 4px, capped at 6px.** The rule that radius signals
  elevation is unchanged; only the number moves. The widget frame is square
  by design, so an 8px pill beside it read as a different material, and the
  derived scale's multipliers had run the upper steps to 10px.

## Considered options

- **Adopt IBM Plex Mono** (the face Flow uses, which prompted this) —
  rejected. The coherence comes from uniformity, not from Plex; switching
  would mean re-subsetting a woff2 for the ADR-0031 data-URI injection,
  amending widget-standard §6 and the `widget-artifact` skill, and
  re-rendering every published artifact in a new face, for no design win
  that mono-first doesn't already deliver.
- **Keep the split and fix only the collisions** — smaller diff, but the
  rail still reads as two materials wherever a display name sits beside a
  slug, which is most repos.
- **Hold 15/13 and fix density with spacing alone** — mono-first at 15px is
  a net size _increase_ over the mixed rail, so this fixes nothing a reader
  would notice.
- **Repoint `ink-faint` per palette to clear 4.5:1** — the principled
  three-tier answer, measured and rejected: only flexoki-dark has an ink
  that is both dimmer than `ink-dim` and AA-clearing, so thirteen of
  fourteen themes collapse to `ink-dim` anyway.
- **Two ADRs, splitting the contrast change out** — defensible, since that
  part amends ADR-0009 and rewrites test assertions. Rejected because the
  changes only make sense together: mono-first forces the scale down, the
  smaller scale forces the ink decision, and radius and rhythm are what keep
  the result coherent rather than merely smaller. Split apart, each looks
  arbitrary and invites a partial revert.

## Consequences

- Chrome's body size (14px) is now exactly the artifact floor
  (widget-standard §6: body/data ≥14px, labels ≥12px). That is the intended
  relationship, not a collision: chrome carries ceilings, artifacts carry
  floors, and the board gets one baseline that artifacts rise above with
  weight, colour, and larger KPI tiers. No artifact contract changes, so no
  routine needs to re-run.
- `theme.test.ts` no longer holds any text role below 4.5:1. The old
  "metadata ink ≥ 3:1" assertion is reframed as the glyph floor (WCAG
  1.4.11), and the ink tiers gain an ordering test — non-strict for
  `ink-dim`, because rose-pine-dawn and tokyo-night-light legally collapse
  it onto `ink`.
- The routines-pool row loses one of its two differentiators from the board
  rows above it (it was "ledger glyph + sans label" against "dots + mono
  names"). The glyph, the ink tier, and its position as the spine's terminal
  node carry it alone. Revisit if it starts reading as just another board.
- Amends ADR-0009 (the contrast law), and the caption idiom described in
  ADR-0023 and ADR-0034. ADR-0031 is untouched: the face is still Geist
  Mono, so artifacts keep the injection they have.
- The widget title bar's reserved action slot is unchanged and still costs
  the title ~5 hidden buttons' worth of width at rest
  (`widget-card.tsx`: "the reserved slot means no layout shift on reveal").
  Long names truncate hard in a one-column tile. Untouched here because the
  fix is a separate decision about where hover actions live; the 13→12px
  readout gives the title a few pixels back in the meantime.
