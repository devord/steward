import { type RouteConfig, index, route } from "@react-router/dev/routes"

export default [
  index("routes/home.tsx"),
  // Developer docs (Fumadocs): one splat route renders every page under
  // /docs from the content/docs MDX collection; the search route serves
  // its built-in Orama index at the client's default endpoint.
  route("docs/*", "routes/docs.tsx"),
  route("api/search", "routes/docs-search.ts"),
  // Agent surfaces (llmstxt.org): the docs index and full text as plain
  // markdown; per-page `.md` variants are served by docs.tsx's middleware.
  route("llms.txt", "routes/llms-txt.ts"),
  route("llms-full.txt", "routes/llms-full-txt.ts"),
  // Static `routines` is ranked ahead of the `:dashboard` slug below, so the
  // pool view (ADR-0025) reserves that one segment per repo.
  route("r/:owner/:repo/routines", "routes/r.$owner.$repo.routines.tsx"),
  // One routine's facts + run history (ADR-0033) — deeper than the
  // three-segment board shape, so it can never collide with `:dashboard`.
  route(
    "r/:owner/:repo/routines/:slug",
    "routes/r.$owner.$repo.routines.$slug.tsx",
  ),
  // One run's published artifact, fetched on demand for version browsing +
  // compare (ADR-0038): the body of `w/:slug/index.html` at a given commit.
  route(
    "r/:owner/:repo/routines/:slug/at/:sha",
    "routes/r.$owner.$repo.routines.$slug.at.$sha.ts",
  ),
  route("r/:owner/:repo/:dashboard", "routes/r.$owner.$repo.$dashboard.tsx"),
  // Legacy URL shapes, pre-ADR-0023 — permanent redirects to the canonical
  // `/r/:owner/:repo/:dashboard` space.
  route("d/:dashboard", "routes/d.$dashboard.tsx"),
  route("team", "routes/team.tsx"),
  route("team/:dashboard", "routes/team.$dashboard.tsx"),
  route("settings", "routes/settings.tsx"),
  route("setup", "routes/setup.tsx"),
  route("dev-dialog", "routes/dev-dialog.tsx"),
  route("sync", "routes/sync.ts"),
  route("repos", "routes/repos.ts"),
  route("data-repos", "routes/data-repos.ts"),
  route("run", "routes/run.ts"),
  route("dashboards", "routes/dashboards.ts"),
  route("auth/login", "routes/auth.login.ts"),
  route("auth/callback", "routes/auth.callback.ts"),
  route("auth/device", "routes/auth.device.tsx"),
  route("auth/logout", "routes/auth.logout.ts"),
] satisfies RouteConfig
