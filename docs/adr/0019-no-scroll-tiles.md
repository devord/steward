# Tiles never scroll: artifacts fit their height, truncation is visible

A board tile is a glance surface. A scrollbar inside a tile fights that
three ways: the wheel gets trapped mid-board-scroll, every tile grows
chrome, and — worst — rows fold invisibly below the edge, which for a
"top priorities" widget is actively misleading. But the observed failure
mode was worse still: artifacts overflowing their cell and **cropping
silently**, mid-line, with no signal anything was missing.

The standard already had the right pressure valve — the full-view lightbox
renders every row — but the height axis of the artifact contract was too
coarse to prevent overflow (one breakpoint: `≤160px` / taller), and the
platform never decided crop-vs-scroll at all; whatever CSS the artifact
shipped, happened.

Decision, in three layers:

- **Contract** (widget-standard §2): an artifact must fit its height at
  every tier. A list that doesn't fit degrades to fewer items plus a
  visible `+N more` line. The `widget-artifact` skill carries a reference
  fit-to-height snippet (scripts are already in the sandbox contract,
  ADR-0002); artifacts gate it on `html[data-bulletin-tile]` so the raw
  page and the full view keep every row.
- **Platform guard** (`frameArtifactHtml`, tile view): the frame pins
  `overflow: hidden` inside the tile iframe, stamps `data-bulletin-tile`
  on the artifact's `<html>`, and injects a bottom fade that appears only
  while content still overflows — a non-compliant artifact degrades to
  _visibly_ truncated ("there's more — expand"), never ambiguously cropped.
  The fade dissolves into `--color-bg1`, so theme overrides (ADR-0009)
  retint it for free.
- **Full view** (`frameArtifactHtml`'s `"full"` view, the lightbox): no
  guard, page scrolls freely. That is where the `+N more` rows actually
  live; the tile's job is triage, not completeness.

## Considered options

- **Scrollbars in tiles** (Grafana-style, thin styled overlay) — loses no
  content and needs no contract change, but trades the glanceable board
  for scroll traps and per-tile chrome, and still hides state invisibly.
  Rejected; the lightbox already owns "every row".
- **Crop with fade only, no contract change** — honest about truncation
  but wastes the tile: a dumb crop shows half a list where a fitted
  artifact shows a summary line. The fade alone is the fallback, not the
  design.
- **CSS-only truncation (`line-clamp`)** — can't count what it hid; a
  `+N more` needs measurement, hence the snippet.

## Consequences

- Published artifacts predating this ADR keep working — they just render
  with the fade until their routine reruns with the updated skill.
- The tile guard is embed-only injection, same path as the footer hide;
  raw artifact views are untouched.
- `data-bulletin-tile` becomes contract surface: artifacts may key CSS or
  JS on it, so renaming it is a breaking change to the standard.
