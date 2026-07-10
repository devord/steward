import { setupServer } from "msw/node"
import { afterAll, afterEach, beforeAll } from "vitest"

import { __resetGitHubCache } from "../lib/github.server.ts"
import { githubHandlers, resetGitHub } from "./github.ts"

// env.server.ts parses lazily on first use — these must exist before any
// server module under test calls env(). Assigned unconditionally: vitest
// loads the developer's .env, and tests must stay hermetic (seeded mocks
// key off these exact repo names).
process.env.GITHUB_CLIENT_ID = "test-client-id"
process.env.GITHUB_CLIENT_SECRET = "test-client-secret"
process.env.SESSION_SECRET = "0".repeat(64)
process.env.BULLETIN_SHARED_REPO = "form-factory/bulletin"
process.env.BULLETIN_DATA_REPO_TEMPLATE = "form-factory/bulletin-template"

export const server = setupServer(...githubHandlers)

beforeAll(() =>
  // A request no handler covers is a missing mock, not a real call.
  server.listen({ onUnhandledRequest: "error" }),
)
afterEach(() => {
  server.resetHandlers()
  resetGitHub()
  __resetGitHubCache()
})
afterAll(() => server.close())
