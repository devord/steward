import browserCollections from "collections/browser"
import { useFumadocsLoader } from "fumadocs-core/source/client"
import { DocsLayout } from "fumadocs-ui/layouts/docs"
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "fumadocs-ui/layouts/docs/page"
import { RootProvider } from "fumadocs-ui/provider/react-router"

import type { Route } from "./+types/docs"
import { CopyPageButton } from "~/lib/docs/copy-page.tsx"
import { baseOptions } from "~/lib/docs/layout.shared.tsx"
import {
  markdownResponse,
  pageForMarkdownPath,
  pageMarkdown,
  pageMarkdownUrl,
} from "~/lib/docs/llm.server.ts"
import { getMDXComponents } from "~/lib/docs/mdx-components.tsx"
import { source } from "~/lib/docs/source.ts"

/** `*.md` requests get the page's raw markdown — the agent-facing variant
    of every docs URL — before the HTML pipeline is ever involved. */
export const middleware: Route.MiddlewareFunction[] = [
  async ({ params }, next) => {
    const splat = params["*"]
    if (!splat.endsWith(".md")) return next()
    const page = pageForMarkdownPath(splat)
    if (!page) throw new Response("Not found", { status: 404 })
    return markdownResponse(await pageMarkdown(page))
  },
]

export async function loader({ params }: Route.LoaderArgs) {
  const slugs = params["*"].split("/").filter((part) => part.length > 0)
  const page = source.getPage(slugs)
  if (!page) throw new Response("Not found", { status: 404 })

  return {
    path: page.path,
    url: page.url,
    mdUrl: pageMarkdownUrl(page),
    pageTree: await source.serializePageTree(source.getPageTree()),
  }
}

const clientLoader = browserCollections.docs.createClientLoader({
  component({ toc, frontmatter, default: Mdx }, props?: { mdUrl: string }) {
    return (
      <DocsPage toc={toc}>
        <title>{`${frontmatter.title} — Steward docs`}</title>
        <meta name="description" content={frontmatter.description} />
        {props != null && (
          <link rel="alternate" type="text/markdown" href={props.mdUrl} />
        )}
        <DocsTitle>{frontmatter.title}</DocsTitle>
        <DocsDescription>{frontmatter.description}</DocsDescription>
        {props != null && <CopyPageButton mdUrl={props.mdUrl} />}
        <DocsBody>
          <Mdx components={getMDXComponents()} />
        </DocsBody>
      </DocsPage>
    )
  },
})

export default function Docs({ loaderData }: Route.ComponentProps) {
  const { path, pageTree } = useFumadocsLoader(loaderData)
  const { mdUrl } = loaderData

  return (
    // Theme handling stays the app's own (ADR-0009): the root layout's
    // init script stamps `.dark` + `data-theme`, and the docs' fd tokens
    // alias the runtime palette in app.css — so the provider's next-themes
    // half is disabled rather than fighting it.
    <RootProvider theme={{ enabled: false }}>
      {/* No theme switch: appearance is set on /settings (ADR-0009) and the
          docs follow it — a second toggle here would fight the app's. */}
      <DocsLayout
        {...baseOptions()}
        themeSwitch={{ enabled: false }}
        tree={pageTree}
      >
        {clientLoader.useContent(path, { mdUrl })}
      </DocsLayout>
    </RootProvider>
  )
}
