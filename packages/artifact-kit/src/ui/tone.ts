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
export const TONE_TEXT = {
  neutral: "text-ink-dim",
  attn: "text-orange",
  warn: "text-yellow",
  bad: "text-red",
  good: "text-green",
  info: "text-blue",
} satisfies Record<Tone, string>

/**
 * Tone → fill colour, for a mark rather than text.
 *
 * Written out rather than derived from {@link TONE_TEXT}, because Tailwind
 * scans source for *complete* class strings: a `.replace("text-", "bg-")`
 * produces a class that exists in the markup and in no stylesheet, so the mark
 * renders with no colour at all and nothing reports it. Same reason
 * `COLUMN_TIER` spells out its variants.
 *
 * `neutral` is full ink here, not `ink-dim` — a mark is a glyph, and the text
 * ramp's dimmest step disappears against a filled track.
 */
export const TONE_FILL = {
  neutral: "bg-ink",
  attn: "bg-orange",
  warn: "bg-yellow",
  bad: "bg-red",
  good: "bg-green",
  info: "bg-blue",
} satisfies Record<Tone, string>
