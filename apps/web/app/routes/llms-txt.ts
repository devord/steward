import { llmsIndex, markdownResponse } from "~/lib/docs/llm.server.ts"

/** /llms.txt — the agent-facing docs index (llmstxt.org convention). */
export function loader() {
  return markdownResponse(llmsIndex())
}
