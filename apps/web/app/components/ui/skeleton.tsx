import * as React from "react"

import { cn } from "~/lib/utils"

/**
 * A quiet loading placeholder: a bg3 block that breathes via `animate-pulse`.
 * Chrome, not content — it recedes (DESIGN.md), so it sits a step above the
 * card surface without drawing the eye. `motion-safe:` keeps it static under
 * prefers-reduced-motion.
 */
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("rounded bg-bg3 motion-safe:animate-pulse", className)}
      {...props}
    />
  )
}
