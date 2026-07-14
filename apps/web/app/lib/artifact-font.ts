import { artifactFontStyle } from "./theme.ts"

// The chrome mono, inlined for the sandboxed artifact iframes (ADR-0031): a
// frame has an opaque origin, so a URL-based @font-face would be blocked as a
// cross-origin fetch — the data URI ships the face with the document. Latin
// subset only (~30 kB base64, in-memory per frame, never published). Shared by
// every surface that frames an artifact into an iframe (the board's widget
// cards and the picker's template preview) so the face is inlined once.
import geistMonoWoff2 from "@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2?inline"

export const ARTIFACT_FONT_STYLE = artifactFontStyle(geistMonoWoff2)
