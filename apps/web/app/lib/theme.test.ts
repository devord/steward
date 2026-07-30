import { readFile } from "node:fs/promises"

import { describe, expect, it } from "vitest"

import {
  artifactKitStyle,
  coercePrefs,
  DEFAULT_APPEARANCE,
  DEFAULT_DARK_THEME,
  DEFAULT_LIGHT_THEME,
  DEFAULT_THEME,
  familyForTheme,
  MARK_IDENTITY,
  resolveTheme,
  frameArtifactHtml,
  THEME_INIT_SCRIPT,
  themeColor,
  themeEntries,
  themeFamilies,
  type ThemeName,
  themes,
  themesByMode,
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

describe("THEME_INIT_SCRIPT", () => {
  /**
   * Run the pre-paint script against a hand-rolled document, the way it runs
   * in <head> before React exists. `new Function` parameters shadow the four
   * globals it touches, so nothing leaks into the node environment.
   */
  function runInit(stored: unknown, systemDark: boolean) {
    const metas: Record<string, string>[] = []
    const attributes: Record<string, string> = {}
    let dark = false
    const matchMedia = (query: string) => ({
      matches: query === "(prefers-color-scheme: dark)" && systemDark,
    })
    const documentStub = {
      documentElement: {
        setAttribute: (name: string, value: string) => {
          attributes[name] = value
        },
        classList: {
          toggle: (_name: string, on: boolean) => {
            dark = on
          },
        },
      },
      createElement: (tag: string) => {
        expect(tag).toBe("meta")
        return {}
      },
      head: {
        appendChild: (meta: Record<string, string>) => metas.push(meta),
      },
    }
    new Function(
      "window",
      "document",
      "localStorage",
      "matchMedia",
      THEME_INIT_SCRIPT,
    )(
      { matchMedia },
      documentStub,
      { getItem: () => (stored == null ? null : JSON.stringify(stored)) },
      matchMedia,
    )
    return { theme: attributes["data-theme"], dark, metas }
  }

  /** Both tags of the pair, media-scoped, on one color. */
  const pair = (name: ThemeName) => [
    {
      name: "theme-color",
      media: "(prefers-color-scheme: light)",
      content: themeColor(name),
    },
    {
      name: "theme-color",
      media: "(prefers-color-scheme: dark)",
      content: themeColor(name),
    },
  ]

  it("stamps the fresh-install default when nothing is stored", () => {
    expect(runInit(null, true)).toEqual({
      theme: DEFAULT_DARK_THEME,
      dark: true,
      metas: pair(DEFAULT_DARK_THEME),
    })
    expect(runInit(null, false)).toEqual({
      theme: DEFAULT_LIGHT_THEME,
      dark: false,
      metas: pair(DEFAULT_LIGHT_THEME),
    })
  })

  // Both tags carry the *resolved* color, not the one their own media query
  // implies: a forced light mode under a dark OS must paint the window frame
  // light, and the dark-scoped tag is only there so Chrome themes the frame
  // at all under that OS.
  it("paints both tags with the resolved theme, not the OS's", () => {
    const { theme, dark, metas } = runInit(
      { mode: "light", lightTheme: "gruvbox-light", darkTheme: "gruvbox-dark" },
      true,
    )
    expect([theme, dark]).toEqual(["gruvbox-light", false])
    expect(metas).toEqual(pair("gruvbox-light"))
  })

  it("falls back to the default slot when storage names a bad theme", () => {
    const { theme, metas } = runInit(
      { mode: "dark", darkTheme: "gruvbox-light" },
      false,
    )
    expect(theme).toBe(DEFAULT_DARK_THEME)
    expect(metas).toEqual(pair(DEFAULT_DARK_THEME))
  })
})

describe("the installed app's manifest", () => {
  // The window frame paints from the manifest until THEME_INIT_SCRIPT writes
  // the theme-color pair — that's why root.tsx renders no meta of its own.
  // Drift here is a title bar flashing a retired color on every cold start.
  it("holds the fresh-install dark canvas", async () => {
    const manifest = JSON.parse(
      await readFile(
        new URL("../../public/manifest.webmanifest", import.meta.url),
        "utf8",
      ),
    )
    expect(manifest.theme_color).toBe(themeColor(DEFAULT_DARK_THEME))
    expect(manifest.background_color).toBe(themeColor(DEFAULT_DARK_THEME))
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

  // Only complete families ship (ADR-0009). The settings picker leans on it:
  // collapsing a split pair back to one theme resolves the shown slot's
  // family, and a theme belonging to none would leave the checkbox inert.
  it("every theme belongs to exactly one family", () => {
    for (const [name] of themeEntries) {
      const owners = themeFamilies.filter(
        (f) => f.light === name || f.dark === name,
      )
      expect(owners.map((f) => f.id)).toHaveLength(1)
      expect(familyForTheme(name)).toBe(owners[0])
    }
  })

  // The split picker renders a light row above a dark row and relies on
  // column n being the same family in both.
  it("themesByMode returns both slices in themeFamilies order", () => {
    expect(themesByMode("light").map(([name]) => name)).toEqual(
      themeFamilies.map((f) => f.light),
    )
    expect(themesByMode("dark").map(([name]) => name)).toEqual(
      themeFamilies.map((f) => f.dark),
    )
  })

  it("the stylesheet has the default on :root plus one block per theme", () => {
    const css = themeStylesheet()
    expect(css).toContain(`:root{`)
    for (const [name] of themeEntries) {
      expect(css).toContain(`[data-theme="${name}"]`)
    }
    // The default block carries the canonical gruvbox page background.
    expect(css.split("\n")[0]).toContain("--palette-bg:#282828")
  })
})

describe("frameArtifactHtml", () => {
  const doc = "<html><head></head><body>hi</body></html>"

  it("hides the artifact footer and overrides even on the default", () => {
    const framed = frameArtifactHtml(doc, DEFAULT_THEME)
    expect(framed.startsWith(doc)).toBe(true)
    // The card chrome renders identity + freshness; the artifact's own
    // footer is standalone-only, so the embedded frame suppresses it.
    expect(framed).toContain("footer{display:none !important}")
    // The anchor is overridden like any other theme. Skipping it here would
    // freeze the anchor's hexes: every already-published artifact bakes them
    // in, so a registry change (the gruvbox-material transcription) would
    // leave old artifacts painting the previous palette beside new chrome.
    expect(framed).toContain("data-steward-theme")
    expect(framed).toContain(`--color-bg:${themes[DEFAULT_THEME].tokens.bg}`)
    // Nothing may stringify into the srcdoc as a visible "null".
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

  describe("the artifact kit stylesheet (ADR-0050)", () => {
    const KIT = artifactKitStyle("body{--kit:1}")
    const kitDoc =
      '<html><head><meta name="steward-kit-version" content="1.0.0"></head>' +
      "<body>hi</body></html>"

    it("injects into an artifact that opted in", () => {
      // This is what lets a design fix reach an artifact published months ago
      // — the alternative is a full agent run per widget.
      const framed = frameArtifactHtml(
        kitDoc,
        DEFAULT_THEME,
        "tile",
        "",
        undefined,
        KIT,
      )
      expect(framed).toContain("data-steward-kit")
      expect(framed).toContain("body{--kit:1}")
    })

    it("leaves a legacy artifact completely untouched", () => {
      // kit.css opens with Tailwind's preflight — a global reset. Applied to
      // the hand-authored artifacts already on the branch it silently
      // relayouts them: zeroed body margin alone dropped one under the
      // paint-signal height threshold, so its loading veil never lifted. A
      // legacy file picks the kit up when its routine migrates, not before.
      const framed = frameArtifactHtml(
        doc,
        DEFAULT_THEME,
        "tile",
        "",
        undefined,
        KIT,
      )
      expect(framed).not.toContain("data-steward-kit")
      expect(framed).not.toContain("body{--kit:1}")
    })

    it("ranks below the frame's own corrections", () => {
      // The footer hide, the tile flush repaint and the theme override all
      // have to outrank the kit, so they are appended after it.
      const framed = frameArtifactHtml(
        kitDoc,
        DEFAULT_THEME,
        "tile",
        "",
        undefined,
        KIT,
      )
      expect(framed.indexOf("data-steward-kit")).toBeLessThan(
        framed.indexOf("data-steward-embed"),
      )
      expect(framed.indexOf("data-steward-kit")).toBeLessThan(
        framed.indexOf("data-steward-theme"),
      )
    })
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

  it("injects the viewer identity only when a viewer is given (ADR-0039)", () => {
    // No viewer → nothing injected: the artifact stays viewer-neutral (raw
    // page, standalone render).
    expect(frameArtifactHtml(doc, DEFAULT_THEME)).not.toContain(
      "data-steward-viewer",
    )
    const framed = frameArtifactHtml(doc, DEFAULT_THEME, "tile", "", {
      login: "danielmoraes",
    })
    expect(framed).toContain(
      "<script data-steward-viewer>window.__STEWARD_VIEWER__=" +
        '{"login":"danielmoraes"}</script>',
    )
    // Injected in both views — the full-view lightbox personalizes too.
    expect(
      frameArtifactHtml(doc, DEFAULT_THEME, "full", "", { login: "x" }),
    ).toContain("data-steward-viewer")
  })

  it("escapes < in the viewer identity so a name can't break the script", () => {
    const framed = frameArtifactHtml(doc, DEFAULT_THEME, "tile", "", {
      login: "danielmoraes",
      name: "</script><b>x",
    })
    expect(framed).not.toContain("</script><b>x")
    expect(framed).toContain("\\u003c/script>\\u003cb>x")
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
    // Both text roles clear full AA on every surface they sit on. There is no
    // third, dimmer text tier and no exemption for "just metadata" (ADR-0048):
    // freshness is the product, so the readout that carries it is held to the
    // same floor as body copy. De-emphasis is spent on size and weight.
    it(`${name}: secondary ink ≥ 4.5:1 on every surface`, () => {
      for (const surface of [t.bg, t.bg1, t.bg2]) {
        expect(contrast(t.inkDim, surface)).toBeGreaterThanOrEqual(4.5)
      }
    })
    it(`${name}: ink-faint is a glyph role — ≥ 3:1, WCAG 1.4.11`, () => {
      // ADR-0048 retired ink-faint as a *text* role: measured across the
      // registry it cleared 4.5:1 on one palette of fourteen and bottomed out
      // at 3.20:1 (rose-pine on bg1), so every timestamp and count set in it
      // shipped sub-AA. It survives for what 3:1 genuinely covers — resting
      // glyphs, hover-revealed icon buttons, disabled controls — and the floor
      // below is the graphics one, not a discount on the text one.
      expect(contrast(t.inkFaint, t.bg)).toBeGreaterThanOrEqual(3)
      expect(contrast(t.inkFaint, t.bg1)).toBeGreaterThanOrEqual(3)
    })
    it(`${name}: the ink tiers never invert`, () => {
      // A dimmer role that outweighs a brighter one inverts the hierarchy:
      // metadata louder than the body it qualifies. Ordered, but not strictly
      // for the secondary tier — rose-pine-dawn and tokyo-night-light have no
      // ink that is both dimmer than body and AA-clearing, so `ink-dim`
      // collapses onto `ink` and those themes carry the secondary tier with
      // size and weight instead. That collapse is legal; an inversion is not.
      for (const surface of [t.bg, t.bg1]) {
        expect(contrast(t.inkDim, surface)).toBeLessThanOrEqual(
          contrast(t.ink, surface),
        )
        // The glyph tier has headroom on every palette, so it stays strict.
        expect(contrast(t.inkFaint, surface)).toBeLessThan(
          contrast(t.inkDim, surface),
        )
      }
    })
    it(`${name}: the identity mark ≥ 3:1 on page and sidebar`, () => {
      // The bow tie wears a fixed identity (DESIGN.md § Mark): one light
      // and one dark colorway keyed on mode, never on the theme. So every
      // theme must carry the *identity* wings and knot past the WCAG
      // graphics floor on the surfaces the glyph sits on — the landing
      // page (bg) and the sidebar (bg1) — including the fold end of the
      // wing gradient, which is the darker stop.
      const mark = MARK_IDENTITY[theme.mode]
      for (const surface of [t.bg, t.bg1]) {
        expect(contrast(mark.wingTip, surface)).toBeGreaterThanOrEqual(3)
        expect(contrast(mark.wingFold, surface)).toBeGreaterThanOrEqual(3)
        expect(contrast(mark.knot, surface)).toBeGreaterThanOrEqual(3)
      }
    })
    it(`${name}: primary button label ≥ 4.5:1, fill and ring ≥ 3:1`, () => {
      // The button label is bg1 (--primary-foreground) — each palette's
      // brightest/most-neutral surface, which clears full AA on every
      // accent; the fill itself must stay distinct against the page.
      expect(contrast(t.bg1, t.accent)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(t.accent, t.bg)).toBeGreaterThanOrEqual(3)
      expect(contrast(t.accentDeep, t.bg)).toBeGreaterThanOrEqual(3)
    })
    // The three border tiers, graded and ordered. Nothing enforced these
    // before, which is how every light theme's border drifted to within one
    // ramp step of its own canvas (kanagawa-lotus bottomed out at 1.16:1).
    it(`${name}: control boundaries ≥ 3:1 — WCAG 1.4.11`, () => {
      // Inputs, selects and checkboxes are fill-less, so `borderStrong` is
      // the only thing identifying them on either surface they sit on.
      expect(contrast(t.borderStrong, t.bg)).toBeGreaterThanOrEqual(3)
      expect(contrast(t.borderStrong, t.bg1)).toBeGreaterThanOrEqual(3)
    })
    it(`${name}: object edges ≥ 1.5:1, plane hairlines ≥ 1.2:1`, () => {
      for (const surface of [t.bg, t.bg1]) {
        expect(contrast(t.border, surface)).toBeGreaterThanOrEqual(1.5)
        expect(contrast(t.borderDim, surface)).toBeGreaterThanOrEqual(1.2)
      }
    })
    it(`${name}: the tiers stay strictly ordered on both surfaces`, () => {
      // A tier that outweighs the one above it inverts the hierarchy: a
      // divider louder than the card edge it sits inside.
      for (const surface of [t.bg, t.bg1]) {
        expect(contrast(t.borderDim, surface)).toBeLessThan(
          contrast(t.border, surface),
        )
        expect(contrast(t.border, surface)).toBeLessThan(
          contrast(t.borderStrong, surface),
        )
      }
    })
    it(`${name}: cards separate from the canvas`, () => {
      // The surface hierarchy is the product ("widgets glow, chrome
      // recedes"): a card must sit visibly off the page in every theme.
      expect(contrast(t.bg, t.bg1)).toBeGreaterThanOrEqual(1.05)
    })
  }
})
