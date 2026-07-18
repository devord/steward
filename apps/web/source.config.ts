import { defineConfig, defineDocs } from "fumadocs-mdx/config"

/**
 * The docs site's content collection (steward.devord.com/docs): MDX pages
 * under content/docs, compiled by the fumadocs-mdx Vite plugin into the
 * generated `.source` folder (aliased as `collections/*`).
 */
export const docs = defineDocs({
  dir: "content/docs",
  docs: {
    // Ship each page's processed markdown (`_markdown`) in the compiled
    // output — the source for the agent surfaces: per-page `.md` variants,
    // /llms.txt, /llms-full.txt, and the copy-for-agents button.
    postprocess: { includeProcessedMarkdown: true },
  },
})

export default defineConfig({
  mdxOptions: {
    rehypeCodeOptions: {
      // Code blocks speak the canonical palette pair (ADR-0009's rule for
      // authored surfaces: gruvbox at rest), switched by the app's `.dark`
      // class — not shiki's stock github themes, which clash with every
      // Steward palette.
      themes: {
        light: "gruvbox-light-hard",
        dark: "gruvbox-dark-hard",
      },
    },
  },
})
