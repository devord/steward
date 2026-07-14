/**
 * The mode control's shared vocabulary — one ordered list of the three
 * appearance modes with their icon and label key, so every mode switch in
 * the app (settings' segmented control, the landing toggle, the account
 * menu's quick row) renders the same icons in the same order under the
 * same names and none can drift.
 */
import { Monitor, Moon, Sun } from "lucide-react"

import type { AppearanceMode } from "./theme.ts"
import type { MessageKey } from "../locales/en.ts"

export const APPEARANCE_MODES = [
  { mode: "system", Icon: Monitor, labelKey: "settings.modeAuto" },
  { mode: "light", Icon: Sun, labelKey: "settings.modeLight" },
  { mode: "dark", Icon: Moon, labelKey: "settings.modeDark" },
] as const satisfies ReadonlyArray<{
  mode: AppearanceMode
  Icon: typeof Monitor
  labelKey: MessageKey
}>
