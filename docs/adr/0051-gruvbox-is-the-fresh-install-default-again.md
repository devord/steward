# Gruvbox is the fresh-install default again

ADR-0046 moved the fresh-install slots off gruvbox and onto Flexoki. It moved
them for a palette that no longer exists: at the time gruvbox was transcribed
from classic morhetz **hard** — a `#1d2021` canvas and a near-black `#3c3836`
ink in light — the very rendering ADR-0048 later called sallow and
yellow-tinted-greyscale, and replaced with gruvbox-material medium.

**Decision: `DEFAULT_DARK_THEME`/`DEFAULT_LIGHT_THEME` go back to
`gruvbox-dark`/`gruvbox-light`.** A viewer with no stored preference — or one
whose stored preference coerces from garbage — lands on gruvbox again.

Nothing about ADR-0046's _structure_ is reverted, only its target. The split it
introduced is what makes this a two-line change: `DEFAULT_THEME` is a separate
constant and still gruvbox-dark, so the artifact contract never entered the
question. And the split stays split. The two constants now happen to name the
same theme, and collapsing them on that basis would re-create exactly the
conflation ADR-0046 untangled — the anchor answers to published artifacts, the
slots answer to taste, and only one of those is cheap to move.

## What follows the slot, and what doesn't

- **The SSR stamp and the manifest follow.** root.tsx reads
  `DEFAULT_DARK_THEME` rather than a literal (ADR-0046 amendment), so the
  stamped attribute moved for free; `manifest.webmanifest` carries the hex by
  hand and is repointed to gruvbox-dark's `#282828`. `theme.test.ts` pins the
  manifest to `themeColor(DEFAULT_DARK_THEME)` and was what caught the drift.
- **The mark does not follow.** The bow tie took Flexoki as a _fixed_ identity
  (ADR-0046 amendment, DESIGN.md § Mark): it never followed the active theme,
  so it does not follow the default either. Favicon, launcher icons, wordmark
  lockups and the og card stay as baked. A mark that changed with the default
  would not be an identity.
- **No artifact republishing, in either direction.** The anchor never moved,
  and the frame injects the active palette into every srcdoc unconditionally
  (ADR-0048), so the whole published corpus repaints on a page load as always.

Still no flash: the pre-paint script stamps `data-theme` from the resolved
preference before first paint, and the SSR fallback it overwrites is now the
same gruvbox-dark the `:root` block already carried — the no-JS surface and the
anchor coincide again, which is one fewer thing to be wrong.

This remains a per-device default, not data. Every stored preference is
honoured unchanged: a viewer who explicitly picked Flexoki keeps Flexoki, and
the picker still offers all seven families.
