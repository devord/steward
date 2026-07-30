// The artifact kit's compiled stylesheet, injected into every frame
// (ADR-0050). Published artifacts inline their own copy so a raw-opened file
// still reads; appending the *current* one on top is what lets a design fix
// reach widgets that were published months ago, without rerunning a single
// routine. Same seam and same reasoning as the theme override (ADR-0009) and
// the mono face (ADR-0031).
//
// Kept out of theme.ts deliberately: that module also runs under plain Node
// for scripts/artifact-sheet.ts, which cannot resolve a Vite `?raw` import.
// The pattern mirrors artifact-font.ts — the Vite-only read lives here, and
// frameArtifactHtml takes the result as a parameter.
import kitCss from "../../../../.claude/skills/widget-artifact/kit/kit.css?raw"

import { artifactKitStyle } from "./theme.ts"

export const ARTIFACT_KIT_STYLE = artifactKitStyle(kitCss)
