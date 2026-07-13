import { describe, expect, it } from "vitest"

import {
  coercePrefs,
  DEFAULT_APPEARANCE,
  DEFAULT_THEME,
  resolveTheme,
  frameArtifactHtml,
  themeEntries,
  themeFamilies,
  themes,
  themeStylesheet,
} from "./theme.ts"

describe("coercePrefs", () => {
  it("accepts a valid preference", () => {
    expect(
      coercePrefs({
        mode: "light",
        lightTheme: "catppuccin-latte",
        darkTheme: "tokyo-night",
      }),
    ).toEqual({
      mode: "light",
      lightTheme: "catppuccin-latte",
      darkTheme: "tokyo-night",
    })
  })

  it("falls back to defaults on garbage", () => {
    expect(coercePrefs(null)).toEqual(DEFAULT_APPEARANCE)
    expect(
      coercePrefs({ mode: "neon", lightTheme: 3, darkTheme: "nope" }),
    ).toEqual(DEFAULT_APPEARANCE)
  })

  it("rejects a theme placed in the wrong-mode slot", () => {
    const prefs = coercePrefs({
      mode: "system",
      lightTheme: "tokyo-night", // dark theme in the light slot
      darkTheme: "gruvbox-light", // light theme in the dark slot
    })
    expect(prefs).toEqual(DEFAULT_APPEARANCE)
  })
})

describe("resolveTheme", () => {
  const prefs = coercePrefs({
    mode: "system",
    lightTheme: "rose-pine-dawn",
    darkTheme: "rose-pine",
  })
  it("follows the OS under system mode", () => {
    expect(resolveTheme(prefs, true)).toBe("rose-pine")
    expect(resolveTheme(prefs, false)).toBe("rose-pine-dawn")
  })
  it("pins to the slot when a mode is chosen", () => {
    expect(resolveTheme({ ...prefs, mode: "dark" }, false)).toBe("rose-pine")
    expect(resolveTheme({ ...prefs, mode: "light" }, true)).toBe(
      "rose-pine-dawn",
    )
  })
})

describe("registry integrity", () => {
  it("themeNames lists every registered theme exactly once", () => {
    expect([...themeEntries.map(([name]) => name)].sort()).toEqual(
      Object.keys(themes).sort(),
    )
  })

  it("family members exist and carry the right mode", () => {
    for (const family of themeFamilies) {
      expect(themes[family.light].mode).toBe("light")
      expect(themes[family.dark].mode).toBe("dark")
    }
  })

  it("the stylesheet has the default on :root plus one block per theme", () => {
    const css = themeStylesheet()
    expect(css).toContain(`:root{`)
    for (const [name] of themeEntries) {
      expect(css).toContain(`[data-theme="${name}"]`)
    }
    // The default block carries the canonical gruvbox page background.
    expect(css.split("\n")[0]).toContain("--palette-bg:#1d2021")
  })
})

describe("frameArtifactHtml", () => {
  const doc = "<html><head></head><body>hi</body></html>"

  it("hides the artifact footer, adding no theme override on the default", () => {
    const framed = frameArtifactHtml(doc, DEFAULT_THEME)
    expect(framed.startsWith(doc)).toBe(true)
    // The card chrome renders identity + freshness; the artifact's own
    // footer is standalone-only, so the embedded frame suppresses it.
    expect(framed).toContain("footer{display:none !important}")
    // No override block — the tile guard's var(--color-bg1) fallback is the
    // only palette reference the default framing carries.
    expect(framed).not.toContain("data-steward-theme")
    // A null override must not stringify into the srcdoc as visible "null".
    expect(framed).not.toContain("null")
  })

  it("appends the --color-* overrides for any other theme", () => {
    const themed = frameArtifactHtml(doc, "catppuccin-mocha")
    expect(themed.startsWith(doc)).toBe(true)
    expect(themed).toContain("footer{display:none !important}")
    expect(themed).toContain("--color-bg:#181825 !important")
    // The artifact contract's historical `orange` slot carries the accent.
    expect(themed).toContain("--color-orange:#cba6f7 !important")
    expect(themed).toContain("color-scheme:dark")
  })

  it("flips color-scheme for light themes", () => {
    expect(frameArtifactHtml(doc, "gruvbox-light")).toContain(
      "color-scheme:light",
    )
  })

  it("guards tile overflow by default: no scrolling, stamp, fade", () => {
    const tile = frameArtifactHtml(doc, DEFAULT_THEME)
    // Tiles never scroll (ADR-0019) — a non-compliant artifact clips…
    expect(tile).toContain("overflow:hidden !important")
    // …visibly: the fade marks truncation instead of a mid-line crop.
    expect(tile).toContain("steward-tile-fade")
    // The stamp artifacts gate their fit-to-height logic on.
    expect(tile).toContain('data-steward-tile",""')
  })

  it("carries the link guard in both views (ADR-0028)", () => {
    const tile = frameArtifactHtml(doc, DEFAULT_THEME)
    const full = frameArtifactHtml(doc, DEFAULT_THEME, "full")
    for (const framed of [tile, full]) {
      // Bare anchors get retargeted at click time — in-frame navigation is
      // sandbox-blocked, so without this a forgotten target is a dead link.
      expect(framed).toContain("data-steward-link-guard")
      expect(framed).toContain('a.target="_blank"')
      expect(framed).toContain('a.rel="noopener"')
    }
  })

  it("leaves the full view scrollable — footer hidden, no tile guard", () => {
    const full = frameArtifactHtml(doc, DEFAULT_THEME, "full")
    expect(full).toContain("footer{display:none !important}")
    expect(full).not.toContain("overflow:hidden")
    expect(full).not.toContain("data-steward-tile")
  })
})

// --- WCAG contrast discipline (PRODUCT.md accessibility section) -----------

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16)
  const channel = (value: number) => {
    const c = value / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return (
    0.2126 * channel((n >> 16) & 0xff) +
    0.7152 * channel((n >> 8) & 0xff) +
    0.0722 * channel(n & 0xff)
  )
}

function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

describe("every theme clears the contrast floors", () => {
  for (const [name, theme] of themeEntries) {
    const { tokens: t } = theme
    it(`${name}: body ink ≥ 4.5:1 on every surface`, () => {
      for (const surface of [t.bg, t.bg1, t.bg2]) {
        expect(contrast(t.ink, surface)).toBeGreaterThanOrEqual(4.5)
      }
    })
    it(`${name}: secondary ink ≥ 4.5:1 on page and cards`, () => {
      expect(contrast(t.inkDim, t.bg)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(t.inkDim, t.bg1)).toBeGreaterThanOrEqual(4.5)
    })
    it(`${name}: metadata ink ≥ 3:1 on page and cards`, () => {
      expect(contrast(t.inkFaint, t.bg)).toBeGreaterThanOrEqual(3)
      expect(contrast(t.inkFaint, t.bg1)).toBeGreaterThanOrEqual(3)
    })
    it(`${name}: the mark's knot ≥ 3:1 on page and sidebar`, () => {
      // The bow tie renders tile-less in chrome (wings `ink`, knot `accent`),
      // so the knot must clear the WCAG graphics floor on the surfaces the
      // glyph actually sits on: the landing page (bg) and the sidebar (bg1).
      expect(contrast(t.accent, t.bg)).toBeGreaterThanOrEqual(3)
      expect(contrast(t.accent, t.bg1)).toBeGreaterThanOrEqual(3)
    })
    it(`${name}: primary button label ≥ 4.5:1, fill and ring ≥ 3:1`, () => {
      // The button label is bg1 (--primary-foreground) — each palette's
      // brightest/most-neutral surface, which clears full AA on every
      // accent; the fill itself must stay distinct against the page.
      expect(contrast(t.bg1, t.accent)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(t.accent, t.bg)).toBeGreaterThanOrEqual(3)
      expect(contrast(t.accentDeep, t.bg)).toBeGreaterThanOrEqual(3)
    })
    it(`${name}: cards separate from the canvas`, () => {
      // The surface hierarchy is the product ("widgets glow, chrome
      // recedes"): a card must sit visibly off the page in every theme.
      expect(contrast(t.bg, t.bg1)).toBeGreaterThanOrEqual(1.05)
    })
  }
})
