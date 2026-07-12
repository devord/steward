import { type RouteConfig, index, route } from "@react-router/dev/routes"

export default [
  index("routes/home.tsx"),
  route("d/:dashboard", "routes/d.$dashboard.tsx"),
  route("team", "routes/team.tsx"),
  route("team/:dashboard", "routes/team.$dashboard.tsx"),
  route("settings", "routes/settings.tsx"),
  route("setup", "routes/setup.tsx"),
  route("dev-dialog", "routes/dev-dialog.tsx"),
  route("sync", "routes/sync.ts"),
  route("repos", "routes/repos.ts"),
  route("run", "routes/run.ts"),
  route("dashboards", "routes/dashboards.ts"),
  route("auth/login", "routes/auth.login.ts"),
  route("auth/callback", "routes/auth.callback.ts"),
  route("auth/device", "routes/auth.device.tsx"),
  route("auth/logout", "routes/auth.logout.ts"),
] satisfies RouteConfig
