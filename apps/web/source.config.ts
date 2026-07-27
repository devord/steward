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
      //
      // The *medium* variants, matching the registry's move to
      // gruvbox-material medium: shiki's backgrounds (#282828 / #fbf1c7) are
      // then the registry's own `bg`, so a block sits flush with the page the
      // way the hard pair used to. Shiki ships no gruvbox-material, so the
      // syntax hues stay classic — close enough at code-block scale, and
      // nearer than any other bundled theme.
      themes: {
        light: "gruvbox-light-medium",
        dark: "gruvbox-dark-medium",
      },
    },
  },
})
