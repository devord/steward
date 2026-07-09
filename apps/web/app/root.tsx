import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router"

import type { Route } from "./+types/root"
import "./app.css"

export const links: Route.LinksFunction = () => [
  // SVG first for modern browsers; .ico carries 16/32/48 fallbacks.
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
  { rel: "icon", href: "/favicon.ico", sizes: "16x16 32x32 48x48" },
  { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
]

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="dark" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}

export default function App() {
  return <Outlet />
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!"
  let details = "An unexpected error occurred."
  let stack: string | undefined

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error"
    details =
      error.status === 404
        ? "The requested page could not be found."
        : // Loaders throw data("<human message>", { status }) for expected
          // failures (e.g. GitHub outage) — surface that over statusText.
          (typeof error.data === "string" && error.data) ||
          error.statusText ||
          details
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message
    stack = error.stack
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="font-mono text-2xl font-bold text-red">{message}</h1>
      <p className="mt-4">{details}</p>
      {stack && (
        <pre className="mt-4 overflow-x-auto rounded-md border border-border-dim bg-bg1 p-4">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  )
}
