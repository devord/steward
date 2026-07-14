/**
 * Settings · appearance — the mode control plus the theme pickers
 * (ADR-0009; the interaction model follows Flow's appearance settings).
 *
 * Layout is family-first: a segmented mode control (auto / light / dark),
 * then the family tiles — each previews its light|dark halves and one
 * click fills both slots — and a "mix light & dark separately" disclosure
 * for pairing, say, Tokyo Night at night with Rosé Pine Dawn by day.
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
  type Theme,
  type ThemeFamily,
  themeFamilies,
  type ThemeName,
  themes,
  themesByMode,
} from "../lib/theme.ts"
import { useAppearance } from "../lib/use-appearance.ts"
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

/** A single-theme tile for the mix pickers. */
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

export function AppearanceSettings() {
  const t = useT()
  const [prefs, update] = useAppearance()
  // Open the mixer when the current pair isn't a family, so a custom mix
  // shows its selections instead of an unselected family row.
  const [mixOpen, setMixOpen] = useState(
    () => !familyForPair(prefs.lightTheme, prefs.darkTheme),
  )
  const [editSlot, setEditSlot] = useState<"light" | "dark">(
    prefs.mode === "light" ? "light" : "dark",
  )

  const activeFamily = familyForPair(prefs.lightTheme, prefs.darkTheme)
  const shownMode = prefs.mode === "system" ? null : prefs.mode

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
                onClick={() => {
                  update({ mode })
                  if (mode !== "system") setEditSlot(mode)
                }}
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
        <p className="font-mono text-xs text-ink-dim">
          {t(MODE_HINT[prefs.mode])}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm text-ink-dim">{t("settings.theme")}</span>
        <div
          role="radiogroup"
          aria-label={t("settings.theme")}
          className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2"
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
        <p className="font-mono text-xs text-ink-dim">
          {t("settings.themeHint")}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <button
          type="button"
          aria-expanded={mixOpen}
          onClick={() => setMixOpen((v) => !v)}
          className="inline-flex cursor-pointer items-center gap-1.5 self-start rounded-md font-mono text-xs text-ink-dim transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span
            aria-hidden
            className={cn(
              "inline-block transition-transform motion-reduce:transition-none",
              mixOpen && "rotate-90",
            )}
          >
            ›
          </span>
          {t("settings.mix")}
        </button>

        {mixOpen && (
          <div className="flex flex-col gap-3 border-t border-border-dim pt-3">
            <div
              role="radiogroup"
              aria-label={t("settings.mix")}
              className="flex gap-2"
            >
              {(["light", "dark"] as const).map((slot) => {
                const Icon = slot === "light" ? Sun : Moon
                const active = editSlot === slot
                const slotTheme =
                  slot === "light" ? prefs.lightTheme : prefs.darkTheme
                return (
                  <button
                    key={slot}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    tabIndex={active ? 0 : -1}
                    onClick={() => setEditSlot(slot)}
                    onKeyDown={handleRadioKeydown}
                    className={cn(
                      "flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      active ? "border-primary bg-bg1" : TILE_IDLE,
                    )}
                  >
                    <Icon
                      aria-hidden
                      className={cn(
                        "size-4 shrink-0",
                        active ? "text-primary" : "text-ink-faint",
                      )}
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="font-mono text-xs text-ink-dim">
                        {t(
                          slot === "light"
                            ? "settings.mixLight"
                            : "settings.mixDark",
                        )}
                      </span>
                      <span className="truncate text-xs text-foreground">
                        {themes[slotTheme].label}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
            {shownMode && editSlot !== shownMode && (
              <p className="font-mono text-xs text-ink-dim">
                {t("settings.notApplied")}
              </p>
            )}
            <div
              role="radiogroup"
              aria-label={t(
                editSlot === "light" ? "settings.mixLight" : "settings.mixDark",
              )}
              className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2"
            >
              {themesByMode(editSlot).map(([name]) => {
                const selected =
                  name ===
                  (editSlot === "light" ? prefs.lightTheme : prefs.darkTheme)
                return (
                  <ThemeTile
                    key={name}
                    name={name}
                    active={selected}
                    tabIndex={selected ? 0 : -1}
                    onSelect={(n) =>
                      update(
                        editSlot === "light"
                          ? { lightTheme: n }
                          : { darkTheme: n },
                      )
                    }
                  />
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
