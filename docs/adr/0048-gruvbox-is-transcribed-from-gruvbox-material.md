# Gruvbox is transcribed from gruvbox-material

ADR-0009 built the registry by transcribing each theme from its upstream
palette, and took gruvbox from classic morhetz — the **hard** background
variants, `#1d2021` dark and a `bg0_s`/`bg0_h` split in light. Beside a
terminal running gruvbox the result read wrong: a sallow `#f2e5bc` canvas in
light, and a near-black `#3c3836` ink where gruvbox's own is a warm brown.

**Decision: gruvbox is transcribed from gruvbox-material (sainnhe), medium
background, in both twins — except `accent`, which keeps the gruvbox orange.**

| role  | was (classic hard)    | now (material medium) |
| ----- | --------------------- | --------------------- |
| `bg`  | `#1d2021` / `#f2e5bc` | `#282828` / `#fbf1c7` |
| `bg1` | `#282828` / `#f9f5d7` | `#1b1b1b` / `#f2e5bc` |
| `ink` | `#ebdbb2` / `#3c3836` | `#d4be98` / `#654735` |

Material is the flavour the terminal beside the board is actually running,
and the warmer ink is what reads as gruvbox rather than as a yellow-tinted
greyscale. Every semantic role (`green`, `yellow`, `red`, `aqua`, `blue`,
`purple`) is material's.

## The accent stays orange

Material's signature is its green (`#a9b665` / `#6c782e`), and it is the one
value not adopted. Two independent reasons.

**It collides with `green`.** Material spends a single color on both accent
and success. Steward spends `green` on the freshness dot and diff additions
of every tile, so an olive accent would paint the primary action the same
color as the status beside it — "Add routine" would read as a state pill.

**It cannot carry a fill.** Gruvbox palettes calibrate their colors to be
read _as ink on the background_; material's own filled surfaces are the dim
washes (`bg_green`, `bg_visual_green`) under colored text. Inverted into a
solid button, light-mode olive drops to 3.83:1 against a `bg1` label, and
_nothing_ in that ramp clears the 4.5:1 floor — pure white only reaches
4.81:1. Classic gruvbox's **faded** ramp exists for exactly the jobs needing
contrast on a light ground, so `accent` keeps `#fe8019` / `#af3a03`.

One residual follows: gruvbox-light's `inkDim` takes classic gruvbox `fg3`
(`#665c54`), because material's grey ramp tops out at 4.29:1 on the canvas
and 3.87:1 on the card tone.

## Cards recede, in both modes

ADR-0009 gave light themes a deliberate spread — canvas one step deeper, cards
on the palette's lightest tone, "widgets glow, chrome recedes". Material's
ramp has nothing above `bg0`, so taking `bg0` as the canvas forces the card
tone a step _down_ (`bg_dim`). Gruvbox cards recede.

The alternative was a card separating from its page by 1.03:1, below the
1.05 floor `theme.test.ts` enforces and invisible in practice. A hierarchy you
cannot see is not one; a visible recess beats an invisible lift. It also
matches how material uses `bg_dim` natively — statusline, popup menus, float
backgrounds. **This is gruvbox-only**: an audit of the other six light themes
found every one separating healthily at 1.108–1.170, so ADR-0009's rule stands
everywhere it can be applied.

The flush system is unaffected, because it was written in roles rather than
hexes: tiles repaint to `bg` and the board is `bg`; the lightbox is `--card`
and artifacts author `bg1`. Both stay flush whichever way the ramp runs.

## The artifact override is now unconditional

ADR-0046 leaned on `artifactThemeStyle` returning `null` for the anchor, on
the reasoning that a gruvbox artifact viewed under gruvbox already carries the
right hexes. That quietly made the anchor's values **unchangeable**: the hexes
baked into every published file were the real contract, and this
retranscription would have left old artifacts painting `#1d2021` beside chrome
painting `#282828`.

**`artifactThemeStyle` now emits for every theme, the anchor included.** The
registry becomes authoritative for artifacts too, at a cost of a few hundred
bytes of srcdoc per tile. Verified against `docs/samples/daily-plan.html`,
which still has the pre-ADR hexes inlined and now renders in the current
palette. The anchor keeps its authoring job — it is what a file paints when
opened raw — but it no longer pins the registry.

## Consequences

- ADR-0007's "gruvbox-dark-hard palette" and ADR-0009's "gruvbox dark hard
  remains canonical" now read as gruvbox-dark (material medium). The anchor is
  still gruvbox-dark and still ADR-0046's split; only its values moved.
- The `widget-artifact` skill's token snippet and `docs/widget-standard.md` §3
  carry the new row. Published artifacts need no republishing — the override
  reskins them — but newly authored ones inline the current values.
- Docs code blocks move from shiki's `gruvbox-*-hard` to `gruvbox-*-medium`,
  whose backgrounds (`#282828` / `#fbf1c7`) are the registry's own `bg`, so a
  block sits flush with the page as before. Shiki ships no gruvbox-material,
  so the syntax hues stay classic.
- The window chrome needs nothing here. `themeColor()` already returns a
  theme's `bg` and the pre-paint script already paints the frame from it, so
  the installed app's title bar picks up the new canvas for free.
