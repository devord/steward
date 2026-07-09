/**
 * The theme registry and appearance model — the one place that knows every
 * palette and resolves which one is active (ADR-0009).
 *
 * Each theme carries the full Bulletin token set (the roles DESIGN.md
 * defines: surfaces bg…bg3, borders, inks, the accent pair, and the status
 * colors), transcribed from its upstream palette — no invented colors.
 * Gruvbox dark hard remains the canonical default: artifacts are authored
 * in it (docs/widget-standard.md) and the server renders it before the
 * client preference is known.
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

/** A theme's perceptual mode — drives `color-scheme` and the `.dark` class. */
export type ThemeMode = "dark" | "light"

/** The Bulletin token roles every theme must fill (see DESIGN.md). */
export interface ThemeTokens {
  /** Page background. */
  bg: string
  /** Widget cards, panels. */
  bg1: string
  /** Edit-mode surfaces, wells. */
  bg2: string
  /** Hover fills, secondary controls. */
  bg3: string
  /** Strong borders, inputs. */
  border: string
  /** Hairlines inside cards. */
  borderDim: string
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
 * The curated set: four families, each shipping a light and a dark member.
 * Values are transcribed from each palette's upstream definition (gruvbox
 * hard variants, Catppuccin mocha/latte, Rosé Pine main/dawn,
 * tokyonight.nvim night style + the Tokyo Night Light VS Code palette).
 * Documented residuals:
 *  - Rosé Pine has no green, so `green` reuses foam;
 *  - where a palette's own dim/faint ink misses AA on its canvas, the role
 *    is repointed to the nearest AA-clearing tone from the same palette
 *    family (latte ink-dim → subtext1, dawn ink-dim → the family's muted,
 *    tokyo-night ink-faint → dark5);
 *  - Tokyo Night Light ships no AA-clearing mid gray at all, so its
 *    ink-dim collapses to the body ink and hierarchy is carried by weight
 *    and size — theme.test.ts enforces the ratios for every theme.
 */
export const themes = {
  "gruvbox-dark": {
    label: "Gruvbox Dark",
    mode: "dark",
    tokens: {
      bg: "#1d2021",
      bg1: "#282828",
      bg2: "#32302f",
      bg3: "#3c3836",
      border: "#504945",
      borderDim: "#3c3836",
      ink: "#ebdbb2",
      inkDim: "#a89984",
      inkFaint: "#928374",
      accent: "#fe8019",
      accentDeep: "#d65d0e",
      yellow: "#fabd2f",
      green: "#b8bb26",
      aqua: "#8ec07c",
      blue: "#83a598",
      purple: "#d3869b",
      red: "#fb4934",
    },
  },
  "gruvbox-light": {
    label: "Gruvbox Light",
    mode: "light",
    tokens: {
      bg: "#f9f5d7",
      bg1: "#fbf1c7",
      bg2: "#f2e5bc",
      bg3: "#ebdbb2",
      border: "#bdae93",
      borderDim: "#d5c4a1",
      ink: "#3c3836",
      inkDim: "#665c54",
      inkFaint: "#7c6f64",
      accent: "#af3a03",
      accentDeep: "#d65d0e",
      yellow: "#b57614",
      green: "#79740e",
      aqua: "#427b58",
      blue: "#076678",
      purple: "#8f3f71",
      red: "#9d0006",
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
      bg: "#e6e9ef",
      bg1: "#eff1f5",
      bg2: "#e6e9ef",
      bg3: "#ccd0da",
      border: "#bcc0cc",
      borderDim: "#ccd0da",
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
      borderDim: "#26233a",
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
      bg: "#faf4ed",
      bg1: "#fffaf3",
      bg2: "#f2e9e1",
      bg3: "#dfdad9",
      border: "#cecacd",
      borderDim: "#dfdad9",
      ink: "#575279",
      inkDim: "#6e6a86",
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
      border: "#c1c2c7",
      borderDim: "#c1c2c7",
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
]

/** Ordered `[name, theme]` pairs — the pickers iterate this. */
export const themeEntries: readonly [ThemeName, Theme][] = themeNames.map(
  (name): [ThemeName, Theme] => [name, themes[name]],
)

/** The canonical default — what the server renders and artifacts are authored in. */
export const DEFAULT_THEME: ThemeName = "gruvbox-dark"
export const DEFAULT_DARK_THEME: ThemeName = "gruvbox-dark"
export const DEFAULT_LIGHT_THEME: ThemeName = "gruvbox-light"

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

/** Theme entries of one mode, in registry order. */
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
export const APPEARANCE_STORAGE_KEY = "bulletin-appearance"
/** Custom event fired after a preference write, for same-tab subscribers. */
export const APPEARANCE_EVENT = "bulletin:appearance"

/** Fresh default: follow the OS with the gruvbox pair — dark stays dark. */
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
 * The palette blocks served as an inline `<style>` from root.tsx: the
 * default on `:root`, then one `[data-theme]` block per theme. Semantic
 * tokens in app.css alias these vars, so flipping the attribute re-themes
 * everything at the next paint.
 */
export function themeStylesheet(): string {
  const blocks = themeEntries.map(
    ([name, theme]) => `[data-theme="${name}"]{${declarations(theme)}}`,
  )
  return [`:root{${declarations(themes[DEFAULT_THEME])}}`, ...blocks].join("\n")
}

/**
 * Artifact-side var overrides for the widget iframes (ADR-0009). Published
 * artifacts inline the gruvbox palette as `--color-*` custom properties
 * (docs/widget-standard.md); appending this style block re-points those
 * same names at the active theme. `accent` maps onto the artifact contract's
 * historical `orange` slot. Returns null for the default theme — native
 * artifacts need no help.
 */
export function artifactThemeStyle(name: ThemeName): string | null {
  if (name === DEFAULT_THEME) return null
  const { tokens: t, mode } = themes[name]
  const pairs: [string, string][] = [
    ["--color-bg", t.bg],
    ["--color-bg1", t.bg1],
    ["--color-bg2", t.bg2],
    ["--color-bg3", t.bg3],
    ["--color-border", t.border],
    ["--color-border-dim", t.borderDim],
    ["--color-ink", t.ink],
    ["--color-ink-dim", t.inkDim],
    ["--color-ink-faint", t.inkFaint],
    ["--color-orange", t.accent],
    ["--color-orange-deep", t.accentDeep],
    ["--color-yellow", t.yellow],
    ["--color-green", t.green],
    ["--color-aqua", t.aqua],
    ["--color-blue", t.blue],
    ["--color-purple", t.purple],
    ["--color-red", t.red],
  ]
  const vars = pairs.map(([k, v]) => `${k}:${v} !important`).join(";")
  return `<style data-bulletin-theme>:root{${vars};color-scheme:${mode}}</style>`
}

/** Append the theme override to an artifact document (no-op on the default). */
export function themeArtifactHtml(html: string, name: ThemeName): string {
  const style = artifactThemeStyle(name)
  return style ? html + style : html
}

/**
 * Pre-paint init: stamps `data-theme` and the `.dark` class from the stored
 * preference before first paint, so a non-default theme never flashes
 * gruvbox. Inlined as a blocking script in <head> (root.tsx). Kept
 * dependency-free and defensive — any failure leaves the SSR default.
 * Mirrors coercePrefs: each slot only accepts a theme of its own mode, so
 * corrupt storage can't pair a light `data-theme` with the `.dark` class.
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
)};var d=document.documentElement;d.setAttribute("data-theme",t);d.classList.toggle("dark",dark)}catch(e){}})()`
