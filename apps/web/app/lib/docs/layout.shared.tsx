import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared"
import { ArrowUpRight } from "lucide-react"

import { GithubMark } from "~/components/github-mark.tsx"
import { STEWARD_REPO_URL } from "~/lib/project.ts"

/**
 * Shared docs-layout options: the wordmark (theme-swapped like the app
 * chrome's) leading back to the docs index, and two links out — the board
 * and the source repo.
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
    // Both open in a new tab — the reader keeps the docs open beside them;
    // the arrow marks the hand-off out of the docs surface. Two peers in one
    // shape: this layout renders `links` down the sidebar, where fumadocs'
    // compact `type: "icon"` variant stretches to full width and reads as an
    // empty button, so the repo is a plain item like its neighbour. Drawn
    // with the app's own octocat rather than fumadocs' `githubUrl` shortcut,
    // which injects a second, differently-traced GitHub mark.
    links: [
      {
        text: "Open the app",
        url: "/",
        external: true,
        icon: <ArrowUpRight />,
      },
      {
        text: "Source on GitHub",
        url: STEWARD_REPO_URL,
        external: true,
        icon: <GithubMark className="size-4" />,
      },
    ],
  }
}
