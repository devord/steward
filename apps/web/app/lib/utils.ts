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
