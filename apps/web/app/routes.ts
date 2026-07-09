import { type RouteConfig, index, route } from "@react-router/dev/routes"

export default [
  index("routes/home.tsx"),
  route("settings", "routes/settings.tsx"),
  route("setup", "routes/setup.tsx"),
  route("sync", "routes/sync.ts"),
  route("auth/login", "routes/auth.login.ts"),
  route("auth/callback", "routes/auth.callback.ts"),
  route("auth/logout", "routes/auth.logout.ts"),
] satisfies RouteConfig
