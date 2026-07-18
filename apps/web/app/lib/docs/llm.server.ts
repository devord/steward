import { llms } from "fumadocs-core/source"

import { source } from "./source.ts"

type DocsPage = ReturnType<typeof source.getPages>[number]

/** The raw-markdown address of a docs page (`/docs` → `/docs/index.md`). */
export function pageMarkdownUrl(page: { url: string }): string {
  return page.url === "/docs" ? "/docs/index.md" : `${page.url}.md`
}

/** A page as agents consume it: title + description header, then the
    processed markdown fumadocs-mdx exports (`includeProcessedMarkdown`). */
export async function pageMarkdown(page: DocsPage): Promise<string> {
  const body = await page.data.getText("processed")
  const header = [`# ${page.data.title}`]
  if (page.data.description) header.push("", `> ${page.data.description}`)
  return `${header.join("\n")}\n\n${body.trim()}\n`
}

/** Resolve the page for a `*.md` splat (`guides/routines.md`, `index.md`). */
export function pageForMarkdownPath(splat: string): DocsPage | undefined {
  const parts = splat.replace(/\.md$/, "").split("/").filter(Boolean)
  if (parts.at(-1) === "index") parts.pop()
  return source.getPage(parts)
}

const formatter = llms(source)

/** /llms.txt — the tree index, with every link pointing at its .md form. */
export function llmsIndex(): string {
  let text = `# Steward\n\n> Reports that update themselves — a dashboard of living widgets, each regenerated on schedule by a Claude Code routine and published to a GitHub repo you own. Docs for developers using and integrating Steward.\n\n${formatter.index()}`
  for (const page of source.getPages()) {
    text = text.replaceAll(`(${page.url})`, `(${pageMarkdownUrl(page)})`)
  }
  return `${text}\n`
}

/** /llms-full.txt — every page's markdown, concatenated in tree order. */
export async function llmsFull(): Promise<string> {
  const pages = await Promise.all(source.getPages().map(pageMarkdown))
  return pages.map((text) => `${text}\n---\n`).join("\n")
}

export function markdownResponse(text: string): Response {
  return new Response(text, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  })
}
