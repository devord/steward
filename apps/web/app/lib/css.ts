import type { CSSProperties } from "react"

/**
 * Build a style object that mixes CSS custom properties (--col, --row-h, …)
 * with regular properties, without a type assertion: the intersection lets
 * the literal typecheck, and it narrows back to CSSProperties on return.
 */
export function cssVars(
  style: CSSProperties & Record<`--${string}`, string | number>,
): CSSProperties {
  return style
}
