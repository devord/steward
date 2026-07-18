import { llmsFull, markdownResponse } from "~/lib/docs/llm.server.ts"

/** /llms-full.txt — the whole docs site as one markdown document. */
export async function loader() {
  return markdownResponse(await llmsFull())
}
