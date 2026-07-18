import { createFromSource } from "fumadocs-core/search/server"

import type { Route } from "./+types/docs-search"
import { source } from "~/lib/docs/source.ts"

/** Docs search: Fumadocs' built-in Orama index, served in-process. */
const server = createFromSource(source, { language: "english" })

export function loader({ request }: Route.LoaderArgs) {
  return server.GET(request)
}
