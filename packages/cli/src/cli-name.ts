/**
 * The invocation to print in user-facing command hints. The published CLI
 * runs via npx with no global install assumed (ADR-0036) — only the launchd
 * path requires a global `steward` on PATH — so a pasteable hint must carry
 * the full npx form.
 */
export const CLI = "npx @devord/steward"
