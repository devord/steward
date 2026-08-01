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
// The `columns` band's behaviour, built beside kit.css and travelling the same
// way. Unlike the stylesheet it is injected only into artifacts that carry the
// band: a design fix has to reach every kit artifact, a chart runtime has
// nothing to say to one with no chart.
import columnsJs from "../../../../.claude/skills/widget-artifact/kit/columns.js?raw"

import { artifactColumnsScript, artifactKitStyle } from "./theme.ts"

export const ARTIFACT_KIT_STYLE = artifactKitStyle(kitCss)
export const ARTIFACT_COLUMNS_SCRIPT = artifactColumnsScript(columnsJs)
