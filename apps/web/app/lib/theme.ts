/**
 * The theme registry and appearance model — the one place that knows every
 * palette and resolves which one is active (ADR-0009).
 *
 * Each theme carries the full Steward token set (the roles DESIGN.md
 * defines: surfaces bg…bg3, borders, inks, the accent pair, and the status
 * colors), transcribed from its upstream palette — no invented colors.
 * Gruvbox dark remains the canonical anchor: artifacts are authored in it
 * (docs/widget-standard.md) and the server renders it before the client
 * preference is known. The *fresh-install* default is a separate choice —
 * a new viewer now starts in the Flexoki pair (ADR-0046).
 *
 * The user's choice is an **appearance preference**: a `mode`
 * (`system` | `light` | `dark`) plus a `lightTheme` and a `darkTheme` slot
 * (the model Flow proved out). `system` follows `prefers-color-scheme`.
 * The preference lives in localStorage — it's a per-device setting, not
 * data, so it never touches the data repo (ADR-0001 state stays in git;
 * this is chrome, not state).
 *
 * Consumers:
 *  - `themeStylesheet()` — the `[data-theme]` CSS blocks served inline from
 *    root.tsx, so switching the attribute re-themes chrome flash-free;
 *  - `THEME_INIT_SCRIPT` — the tiny pre-paint script that stamps
 *    `data-theme` + the `.dark` class before first paint;
 *  - `useResolvedTheme()` (use-appearance.ts) — the live resolved theme for
 *    React, driving the widget-artifact injection;
 *  - `artifactThemeStyle()` — the var overrides injected into artifact
 *    srcdoc so published gruvbox artifacts follow the active theme.
 */

import { z } from "zod"

import { ARTIFACT_COPY_SCRIPT } from "./artifact-copy.ts"
import { FIT_FACTORY, FIT_STYLE } from "./artifact-fit.ts"

/** A theme's perceptual mode — drives `color-scheme` and the `.dark` class. */
export type ThemeMode = "dark" | "light"

/** The Steward token roles every theme must fill (see DESIGN.md). */
export interface ThemeTokens {
  /** Page background. */
  bg: string
  /** Widget cards, panels. */
  bg1: string
  /** Edit-mode surfaces, wells. */
  bg2: string
  /** Hover fills, secondary controls. */
  bg3: string
  /** Object edges: popovers, board cells, table head rules. ≥1.5:1 on bg/bg1. */
  border: string
  /** Hairlines splitting the flat plane. ≥1.2:1 on bg/bg1. */
  borderDim: string
  /**
   * Control boundaries — inputs, selects, checkboxes, outline buttons.
   * Those controls are fill-less, so this hairline is the only thing that
   * identifies them: WCAG 2.1 SC 1.4.11 applies and the floor is 3:1 on
   * both bg and bg1 (`theme.test.ts` enforces it).
   */
  borderStrong: string
  /** Body text. */
  ink: string
  /** Secondary text. */
  inkDim: string
  /** Metadata only, never body copy. */
  inkFaint: string
  /** The accent: primary actions, brand mark. */
  accent: string
  /** Focus ring, selection. */
  accentDeep: string
  /** Staleness, warnings. */
  yellow: string
  /** Diff additions, success. */
  green: string
  aqua: string
  blue: string
  purple: string
  /** Diff deletions, destructive. */
  red: string
}

export interface Theme {
  /** Human label for the picker (e.g. "Gruvbox Dark"). */
  label: string
  mode: ThemeMode
  tokens: ThemeTokens
}

/**
 * The curated set: seven families, each shipping a light and a dark member.
 * Values are transcribed from each palette's upstream definition
 * (gruvbox-material medium, Catppuccin mocha/latte, Rosé Pine main/dawn,
 * tokyonight.nvim night style + the Tokyo Night Light VS Code palette,
 * @primer/primitives light/dark, Flexoki's base + 400/600 ramps,
 * kanagawa.nvim wave/lotus).
 * Light themes spread their surface roles deliberately (still transcribed
 * values, roles repointed within the palette's own ramp): the canvas takes
 * a mid neutral one step deeper and the cards keep the palette's lightest
 * tone, so widgets read as the elevated surface ("widgets glow, chrome
 * recedes") instead of the whole page collapsing into one near-white plane.
 * Dark themes get the same hierarchy for free from their upstream bg ramps.
 * Gruvbox is the exception in both modes: material's ramp has nothing above
 * `bg0`, so taking `bg0` as the canvas forces the card tone a step *down*
 * (`bg_dim`). Cards recede there rather than glow. The alternative was a
 * card that separates from the page by 1.03:1 — a hierarchy you cannot see
 * is not one; a visible recess beats an invisible lift.
 *
 * The three border tiers are graded, not decorative: `borderDim` splits the
 * flat plane (≥1.2:1), `border` edges objects — popovers, board cells, table
 * head rules (≥1.5:1), and `borderStrong` bounds the fill-less controls where
 * the hairline is the only affordance (≥3:1, WCAG 1.4.11). Light palettes
 * ship shallow neutral ramps, so their roles sat one step from the canvas and
 * every light theme's border read as a ghost; each is repointed one step down
 * its own ramp, which cascades the old `border` into `borderDim`.
 *
 * Documented residuals:
 *  - gruvbox-material spends one color on both accent and success, and its
 *    green cannot carry a button label at AA in light mode, so `accent`
 *    keeps the gruvbox orange in both twins while every semantic role
 *    (green, yellow, red, aqua, blue, purple) is material's;
 *  - gruvbox-light's `inkDim` takes classic gruvbox fg3 (#665c54):
 *    material's own grey ramp tops out at 4.29:1 on the canvas and 3.87:1
 *    on the card tone, short of the 4.5 floor at every step;
 *  - Rosé Pine has no green, so `green` reuses foam;
 *  - where a palette's own dim/faint ink misses AA on its canvas, the role
 *    is repointed to the nearest AA-clearing tone from the same palette
 *    family (latte ink-dim → subtext1, tokyo-night ink-faint → dark5);
 *  - Tokyo Night Light ships no AA-clearing mid gray at all, and Rosé Pine
 *    Dawn's muted inks miss AA on its overlay canvas, so their ink-dim
 *    collapses to the body ink and hierarchy is carried by weight and
 *    size — theme.test.ts enforces the ratios for every theme;
 *  - GitHub Light's ink-dim takes `scale.gray[6]`: Primer tunes `fg.muted`
 *    against white, and it dips to 4.49:1 on the deeper board surface;
 *  - Kanagawa Lotus's signature lotusOrange misses AA as an accent (2.66:1
 *    on its own canvas, 3.04:1 for button text), so `accent` is repointed
 *    to lotusBlue4 — the nearest AA-clearing tone in the same palette;
 *  - Lotus's light ramp is the most compressed in the registry — nothing
 *    sits between lotusWhite0 (1.16:1, the ghost this replaced) and
 *    lotusViolet1 — so its `borderDim` lands at 1.95:1, heavier than its
 *    siblings' hairlines. Its `border`/`borderStrong` take lotusGray3/2
 *    rather than the nearer lotusBlue3: a blue hairline on that khaki
 *    canvas reads as a different theme, and the warm grays hold the family
 *    line with Wave (2.46:1 / 2.56:1).
 */
export const themes = {
  // Gruvbox is transcribed from **gruvbox-material** (sainnhe), medium
  // background, not from classic morhetz gruvbox: it is the flavour the
  // terminal next to the board is actually running, and its warmer ink
  // (`fg0` #d4be98 / #654735 against classic's #ebdbb2 / #3c3836) is what
  // reads as gruvbox rather than as a yellow-tinted greyscale.
  //
  // `accent` is the one role that does not follow material, and the reason
  // is structural rather than aesthetic. Material's signature is its green
  // (#a9b665 / #6c782e), but gruvbox palettes calibrate their colors to be
  // read *as ink on the background* — material's own filled surfaces are
  // the dim washes (`bg_green`, `bg_visual_green`) carrying colored text.
  // Inverted into a solid button under a cream label the light green
  // collapses to 3.83:1, and nothing in the light ramp clears 4.5:1 (pure
  // white only reaches 4.81:1). Classic gruvbox's *faded* ramp exists for
  // exactly the jobs that need contrast on a light ground, so `accent`
  // keeps the gruvbox orange. It also has to: material spends one color on
  // both accent and success, while Steward spends `green` on freshness
  // dots and diff additions on every tile — an olive accent would make the
  // primary action the same color as the status beside it.
  "gruvbox-dark": {
    label: "Gruvbox Dark",
    mode: "dark",
    tokens: {
      // Cards *recede* here, and in the light twin (see below): material's
      // ramp has nothing above `bg0`, so with `bg0` as the canvas the card
      // tone is necessarily a step down — `bg_dim`, which is how material
      // itself uses it (statusline, popup menus, float backgrounds).
      bg: "#282828",
      bg1: "#1b1b1b",
      bg2: "#32302f",
      bg3: "#45403d",
      border: "#5a524c",
      borderDim: "#45403d",
      borderStrong: "#928374",
      ink: "#d4be98",
      inkDim: "#a89984",
      inkFaint: "#928374",
      accent: "#fe8019",
      accentDeep: "#d65d0e",
      yellow: "#d8a657",
      green: "#a9b665",
      aqua: "#89b482",
      blue: "#7daea3",
      purple: "#d3869b",
      red: "#ea6962",
    },
  },
  "gruvbox-light": {
    label: "Gruvbox Light",
    mode: "light",
    tokens: {
      bg: "#fbf1c7",
      bg1: "#f2e5bc",
      bg2: "#eee0b7",
      bg3: "#e5d5ad",
      border: "#bdae93",
      borderDim: "#ddccab",
      borderStrong: "#7c6f64",
      ink: "#654735",
      // Residual: no material grey clears AA on the card tone (grey2
      // #7c6f64 dips to 3.87:1 on bg1), so `inkDim` takes classic
      // gruvbox's fg3 — the nearest AA-clearing tone in the family.
      inkDim: "#665c54",
      inkFaint: "#7c6f64",
      accent: "#af3a03",
      accentDeep: "#d65d0e",
      yellow: "#b47109",
      green: "#6c782e",
      aqua: "#4c7a5d",
      blue: "#45707a",
      purple: "#945e80",
      red: "#c14a4a",
    },
  },
  "catppuccin-mocha": {
    label: "Catppuccin Mocha",
    mode: "dark",
    tokens: {
      bg: "#181825",
      bg1: "#1e1e2e",
      bg2: "#313244",
      bg3: "#45475a",
      border: "#585b70",
      borderDim: "#313244",
      borderStrong: "#6c7086",
      ink: "#cdd6f4",
      inkDim: "#a6adc8",
      inkFaint: "#7f849c",
      accent: "#cba6f7",
      accentDeep: "#cba6f7",
      yellow: "#f9e2af",
      green: "#a6e3a1",
      aqua: "#94e2d5",
      blue: "#89b4fa",
      purple: "#f5c2e7",
      red: "#f38ba8",
    },
  },
  "catppuccin-latte": {
    label: "Catppuccin Latte",
    mode: "light",
    tokens: {
      // Canvas crust, cards base, wells mantle — latte's own three-step
      // surface ramp, spread so the cards actually lift off the page.
      bg: "#dce0e8",
      bg1: "#eff1f5",
      bg2: "#e6e9ef",
      bg3: "#ccd0da",
      border: "#acb0be",
      borderDim: "#bcc0cc",
      borderStrong: "#6c6f85",
      ink: "#4c4f69",
      inkDim: "#5c5f77",
      inkFaint: "#6c6f85",
      accent: "#8839ef",
      accentDeep: "#8839ef",
      yellow: "#df8e1d",
      green: "#40a02b",
      aqua: "#179299",
      blue: "#1e66f5",
      purple: "#ea76cb",
      red: "#d20f39",
    },
  },
  "rose-pine": {
    label: "Rosé Pine",
    mode: "dark",
    tokens: {
      bg: "#191724",
      bg1: "#1f1d2e",
      bg2: "#26233a",
      bg3: "#403d52",
      border: "#524f67",
      borderDim: "#403d52",
      borderStrong: "#6e6a86",
      ink: "#e0def4",
      inkDim: "#908caa",
      inkFaint: "#6e6a86",
      accent: "#c4a7e7",
      accentDeep: "#c4a7e7",
      yellow: "#f6c177",
      green: "#9ccfd8",
      aqua: "#9ccfd8",
      blue: "#31748f",
      purple: "#c4a7e7",
      red: "#eb6f92",
    },
  },
  "rose-pine-dawn": {
    label: "Rosé Pine Dawn",
    mode: "light",
    tokens: {
      // Canvas overlay, cards surface; wells reuse the canvas tone (dawn
      // has no fourth light neutral). Ink-dim collapses to the body ink —
      // dawn's muted inks miss AA on the overlay canvas (see residuals).
      bg: "#f2e9e1",
      bg1: "#fffaf3",
      bg2: "#f2e9e1",
      bg3: "#dfdad9",
      border: "#9893a5",
      borderDim: "#cecacd",
      borderStrong: "#797593",
      ink: "#575279",
      inkDim: "#575279",
      inkFaint: "#797593",
      accent: "#286983",
      accentDeep: "#286983",
      yellow: "#ea9d34",
      green: "#56949f",
      aqua: "#56949f",
      blue: "#286983",
      purple: "#907aa9",
      red: "#b4637a",
    },
  },
  "tokyo-night": {
    label: "Tokyo Night",
    mode: "dark",
    tokens: {
      bg: "#16161e",
      bg1: "#1a1b26",
      bg2: "#292e42",
      bg3: "#3b4261",
      border: "#414868",
      borderDim: "#292e42",
      borderStrong: "#737aa2",
      ink: "#c0caf5",
      inkDim: "#a9b1d6",
      inkFaint: "#737aa2",
      accent: "#7aa2f7",
      accentDeep: "#7aa2f7",
      yellow: "#e0af68",
      green: "#9ece6a",
      aqua: "#7dcfff",
      blue: "#7aa2f7",
      purple: "#bb9af7",
      red: "#f7768e",
    },
  },
  "tokyo-night-light": {
    label: "Tokyo Night Light",
    mode: "light",
    tokens: {
      bg: "#d6d8df",
      bg1: "#e6e7ed",
      bg2: "#d6d8df",
      bg3: "#c1c2c7",
      border: "#9da0ab",
      borderDim: "#c1c2c7",
      borderStrong: "#73767d",
      ink: "#343b59",
      inkDim: "#343b59",
      inkFaint: "#707280",
      accent: "#2959aa",
      accentDeep: "#2959aa",
      yellow: "#8f5e15",
      green: "#33635c",
      aqua: "#006c86",
      blue: "#2959aa",
      purple: "#7b43ba",
      red: "#8c4351",
    },
  },
  "github-dark": {
    label: "GitHub Dark",
    mode: "dark",
    tokens: {
      // Primer semantic tokens: canvas.inset/default/subtle for the surface
      // ramp, border.default/muted, fg.default/muted/subtle for the inks.
      // Primer ships no teal in `scale`, but its terminal palette does —
      // `aqua` takes ansi.cyan, still an upstream Primer value.
      bg: "#010409",
      bg1: "#0d1117",
      bg2: "#161b22",
      bg3: "#21262d",
      border: "#30363d",
      borderDim: "#21262d",
      borderStrong: "#6e7681",
      ink: "#e6edf3",
      inkDim: "#7d8590",
      inkFaint: "#6e7681",
      accent: "#2f81f7",
      accentDeep: "#1f6feb",
      yellow: "#d29922",
      green: "#3fb950",
      aqua: "#39c5cf",
      blue: "#58a6ff",
      purple: "#a371f7",
      red: "#f85149",
    },
  },
  "github-light": {
    label: "GitHub Light",
    mode: "light",
    tokens: {
      // Canvas gray[1] for the board, canvas.default for the cards, so the
      // widgets keep the white instead of the page collapsing into one
      // near-white plane. On that deeper board Primer's own fg.muted (tuned
      // against white) lands at 4.49:1, so ink-dim takes gray[6] — the
      // nearest AA-clearing tone in the same scale.
      bg: "#eaeef2",
      bg1: "#ffffff",
      bg2: "#f6f8fa",
      bg3: "#d0d7de",
      border: "#afb8c1",
      borderDim: "#d0d7de",
      borderStrong: "#6e7781",
      ink: "#1f2328",
      inkDim: "#57606a",
      inkFaint: "#6e7781",
      accent: "#0969da",
      accentDeep: "#0550ae",
      yellow: "#9a6700",
      green: "#1a7f37",
      aqua: "#1b7c83",
      blue: "#0969da",
      purple: "#8250df",
      red: "#d1242f",
    },
  },
  "flexoki-dark": {
    label: "Flexoki Dark",
    mode: "dark",
    tokens: {
      // Flexoki's base ramp: black + base-950/900/850 for surfaces, base-800
      // for the border, base-200/300/500 for the inks, 400-weight accents.
      bg: "#100f0f",
      bg1: "#1c1b1a",
      bg2: "#282726",
      bg3: "#343331",
      border: "#403e3c",
      borderDim: "#343331",
      borderStrong: "#6f6e69",
      ink: "#cecdc3",
      inkDim: "#b7b5ac",
      inkFaint: "#878580",
      accent: "#da702c",
      accentDeep: "#bc5215",
      yellow: "#d0a215",
      green: "#879a39",
      aqua: "#3aa99f",
      blue: "#4385be",
      purple: "#8b7ec8",
      red: "#d14d41",
    },
  },
  "flexoki-light": {
    label: "Flexoki Light",
    mode: "light",
    tokens: {
      // Canvas base-50, cards paper: the widgets keep Flexoki's actual paper
      // tone and the board sits a step under it. 600-weight accents.
      bg: "#f2f0e5",
      bg1: "#fffcf0",
      bg2: "#e6e4d9",
      bg3: "#dad8ce",
      border: "#b7b5ac",
      borderDim: "#cecdc3",
      borderStrong: "#878580",
      ink: "#100f0f",
      inkDim: "#575653",
      inkFaint: "#6f6e69",
      accent: "#bc5215",
      accentDeep: "#9d4310",
      yellow: "#ad8301",
      green: "#66800b",
      aqua: "#24837b",
      blue: "#205ea6",
      purple: "#5e409d",
      red: "#af3029",
    },
  },
  "kanagawa-wave": {
    label: "Kanagawa Wave",
    mode: "dark",
    tokens: {
      // sumiInk0 for the board, sumiInk3 (wave's own bg) for the cards, then
      // sumiInk4/5 for wells and hovers; fujiWhite/oldWhite/fujiGray inks.
      bg: "#16161d",
      bg1: "#1f1f28",
      bg2: "#2a2a37",
      bg3: "#363646",
      border: "#54546d",
      borderDim: "#363646",
      borderStrong: "#727169",
      ink: "#dcd7ba",
      inkDim: "#c8c093",
      inkFaint: "#727169",
      accent: "#7e9cd8",
      accentDeep: "#957fb8",
      yellow: "#e6c384",
      green: "#98bb6c",
      aqua: "#7aa89f",
      blue: "#7e9cd8",
      purple: "#957fb8",
      red: "#e46876",
    },
  },
  "kanagawa-lotus": {
    label: "Kanagawa Lotus",
    mode: "light",
    tokens: {
      // Canvas lotusWhite2, cards lotusWhite3 (lotus's own bg). Lotus inks
      // run darker on ink2 than ink1, so ink2 carries the body copy.
      bg: "#e5ddb0",
      bg1: "#f2ecbc",
      bg2: "#e7dba0",
      bg3: "#d5cea3",
      border: "#8a8980",
      borderDim: "#a09cac",
      borderStrong: "#716e61",
      ink: "#43436c",
      inkDim: "#545464",
      inkFaint: "#766b90",
      accent: "#4d699b",
      accentDeep: "#624c83",
      yellow: "#77713f",
      green: "#6f894e",
      aqua: "#597b75",
      blue: "#4d699b",
      purple: "#624c83",
      red: "#c84053",
    },
  },
} satisfies Record<string, Theme>

export type ThemeName = keyof typeof themes

/** Registry order, spelled out — theme.test.ts checks it stays exhaustive. */
export const themeNames: readonly ThemeName[] = [
  "gruvbox-dark",
  "gruvbox-light",
  "catppuccin-mocha",
  "catppuccin-latte",
  "rose-pine",
  "rose-pine-dawn",
  "tokyo-night",
  "tokyo-night-light",
  "github-dark",
  "github-light",
  "flexoki-dark",
  "flexoki-light",
  "kanagawa-wave",
  "kanagawa-lotus",
]

/** Ordered `[name, theme]` pairs — the pickers iterate this. */
export const themeEntries: readonly [ThemeName, Theme][] = themeNames.map(
  (name): [ThemeName, Theme] => [name, themes[name]],
)

/**
 * The canonical anchor — what the server renders on `:root` and the palette
 * artifacts are authored in and inline at rest (docs/widget-standard.md).
 * Stays gruvbox-dark even as the fresh-install default moves (ADR-0046).
 * Distinct from the fresh-install slots below — the palette a new user
 * *starts* in. Note this is only an *authoring* anchor: the frame injects
 * the active palette unconditionally, including this one, so an artifact
 * published against an older gruvbox row still renders in the current one.
 */
export const DEFAULT_THEME: ThemeName = "gruvbox-dark"
/** Fresh-install slots for a viewer with no stored preference (ADR-0046). */
export const DEFAULT_DARK_THEME: ThemeName = "flexoki-dark"
export const DEFAULT_LIGHT_THEME: ThemeName = "flexoki-light"

/** A family that ships both a light and a dark member — one pick fills both slots. */
export interface ThemeFamily {
  id: string
  label: string
  light: ThemeName
  dark: ThemeName
}

export const themeFamilies = [
  {
    id: "gruvbox",
    label: "Gruvbox",
    light: "gruvbox-light",
    dark: "gruvbox-dark",
  },
  {
    id: "catppuccin",
    label: "Catppuccin",
    light: "catppuccin-latte",
    dark: "catppuccin-mocha",
  },
  {
    id: "rose-pine",
    label: "Rosé Pine",
    light: "rose-pine-dawn",
    dark: "rose-pine",
  },
  {
    id: "tokyo-night",
    label: "Tokyo Night",
    light: "tokyo-night-light",
    dark: "tokyo-night",
  },
  {
    id: "github",
    label: "GitHub",
    light: "github-light",
    dark: "github-dark",
  },
  {
    id: "flexoki",
    label: "Flexoki",
    light: "flexoki-light",
    dark: "flexoki-dark",
  },
  {
    id: "kanagawa",
    label: "Kanagawa",
    light: "kanagawa-lotus",
    dark: "kanagawa-wave",
  },
] as const satisfies readonly ThemeFamily[]

export function isThemeName(value: unknown): value is ThemeName {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(themes, value)
  )
}

/** The family whose members are exactly this pair, or undefined for a mix. */
export function familyForPair(
  light: ThemeName,
  dark: ThemeName,
): ThemeFamily | undefined {
  return themeFamilies.find((f) => f.light === light && f.dark === dark)
}

/**
 * The family a single theme belongs to. Only complete families ship
 * (ADR-0009), so every registry theme has exactly one — `theme.test.ts`
 * holds the registry to it.
 */
export function familyForTheme(name: ThemeName): ThemeFamily | undefined {
  return themeFamilies.find((f) => f.light === name || f.dark === name)
}

/**
 * Theme entries of one mode, in registry order. `themeNames` lists each
 * family's members together and in `themeFamilies` order, so the light and
 * dark slices come back family-aligned: index n is the same family in both,
 * which is what lets the split picker's two rows line up column for column.
 */
export function themesByMode(mode: ThemeMode): [ThemeName, Theme][] {
  return themeEntries.filter(([, theme]) => theme.mode === mode)
}

// --- appearance preference -------------------------------------------------

export type AppearanceMode = "system" | "light" | "dark"

export interface AppearancePrefs {
  mode: AppearanceMode
  /** Theme shown in light contexts — always a light theme (coerced on read). */
  lightTheme: ThemeName
  /** Theme shown in dark contexts — always a dark theme (coerced on read). */
  darkTheme: ThemeName
}

/** localStorage key for the JSON `AppearancePrefs`. */
export const APPEARANCE_STORAGE_KEY = "steward-appearance"
/** Custom event fired after a preference write, for same-tab subscribers. */
export const APPEARANCE_EVENT = "steward:appearance"

/** Fresh default: follow the OS with the Flexoki pair (ADR-0046). */
export const DEFAULT_APPEARANCE: AppearancePrefs = {
  mode: "system",
  lightTheme: DEFAULT_LIGHT_THEME,
  darkTheme: DEFAULT_DARK_THEME,
}

function coerceSlot(candidate: unknown, mode: ThemeMode): ThemeName {
  return isThemeName(candidate) && themes[candidate].mode === mode
    ? candidate
    : mode === "light"
      ? DEFAULT_LIGHT_THEME
      : DEFAULT_DARK_THEME
}

const rawPrefsSchema = z
  .object({
    mode: z.unknown().optional(),
    lightTheme: z.unknown().optional(),
    darkTheme: z.unknown().optional(),
  })
  .catch({})

/** Validate + coerce anything (parsed JSON, undefined, garbage) into prefs. */
export function coercePrefs(raw: unknown): AppearancePrefs {
  const parsed = rawPrefsSchema.parse(raw ?? {})
  return {
    mode:
      parsed.mode === "light" || parsed.mode === "dark"
        ? parsed.mode
        : "system",
    lightTheme: coerceSlot(parsed.lightTheme, "light"),
    darkTheme: coerceSlot(parsed.darkTheme, "dark"),
  }
}

/**
 * The color the *window chrome* paints for a theme — the installed PWA's
 * title bar on macOS/Windows, the browser bar on mobile. The app's own chrome
 * sits on the canvas plane (`--background` and `--sidebar` both alias
 * `--palette-bg`), so the frame only reads as part of the board when it takes
 * `bg`.
 */
export function themeColor(name: ThemeName): string {
  return themes[name].tokens.bg
}

/** The theme a preference resolves to under the given system-dark state. */
export function resolveTheme(
  prefs: AppearancePrefs,
  prefersDark: boolean,
): ThemeName {
  if (prefs.mode === "light") return prefs.lightTheme
  if (prefs.mode === "dark") return prefs.darkTheme
  return prefersDark ? prefs.darkTheme : prefs.lightTheme
}

// --- CSS generation ----------------------------------------------------------

const TOKEN_VARS: readonly [keyof ThemeTokens, string][] = [
  ["bg", "--palette-bg"],
  ["bg1", "--palette-bg1"],
  ["bg2", "--palette-bg2"],
  ["bg3", "--palette-bg3"],
  ["border", "--palette-border"],
  ["borderDim", "--palette-border-dim"],
  ["borderStrong", "--palette-border-strong"],
  ["ink", "--palette-ink"],
  ["inkDim", "--palette-ink-dim"],
  ["inkFaint", "--palette-ink-faint"],
  ["accent", "--palette-accent"],
  ["accentDeep", "--palette-accent-deep"],
  ["yellow", "--palette-yellow"],
  ["green", "--palette-green"],
  ["aqua", "--palette-aqua"],
  ["blue", "--palette-blue"],
  ["purple", "--palette-purple"],
  ["red", "--palette-red"],
]

function declarations(theme: Theme): string {
  const vars = TOKEN_VARS.map(
    ([key, cssVar]) => `${cssVar}:${theme.tokens[key]}`,
  ).join(";")
  return `${vars};color-scheme:${theme.mode}`
}

/**
 * The mark's fixed identity (DESIGN.md § Mark). The bow tie stopped
 * following the active theme: one light colorway and one dark colorway,
 * keyed on mode alone, drawn from the Flexoki rows above so the registry
 * stays the single source of every hex. `bevel` is the chip's top-lit
 * highlight — a white stroke that must stay faint on the dark tile and
 * strong on the light one.
 */
const flexokiLight = themes["flexoki-light"].tokens
const flexokiDark = themes["flexoki-dark"].tokens
export const MARK_IDENTITY = {
  light: {
    wingTip: flexokiLight.accent,
    wingFold: flexokiLight.accentDeep,
    knot: flexokiLight.ink,
    tileTop: flexokiLight.bg1,
    tileBottom: flexokiLight.bg,
    tileBorder: flexokiLight.border,
    tileBevel: "rgb(255 255 255 / 0.7)",
  },
  dark: {
    wingTip: flexokiDark.accent,
    wingFold: flexokiDark.accentDeep,
    knot: flexokiDark.ink,
    tileTop: flexokiDark.bg1,
    tileBottom: flexokiDark.bg,
    tileBorder: flexokiDark.border,
    tileBevel: "rgb(255 255 255 / 0.06)",
  },
} as const satisfies Record<ThemeMode, Record<string, string>>

function markDeclarations(mode: ThemeMode): string {
  const m = MARK_IDENTITY[mode]
  return [
    `--mark-wing-tip:${m.wingTip}`,
    `--mark-wing-fold:${m.wingFold}`,
    `--mark-knot:${m.knot}`,
    `--mark-tile-top:${m.tileTop}`,
    `--mark-tile-bottom:${m.tileBottom}`,
    `--mark-tile-border:${m.tileBorder}`,
    `--mark-tile-bevel:${m.tileBevel}`,
  ].join(";")
}

/**
 * The palette blocks served as an inline `<style>` from root.tsx: the
 * default on `:root`, then one `[data-theme]` block per theme. Semantic
 * tokens in app.css alias these vars, so flipping the attribute re-themes
 * everything at the next paint. The mark's fixed identity rides at the
 * end — `--mark-*` never appears in a `[data-theme]` block, so no theme
 * can re-color the tie.
 */
export function themeStylesheet(): string {
  const blocks = themeEntries.map(
    ([name, theme]) => `[data-theme="${name}"]{${declarations(theme)}}`,
  )
  return [
    `:root{${declarations(themes[DEFAULT_THEME])}}`,
    ...blocks,
    `:root{${markDeclarations("light")}}`,
    `.dark{${markDeclarations("dark")}}`,
  ].join("\n")
}

/**
 * Artifact-side var overrides for the widget iframes (ADR-0009). Published
 * artifacts inline the gruvbox palette as `--color-*` custom properties
 * (docs/widget-standard.md); appending this style block re-points those
 * same names at the active theme. `accent` maps onto the artifact contract's
 * historical `orange` slot.
 *
 * Emitted for **every** theme, the default included. It used to short-circuit
 * to null on the anchor, on the reasoning that a gruvbox artifact viewed under
 * gruvbox already carries the right hexes — but that silently made the anchor's
 * values unchangeable: the hexes baked into every already-published file became
 * the real contract, and moving the registry row (as the material transcription
 * did) would have left old artifacts painting the previous palette next to
 * chrome painting the new one. Overriding unconditionally costs a few hundred
 * bytes of srcdoc and makes the registry authoritative for artifacts too.
 */
/**
 * The artifact token contract: every CSS custom property a published artifact
 * may paint with, paired with the registry role it takes.
 *
 * This list is the contract in both directions. {@link artifactThemeStyle}
 * overrides exactly these names at render time, and `@steward/artifact-kit`
 * generates its Tailwind palette from exactly these names (ADR-0050) — so a
 * kit utility always resolves to a variable the board is going to re-point.
 * A color the kit used but this list omitted would paint correctly in the raw
 * file and then refuse to follow the active theme on the board, which is the
 * failure ADR-0009 exists to prevent.
 *
 * Note `borderStrong` is deliberately absent: it bounds fill-less *controls*
 * (WCAG 1.4.11), and artifacts have none. `accent`/`accentDeep` keep the
 * historical `orange` slot names the published corpus already paints with.
 */
export const ARTIFACT_TOKENS = [
  ["--color-bg", "bg"],
  ["--color-bg1", "bg1"],
  ["--color-bg2", "bg2"],
  ["--color-bg3", "bg3"],
  ["--color-border", "border"],
  ["--color-border-dim", "borderDim"],
  ["--color-ink", "ink"],
  ["--color-ink-dim", "inkDim"],
  ["--color-ink-faint", "inkFaint"],
  ["--color-orange", "accent"],
  ["--color-orange-deep", "accentDeep"],
  ["--color-yellow", "yellow"],
  ["--color-green", "green"],
  ["--color-aqua", "aqua"],
  ["--color-blue", "blue"],
  ["--color-purple", "purple"],
  ["--color-red", "red"],
] as const satisfies ReadonlyArray<readonly [string, keyof ThemeTokens]>

export function artifactThemeStyle(name: ThemeName): string {
  const { tokens, mode } = themes[name]
  const vars = ARTIFACT_TOKENS.map(
    ([cssVar, role]) => `${cssVar}:${tokens[role]} !important`,
  ).join(";")
  return `<style data-steward-theme>:root{${vars};color-scheme:${mode}}</style>`
}

/**
 * Frame an artifact for the dashboard. Two jobs in every view:
 *
 *  - Hide the artifact's own footer. That slug + generated-at line is the
 *    artifact's standalone chrome (widget-standard §4, for when it's opened
 *    raw); on the board the WidgetCard footer already carries the routine
 *    name and freshness, so leaving both visible writes the identity and the
 *    run time twice, one row above the other.
 *  - Append the active theme override, for every theme including the anchor.
 *
 * Only this embedded path suppresses the footer; a raw view of the artifact
 * keeps it.
 */
const EMBED_FRAME_STYLE =
  "<style data-steward-embed>footer{display:none !important}</style>"

/**
 * Link guard (ADR-0028). The contract wants `target="_blank"
 * rel="noopener"` on every artifact link (widget-standard §8) — in-frame
 * navigation stays sandbox-blocked, so a bare href goes nowhere. The frame
 * backstops non-compliant artifacts by retargeting anchors at click time,
 * capture phase, before the navigation attempt. Embed-only, like the
 * footer hide: the raw page must link correctly on its own.
 */
const LINK_GUARD_SCRIPT =
  "<script data-steward-link-guard>" +
  'document.addEventListener("click",function(e){' +
  "var t=e.target;" +
  'var a=t&&t.closest&&t.closest("a[href]");' +
  'if(a&&!a.target){a.target="_blank";a.rel="noopener"}' +
  "},true)</script>"

/**
 * Tile-only overflow guard (ADR-0019). Board cells never scroll — a tile is
 * a glance, and a wheel-trapping scrollbar hides rows invisibly — so the
 * artifact must fit its height tier (widget-standard §2). The frame:
 *
 *  - pins the iframe's own scrolling shut (`overflow:hidden`), so a
 *    non-compliant artifact clips instead of growing a scrollbar;
 *  - stamps `data-steward-tile` on `<html>`, the signal artifacts gate
 *    their fit-to-height logic on (the raw page and the full view keep
 *    every row);
 *  - fades the bottom edge out whenever content still overflows, so
 *    truncation reads as "there's more — expand", never an ambiguous
 *    mid-line crop. The fade dissolves into `--color-bg` — the tile's flush
 *    page surface (see TILE_FLUSH_STYLE) — and retints with the theme
 *    override for free.
 */
const TILE_GUARD_STYLE =
  "<style data-steward-tile-guard>" +
  "html,body{overflow:hidden !important}" +
  "#steward-tile-fade{position:fixed;left:0;right:0;bottom:0;height:32px;" +
  "pointer-events:none;opacity:0;transition:opacity .15s;" +
  "background:linear-gradient(transparent,var(--color-bg,#282828))}" +
  FIT_STYLE +
  "</style>"

/**
 * Flush the tile artifact to the board. On the board the chrome renders
 * widgets as sections, not elevated cards — the WidgetCard border is the only
 * frame (view mode reveals it on hover; edit mode keeps it lit). Artifacts
 * author their own page surface as `--color-bg1` (widget-standard, e.g.
 * `body{background:var(--color-bg1)}`); embedded as a tile we repaint
 * `html`/`body` to `--color-bg` with `!important` so the widget sits flush
 * with the page instead of glowing a step above it. The artifact's *inner*
 * `--color-bg1` panels are untouched, so internal hierarchy is preserved.
 * Tile-only: the raw page and the full-view lightbox keep the authored bg1.
 */
const TILE_FLUSH_STYLE =
  "<style data-steward-tile-flush>" +
  "html,body{background:var(--color-bg,#282828) !important}" +
  "</style>"

/**
 * @param withFit run the injected fit-to-height pass (ADR-0050). Only for
 * kit-rendered artifacts: a legacy file carries its own transcribed copy, and
 * two passes trimming the same `[data-fit-list]` would fight each other.
 */
function tileGuardScript(withFit: boolean): string {
  return `<script data-steward-tile-guard>(function(){
var d=document.documentElement;d.setAttribute("data-steward-tile","");
var fit=${withFit ? FIT_FACTORY : "function(){}"};
function init(){
var f=document.createElement("div");f.id="steward-tile-fade";
document.body.appendChild(f);
// The card veils the iframe until the artifact has *content*, not merely a
// parsed document — an artifact that builds its DOM after load would
// otherwise unveil as a flush-bg void. The sandbox has an opaque origin, so
// this posts (targetOrigin "*", payload carries nothing sensitive) once the
// body has real height; widget-card matches on e.source.
var posted=false;
var ready=function(){if(!posted&&document.body.scrollHeight>24){posted=true;
try{parent.postMessage({type:"steward:tile-painted"},"*")}catch(e){}}};
var ro,mo,busy=false;
// Overflow must be read off <body>: html/body pin overflow:hidden, so the
// clipped region belongs to body and never surfaces on documentElement.
var check=function(){
if(busy)return;busy=true;
// The pass mutates the DOM, so both observers are stopped across it —
// otherwise our own writes re-enter as fresh records and it never settles.
if(ro)ro.disconnect();if(mo)mo.disconnect();
try{fit()}catch(e){}
if(mo){mo.takeRecords();mo.observe(document.body,{childList:true,subtree:true,characterData:true})}
if(ro)ro.observe(document.body);
busy=false;
ready();
f.style.opacity=Math.max(d.scrollHeight,document.body.scrollHeight)>d.clientHeight+1?"1":"0"};
ro=new ResizeObserver(check);ro.observe(document.body);
// A ResizeObserver alone is not enough once a tile is interactive: body pins
// overflow:hidden, so content growing past the fold changes scrollHeight
// without changing the border box the observer watches. A sort or filter
// click would silently overflow — the exact crop ADR-0019 forbids. Watching
// the subtree catches the mutation itself.
mo=new MutationObserver(check);
mo.observe(document.body,{childList:true,subtree:true,characterData:true});
addEventListener("resize",check);
// The injected mono lands after DOMContentLoaded and grows every row a
// little (ADR-0031); fitting only once would measure fallback metrics.
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(check);
check()}
document.readyState==="loading"?addEventListener("DOMContentLoaded",init):init()
})()</script>`
}

/**
 * Chrome-side @font-face for the artifact mono (ADR-0031). Artifacts lead
 * their `--font-mono` stack with "Geist Mono Variable" but stay
 * self-contained — the family only resolves when the host provides the
 * face, and the raw page falls back to the system mono. The caller passes
 * the woff2 as a data URI (never a URL: the sandboxed iframe has an opaque
 * origin, so a same-origin asset fetch would be blocked as cross-origin)
 * because this module runs both in the browser bundle (widget-card inlines
 * via Vite) and under plain Node (artifact-sheet reads the file itself).
 */
export function artifactFontStyle(woff2DataUri: string): string {
  return (
    '<style data-steward-font>@font-face{font-family:"Geist Mono Variable";' +
    "font-style:normal;font-weight:100 900;font-display:block;" +
    `src:url(${woff2DataUri}) format("woff2")}</style>`
  )
}

/**
 * The artifact kit's stylesheet, wrapped for injection (ADR-0050).
 *
 * A kit-rendered artifact already inlines the version it was compiled against
 * — it has to, or a raw-opened file is unstyled. Appending the *current* one
 * over it is what makes a design fix reach the existing board: before this,
 * the standard's own caveat was that "published artifacts only pick up the
 * language when their routine reruns", which costs a full agent run per
 * widget. Now it costs a page load.
 *
 * Takes the CSS as a parameter for the same reason `artifactFontStyle` does:
 * this module runs under plain Node for `scripts/artifact-sheet.ts`, which
 * cannot resolve the Vite `?raw` import that reads it (see artifact-kit.ts).
 */
export function artifactKitStyle(css: string): string {
  return `<style data-steward-kit>${css}</style>`
}

/**
 * Did this artifact opt into the kit? Only kit-rendered files carry the
 * version stamp `Shell` writes.
 *
 * The injection is gated on this, and the gate is not a nicety. `kit.css`
 * opens with Tailwind's preflight — a global reset that zeroes body margin,
 * restyles headings and lists, and so on. Applied to the artifacts already on
 * the `artifacts` branch, which were hand-authored years of design decisions
 * ago against no reset at all, it silently relayouts every one of them. It was
 * caught here by a widget-card test: preflight dropped a small artifact's
 * `scrollHeight` under the paint-signal threshold and the loading veil never
 * lifted.
 *
 * Gating also makes the compatibility story honest. A legacy artifact renders
 * exactly as it always did, and picks up the kit only when its routine is
 * migrated and republishes with the stamp.
 */
export function usesArtifactKit(html: string): boolean {
  return /<meta[^>]+name="steward-kit-version"/i.test(html)
}

/** Where a framed artifact renders: a board cell, or the full-view lightbox. */
export type ArtifactView = "tile" | "full"

/** The signed-in viewer, resolved at render time for person-relative content. */
export type ArtifactViewer = { login: string; name?: string }

/**
 * Render-time viewer identity for person-relative artifacts (ADR-0039).
 * A shared artifact (e.g. repo-pulse) is published viewer-neutral and
 * progressively enhances "needs your review" / "yours" against this login;
 * a raw page, or a viewer with no stake, stays neutral. Injected like the
 * theme and font overrides (ADR-0009/0031): render-time and in-memory,
 * nothing reaches the published file. The artifact reads
 * `window.__STEWARD_VIEWER__` in a DOMContentLoaded handler, so this runs
 * before then whatever the append order. `<` is escaped so a display name
 * can never break out of the `<script>`; the value is a bare identity, not
 * a token — the trigger secret never travels to the iframe.
 */
export function artifactViewerScript(viewer: ArtifactViewer): string {
  const identity = viewer.name
    ? { login: viewer.login, name: viewer.name }
    : { login: viewer.login }
  const json = JSON.stringify(identity).replace(/</g, "\\u003c")
  return `<script data-steward-viewer>window.__STEWARD_VIEWER__=${json}</script>`
}

export function frameArtifactHtml(
  html: string,
  name: ThemeName,
  view: ArtifactView = "tile",
  fontStyle = "",
  viewer?: ArtifactViewer,
  kitStyle = "",
): string {
  return (
    html +
    // Only for artifacts that opted in — see usesArtifactKit. First among the
    // appended blocks, so everything the frame asserts below (the footer hide,
    // the tile flush repaint, the theme override) still outranks it: the kit
    // is the artifact's own language, these are the frame's corrections to it.
    (usesArtifactKit(html) ? kitStyle : "") +
    EMBED_FRAME_STYLE +
    LINK_GUARD_SCRIPT +
    fontStyle +
    (viewer ? artifactViewerScript(viewer) : "") +
    // Kit-only: the buttons it drives exist only in kit-rendered markup, and
    // they ship hidden until this reveals them.
    (usesArtifactKit(html) ? ARTIFACT_COPY_SCRIPT : "") +
    (view === "tile"
      ? TILE_GUARD_STYLE +
        tileGuardScript(usesArtifactKit(html)) +
        TILE_FLUSH_STYLE
      : "") +
    artifactThemeStyle(name)
  )
}

/**
 * Pre-paint init: stamps `data-theme`, the `.dark` class and the
 * `theme-color` metas from the stored preference before first paint, so a
 * non-default theme never flashes gruvbox. Inlined as a blocking script in
 * <head> (root.tsx). Kept dependency-free and defensive — any failure leaves
 * the SSR default. Mirrors coercePrefs: each slot only accepts a theme of its
 * own mode, so corrupt storage can't pair a light `data-theme` with the
 * `.dark` class.
 *
 * The `theme-color` pair is *written here rather than rendered* — see the
 * root.tsx note. Two tags, both carrying the one resolved color: Chrome only
 * themes an installed app's window frame under a dark OS when a
 * dark-matching tag exists (it has honoured `media` on theme-color for
 * installed PWAs since 93), while a forced light mode under that same dark OS
 * must still paint the frame light. So the media attributes exist to satisfy
 * the match, and the content answers the preference, not the OS.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var darks=${JSON.stringify(
  themeEntries.filter(([, t]) => t.mode === "dark").map(([n]) => n),
)};var lights=${JSON.stringify(
  themeEntries.filter(([, t]) => t.mode === "light").map(([n]) => n),
)};var p=null;try{p=JSON.parse(localStorage.getItem(${JSON.stringify(
  APPEARANCE_STORAGE_KEY,
)}))}catch(e){}p=p||{};var sysDark=window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches;var dark=p.mode==="dark"||(p.mode!=="light"&&sysDark);var pool=dark?darks:lights;var t=dark?p.darkTheme:p.lightTheme;if(pool.indexOf(t)<0)t=dark?${JSON.stringify(
  DEFAULT_DARK_THEME,
)}:${JSON.stringify(
  DEFAULT_LIGHT_THEME,
)};var d=document.documentElement;d.setAttribute("data-theme",t);d.classList.toggle("dark",dark);var c=${JSON.stringify(
  Object.fromEntries(
    themeEntries.map(([name, theme]) => [name, theme.tokens.bg]),
  ),
)}[t];["light","dark"].forEach(function(q){var m=document.createElement("meta");m.name="theme-color";m.media="(prefers-color-scheme: "+q+")";m.content=c;document.head.appendChild(m)})}catch(e){}})()`
