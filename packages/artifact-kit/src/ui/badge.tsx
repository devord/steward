import { cva, type VariantProps } from "class-variance-authority"
import type { ReactNode } from "react"

import { cn } from "./cn.ts"

/**
 * shadcn's Badge, retoned onto the artifact palette. Adopted rather than
 * ported: the upstream component is pure CVA + classes with no Radix import,
 * so it renders statically with nothing to strip.
 *
 * What changed is only the variant set. shadcn ships product-UI semantics
 * (primary / secondary / destructive) against tokens the artifact palette does
 * not have; the artifact's vocabulary is **tone** — what a row's state means —
 * so the variants are the named palette roles instead, at the tone/10 fill and
 * tone/40 border the chrome's own pills use, which is what keeps a widget and
 * the card around it reading as one system.
 */
const badge = cva(
  "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-xs leading-none whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "border-border-dim bg-bg2 text-ink-dim",
        attn: "border-orange/40 bg-orange/10 text-orange",
        warn: "border-yellow/40 bg-yellow/10 text-yellow",
        good: "border-green/40 bg-green/10 text-green",
        info: "border-blue/40 bg-blue/10 text-blue",
        bad: "border-red/40 bg-red/10 text-red",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
)

export type BadgeTone = NonNullable<VariantProps<typeof badge>["tone"]>

export function Badge({
  tone,
  className,
  children,
}: VariantProps<typeof badge> & { className?: string; children: ReactNode }) {
  return <span className={cn(badge({ tone }), className)}>{children}</span>
}
