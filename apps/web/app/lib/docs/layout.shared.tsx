import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared"
import { ArrowUpRight } from "lucide-react"

/**
 * Shared docs-layout options: the wordmark (theme-swapped like the app
 * chrome's) leading back to the docs index, and one link out to the board.
 */
export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <>
          <img
            src="/wordmark-light.svg"
            alt="Steward"
            className="h-[22px] w-auto dark:hidden"
          />
          <img
            src="/wordmark-dark.svg"
            alt="Steward"
            className="hidden h-[22px] w-auto dark:block"
          />
          <span className="mt-px font-mono text-[13px] font-normal text-fd-muted-foreground">
            docs
          </span>
        </>
      ),
      url: "/docs",
    },
    // Opens the board in a new tab — the reader keeps the docs open beside
    // it; the arrow marks the hand-off out of the docs surface.
    links: [
      {
        text: "Open the app",
        url: "/",
        external: true,
        icon: <ArrowUpRight />,
      },
    ],
  }
}
