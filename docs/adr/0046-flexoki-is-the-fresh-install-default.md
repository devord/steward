# Flexoki is the fresh-install default theme

ADR-0009 shipped the theme registry and named gruvbox-dark twice: the
**canonical anchor** (the server renders it on `:root`, artifacts are authored
in it and inline it at rest) _and_ the **fresh-install default** (the palette a
viewer with no stored preference starts in). Those are two different jobs that
happened to point at the same theme.

**Decision: the fresh-install default moves to the Flexoki pair; the canonical
anchor stays gruvbox-dark.** `DEFAULT_DARK_THEME`/`DEFAULT_LIGHT_THEME` become
`flexoki-dark`/`flexoki-light`, so a new viewer — or any coerced-from-garbage
preference — lands on Flexoki. `DEFAULT_THEME` is untouched.

The two must stay split. `DEFAULT_THEME` is load-bearing for the artifact
contract: published widgets inline the gruvbox `--color-*` values
(docs/widget-standard.md), and `artifactThemeStyle` returns `null` for the
anchor precisely because the inlined values already _are_ the anchor. Retarget
the anchor to Flexoki and every published artifact would render its raw
gruvbox inline under a Flexoki chrome, with nothing injected to correct it —
the whole artifact pool would need republishing. Moving only the fresh-install
slots avoids all of that: the injection path already re-themes each srcdoc to
the active theme (ADR-0009), so a Flexoki viewer sees Flexoki artifacts for
free, authored anchor unchanged.

No flash. The pre-paint script stamps `data-theme` from the resolved
preference before first paint; a fresh viewer with no stored theme now resolves
to `flexoki-dark`/`flexoki-light` and the script stamps that, so the
gruvbox-dark SSR `:root` only surfaces with JavaScript disabled — the same
degraded fallback ADR-0009 already accepts.

This is a per-device default, not data: it changes only what an unconfigured
browser shows first. Every stored preference is honoured unchanged, and the
picker still offers all seven families.

## Amendment (2026-07-21): the SSR stamp and the identity follow

Two follow-ups, neither touching the anchor:

- **root.tsx now stamps `data-theme` with `DEFAULT_DARK_THEME` at SSR** (and
  `theme-color` + the manifest colors moved to Flexoki's `#100f0f`), so the
  no-JS fallback and the pre-hydration frame match what a fresh viewer
  resolves to instead of surfacing the anchor. `DEFAULT_THEME` itself is
  untouched: the `:root` palette block, artifact authoring, and
  `artifactThemeStyle`'s null case all still point at gruvbox-dark, so no
  published artifact is stranded. The degraded no-JS surface simply upgraded
  from "the anchor" to "the fresh-install default".
- **The mark took Flexoki as its fixed identity** (DESIGN.md § Mark): the
  bow tie no longer follows the active theme at all — one light and one dark
  colorway from the Flexoki rows, emitted as `--mark-*` vars outside the
  `[data-theme]` blocks, with every static identity asset (favicon, launcher
  icons, wordmark lockups, og card) re-baked from gruvbox to match.
