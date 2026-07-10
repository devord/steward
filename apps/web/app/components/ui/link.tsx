import { Link as RouterLink, type LinkProps } from "react-router"

// Wraps React Router's Link so every in-app navigation defaults to
// `prefetch="intent"` — the route module + loader data are fetched on hover
// or focus, making the click feel instant. Pass an explicit `prefetch` to
// override (e.g. "viewport", "render", or "none").
function Link({ prefetch = "intent", ...props }: LinkProps) {
  return <RouterLink prefetch={prefetch} {...props} />
}

export { Link }
