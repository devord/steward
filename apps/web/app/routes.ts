import { type RouteConfig, index, route } from "@react-router/dev/routes"

export default [
  index("routes/home.tsx"),
  // Static `routines` is ranked ahead of the `:dashboard` slug below, so the
  // pool view (ADR-0025) reserves that one segment per repo.
  route("r/:owner/:repo/routines", "routes/r.$owner.$repo.routines.tsx"),
  // One routine's facts + run history (ADR-0033) — deeper than the
  // three-segment board shape, so it can never collide with `:dashboard`.
  route(
    "r/:owner/:repo/routines/:slug",
    "routes/r.$owner.$repo.routines.$slug.tsx",
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
