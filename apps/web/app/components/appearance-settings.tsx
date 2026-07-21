/**
 * Settings · appearance — the mode control plus the theme picker (ADR-0009).
 *
 * Two controls, deliberately not three. **Mode** (auto / light / dark) is
 * what you see. **Theme** is which palette fills it, and it takes one shape
 * at a time: paired, the four family tiles where one click fills both slots;
 * or split, a Light row above a Dark row, both live. A checkbox under the
 * grid swaps between the two shapes.
 *
 * That swap is the point. The earlier version made splitting *modal* — a
 * Light|Dark pair that chose which slot you were editing, revealed under a
 * family grid it didn't replace. Three costs, all of which readers hit: a
 * second sun/moon control that looked like the mode switch but wasn't, two
 * theme radiogroups live at once (picking below silently deselected above),
 * and an invisible edit cursor that needed a "not what's showing right now"
 * line to apologise for itself. Splitting the grid *in place* removes all
 * three at once — nothing is ever edited out of view, so nothing has to be
 * narrated, and the page keeps exactly one sun/moon control.
 *
 * Single-choice semantics are real `radiogroup`s of `role="radio"` buttons
 * (one tab stop, arrow keys move and select) because the tiles carry a
 * multi-line palette preview a native radio can't. Selecting anything calls
 * `updateAppearance`, which persists and stamps the document — the palette
 * stylesheet does the rest at the next paint.
 */
import { useState } from "react"

import { Moon, Sun } from "lucide-react"

import { APPEARANCE_MODES } from "../lib/appearance-modes.ts"
import { useT } from "../lib/i18n.tsx"
import {
  familyForPair,
  familyForTheme,
  type Theme,
  type ThemeFamily,
  themeFamilies,
  type ThemeMode,
  type ThemeName,
  themes,
  themesByMode,
} from "../lib/theme.ts"
import { useAppearance } from "../lib/use-appearance.ts"
import { Checkbox } from "~/components/ui/checkbox"
import { Label } from "~/components/ui/label"
import { cn } from "~/lib/utils"

const MODE_HINT = {
  system: "settings.modeHintSystem",
  light: "settings.modeHintLight",
  dark: "settings.modeHintDark",
} as const

/** Shared tile chrome: bordered card, quiet until active. */
const TILE_BASE =
  "group flex cursor-pointer flex-col gap-1.5 rounded-lg border p-1.5 text-left transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
const TILE_ACTIVE = "border-primary"
const TILE_IDLE = "border-border-dim hover:border-border hover:bg-bg2"

/**
 * One track for every theme grid. Above `sm`, `auto-fit` (not `auto-fill`)
 * so the tiles share the full width instead of huddling in narrow tracks
 * with a gap on the right. Below it, a flat two columns: the registry ships
 * an even number of themes per mode, so 2×n always squares off, where
 * auto-fit's track math lands on three-plus-an-orphan through the phone and
 * split-window range.
 *
 * Shared by the paired row and both split rows, so the shapes swap without
 * the tiles resizing, and — since `themesByMode` returns family-aligned
 * slices — the Light and Dark rows line up column for column: Gruvbox over
 * Gruvbox, Catppuccin over Catppuccin.
 */
const TILE_GRID =
  "grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]"

/**
 * WAI-ARIA radiogroup roving for non-native radios: arrows move focus (with
 * wrap) to the sibling radio and select it. Shared with the language
 * radiogroup on the settings page.
 */
export function handleRadioKeydown(
  e: React.KeyboardEvent<HTMLButtonElement>,
): void {
  const forward = e.key === "ArrowRight" || e.key === "ArrowDown"
  const back = e.key === "ArrowLeft" || e.key === "ArrowUp"
  if (!forward && !back) return
  e.preventDefault()
  const group = e.currentTarget.closest('[role="radiogroup"]')
  if (!group) return
  const radios = [
    ...group.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
  ]
  const idx = radios.indexOf(e.currentTarget)
  if (idx < 0) return
  const next =
    radios[(idx + (forward ? 1 : -1) + radios.length) % radios.length]
  next?.focus()
  next?.click()
}

/** One palette swatch: canvas, accent bar, two ink lines. */
function PalettePreview({ theme, dim }: { theme: Theme; dim?: boolean }) {
  const { tokens } = theme
  return (
    <span
      aria-hidden
      className={cn(
        "flex flex-col justify-between p-2 transition-opacity",
        dim && "opacity-40",
      )}
      style={{ backgroundColor: tokens.bg }}
    >
      <span
        className="h-1.5 w-6 rounded-full"
        style={{ backgroundColor: tokens.accent }}
      />
      <span className="flex flex-col gap-1">
        <span
          className="h-1 w-full rounded-full"
          style={{ backgroundColor: tokens.ink }}
        />
        <span
          className="h-1 w-2/3 rounded-full"
          style={{ backgroundColor: tokens.inkDim }}
        />
      </span>
    </span>
  )
}

/** A family tile: light|dark split preview; one click fills both slots. */
function FamilyTile({
  family,
  active,
  tabIndex,
  shownMode,
  onSelect,
}: {
  family: ThemeFamily
  active: boolean
  tabIndex: number
  /** The slot the pinned mode shows (null under auto) — dims the other half. */
  shownMode: "light" | "dark" | null
  onSelect: (family: ThemeFamily) => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      tabIndex={tabIndex}
      onClick={() => onSelect(family)}
      onKeyDown={handleRadioKeydown}
      className={cn(TILE_BASE, active ? TILE_ACTIVE : TILE_IDLE)}
    >
      <span
        aria-hidden
        className="grid h-14 grid-cols-2 overflow-hidden rounded-md border border-border-dim"
      >
        <PalettePreview
          theme={themes[family.light]}
          dim={shownMode === "dark"}
        />
        <PalettePreview
          theme={themes[family.dark]}
          dim={shownMode === "light"}
        />
      </span>
      <span
        className={cn(
          "px-0.5 pb-0.5 font-mono text-xs transition-colors",
          active
            ? "text-foreground"
            : "text-ink-dim group-hover:text-foreground",
        )}
      >
        {family.label}
      </span>
    </button>
  )
}

/** A single-theme tile for the split rows. */
function ThemeTile({
  name,
  active,
  tabIndex,
  onSelect,
}: {
  name: ThemeName
  active: boolean
  tabIndex: number
  onSelect: (name: ThemeName) => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      tabIndex={tabIndex}
      onClick={() => onSelect(name)}
      onKeyDown={handleRadioKeydown}
      className={cn(TILE_BASE, active ? TILE_ACTIVE : TILE_IDLE)}
    >
      <span
        aria-hidden
        className="grid h-12 overflow-hidden rounded-md border border-border-dim"
      >
        <PalettePreview theme={themes[name]} />
      </span>
      <span
        className={cn(
          "px-0.5 pb-0.5 font-mono text-xs leading-tight transition-colors",
          active
            ? "text-foreground"
            : "text-ink-dim group-hover:text-foreground",
        )}
      >
        {themes[name].label}
      </span>
    </button>
  )
}

/**
 * One slot of the split picker: a caption naming the slot, then that mode's
 * themes. The caption is static text in the page's label voice, never a
 * control — the only sun/moon *buttons* on this page belong to the mode
 * switch, which is what keeps the two readable apart.
 *
 * A pinned mode leaves one slot idle, and the caption carries that: full ink
 * for the slot in play, quiet ink for the one waiting (both are in play under
 * auto). Deliberately not the family tiles' half-dimming — a whole row of
 * dark swatches at 40% over a light canvas turns into four identical muddy
 * blocks, destroying the one thing the swatch is there to show. And
 * deliberately not hiding the idle row: the theme still applies the moment
 * the mode flips back, so hiding it would mean changing your mode to change
 * your dark theme, which is the modal editing this redesign removed.
 */
function SlotRow({
  slot,
  selected,
  live,
  onSelect,
}: {
  slot: ThemeMode
  selected: ThemeName
  /** Whether the current mode actually shows this slot. */
  live: boolean
  onSelect: (name: ThemeName) => void
}) {
  const t = useT()
  const Icon = slot === "light" ? Sun : Moon
  const label = t(slot === "light" ? "settings.slotLight" : "settings.slotDark")
  return (
    <div className="flex flex-col gap-1.5">
      <span
        className={cn(
          "flex items-center gap-1.5 font-mono text-xs transition-colors",
          live ? "text-foreground" : "text-ink-dim",
        )}
      >
        <Icon aria-hidden className="size-3.5" />
        {label}
      </span>
      <div role="radiogroup" aria-label={label} className={TILE_GRID}>
        {themesByMode(slot).map(([name]) => (
          <ThemeTile
            key={name}
            name={name}
            active={name === selected}
            tabIndex={name === selected ? 0 : -1}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  )
}

export function AppearanceSettings() {
  const t = useT()
  const [prefs, update] = useAppearance()
  const activeFamily = familyForPair(prefs.lightTheme, prefs.darkTheme)
  // Open split when the stored pair isn't a family, so a custom mix shows
  // its two selections instead of a family row with nothing checked. The
  // user owns it after that: deriving it every render would snap the grid
  // shut the moment a hand-picked mix happened to land on a family's pair.
  const [split, setSplit] = useState(() => !activeFamily)

  /** The slot the mode actually shows (null under auto) — dims the other. */
  const shownMode = prefs.mode === "system" ? null : prefs.mode

  /**
   * Collapsing two themes into one has to pick a winner, so take the family
   * of the slot the mode is showing (the dark one under auto, which is both
   * the default mode and where the canonical theme lives). The palette on
   * screen is then the one that survives, and checking the box never
   * repaints the page out from under the click.
   */
  function pair() {
    setSplit(false)
    const family = familyForTheme(
      prefs.mode === "light" ? prefs.lightTheme : prefs.darkTheme,
    )
    if (family) update({ lightTheme: family.light, darkTheme: family.dark })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="text-sm text-ink-dim">{t("settings.mode")}</span>
        <div
          role="radiogroup"
          aria-label={t("settings.mode")}
          className="inline-grid w-full max-w-xs grid-cols-3 gap-1 rounded-lg border border-border-dim bg-bg1 p-1"
        >
          {APPEARANCE_MODES.map(({ mode, Icon, labelKey }) => {
            const active = prefs.mode === mode
            return (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={active}
                tabIndex={active ? 0 : -1}
                onClick={() => update({ mode })}
                onKeyDown={handleRadioKeydown}
                className={cn(
                  "flex cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 py-1.5 font-mono text-xs transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  active
                    ? "bg-secondary text-foreground"
                    : "text-ink-dim hover:text-foreground",
                )}
              >
                <Icon aria-hidden className="size-3.5" />
                {t(labelKey)}
              </button>
            )
          })}
        </div>
        {/* Hints are prose, so sans — mono stays on labels and state (the
            per-string rule in DESIGN.md, not per slot). */}
        <p className="text-xs text-ink-dim">{t(MODE_HINT[prefs.mode])}</p>
      </div>

      <div className="flex flex-col gap-3">
        <span className="text-sm text-ink-dim">{t("settings.theme")}</span>

        {split ? (
          // Wider than the gap inside a row, so each caption groups with the
          // tiles it names instead of floating between two sets.
          <div className="flex flex-col gap-4">
            <SlotRow
              slot="light"
              selected={prefs.lightTheme}
              live={shownMode !== "dark"}
              onSelect={(name) => update({ lightTheme: name })}
            />
            <SlotRow
              slot="dark"
              selected={prefs.darkTheme}
              live={shownMode !== "light"}
              onSelect={(name) => update({ darkTheme: name })}
            />
          </div>
        ) : (
          <div
            role="radiogroup"
            aria-label={t("settings.theme")}
            className={TILE_GRID}
          >
            {themeFamilies.map((family, i) => (
              <FamilyTile
                key={family.id}
                family={family}
                active={activeFamily?.id === family.id}
                tabIndex={
                  activeFamily
                    ? activeFamily.id === family.id
                      ? 0
                      : -1
                    : i === 0
                      ? 0
                      : -1
                }
                shownMode={shownMode}
                onSelect={(f) =>
                  update({ lightTheme: f.light, darkTheme: f.dark })
                }
              />
            ))}
          </div>
        )}

        {/* Sits below the grid in both shapes, where the old hint used to
            explain what it now simply does. */}
        <div className="flex items-center gap-2">
          <Checkbox
            id="theme-paired"
            checked={!split}
            onCheckedChange={(checked) => {
              if (checked) pair()
              else setSplit(true)
            }}
          />
          <Label
            htmlFor="theme-paired"
            className="cursor-pointer text-xs font-normal text-ink-dim"
          >
            {t("settings.themePaired")}
          </Label>
        </div>
      </div>
    </div>
  )
}
