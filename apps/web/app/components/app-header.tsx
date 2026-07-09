import { cn } from "~/lib/utils"

/**
 * Shared page-header shell: one slim row under a hairline, identical
 * height, padding, and rhythm on every route. Wraps only as a last resort
 * on very narrow viewports; put `ml-auto` on the trailing cluster.
 */
export function AppHeader({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <header
      className={cn(
        "mb-5 flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 border-b py-1.5",
        className,
      )}
    >
      {children}
    </header>
  )
}
