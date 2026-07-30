/**
 * The artifact's tone vocabulary — what a value *means*, not what colour it is.
 *
 * One source, because the alternative is what this replaced: the same
 * five-member union written out in four places and its class map in three, so
 * adding a tone meant finding all of them and a mismatch was invisible until
 * something rendered unstyled.
 *
 * Tones name palette roles rather than colours so the board's theme override
 * re-points them per viewer (ADR-0009). `neutral` is deliberately `ink-dim`
 * and not `ink-faint`: there is no third text tier — `ink-faint` is a glyph
 * role, below AA on all but one theme in the registry — and de-emphasis in
 * text is spent on size and weight instead (DESIGN.md).
 */
export const TONES = ["neutral", "attn", "warn", "bad", "good", "info"] as const

export type Tone = (typeof TONES)[number]

/** Tone → text colour. Shared by the stat tier and queue value columns. */
export const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-ink-dim",
  attn: "text-orange",
  warn: "text-yellow",
  bad: "text-red",
  good: "text-green",
  info: "text-blue",
}
