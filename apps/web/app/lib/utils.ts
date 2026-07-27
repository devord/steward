import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * The chrome's one caption tier (ADR-0048, DESIGN.md § Typography): the
 * tracked UPPERCASE landmark that heads a group of things — a repo group and
 * its sections in the rail, a category band on the board.
 *
 * It is a single tier on purpose. The rail sat at 11px and the board at 13px,
 * a gap too small to read as hierarchy and large enough to read as drift, so
 * both resolve here. A band heading spans the whole board and the rail's
 * spans 200px, but the band earns its prominence from its chevron, its count
 * and the air above it — not from being two pixels bigger.
 *
 * `text-2xs` is the floor for chrome text and is reserved for this tier:
 * legibility comes from the tracking, the caps and the weight, and nothing
 * that carries data is allowed down here. `ink-dim`, never `ink-faint` — the
 * reader steers by these, so they clear AA on every palette.
 */
export const railCaptionCls =
  "font-mono text-2xs font-semibold tracking-wider text-ink-dim uppercase"

/**
 * The board's band heading (ADR-0049) — the tracked UPPERCASE landmark of
 * {@link railCaptionCls}, promoted out of the caption tier to body size.
 *
 * A band heading is not a caption, and the difference is what it heads. The
 * rail's captions head 14px nav rows inside a 200px column, so 11px reads as
 * a deliberate label above them. A band heads widget cards whose own titles
 * are 16px semibold across the whole board — at 11px the heading ranked
 * *below* its children, which is the inversion the caption idiom exists to
 * avoid. It is also the control that folds the band, and DESIGN.md already
 * rules that nav and other primary controls take body size, never the
 * metadata floor.
 *
 * This is not ADR-0048's rejected 11-vs-13px board caption, which was the same
 * tier two pixels bigger — drift, not hierarchy. 14px with the caps, the
 * tracking and full `foreground` ink is a different tier: it clears the 16px
 * widget titles by voice (caps and a full-bleed rule) while sitting under them
 * in cap height, so the band reads as the landmark and the widgets stay the
 * bright content. The caption tier itself is unchanged and still one token.
 */
export const bandHeadingCls =
  "font-mono text-sm font-semibold tracking-wider text-foreground uppercase"
