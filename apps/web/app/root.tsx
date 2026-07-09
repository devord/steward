import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
} from "react-router"

import type { Route } from "./+types/root"
import "./app.css"
import { DEFAULT_LOCALE, I18nProvider, useT } from "./lib/i18n.tsx"
import { getLocale } from "./lib/locale.server.ts"
import {
  DEFAULT_THEME,
  THEME_INIT_SCRIPT,
  themeStylesheet,
} from "./lib/theme.ts"

export function loader({ request }: Route.LoaderArgs) {
  return { locale: getLocale(request) }
}

// Both are pure functions of the registry — compute once per server start.
const THEME_STYLESHEET = themeStylesheet()

export const links: Route.LinksFunction = () => [
  // SVG first for modern browsers; .ico carries 16/32/48 fallbacks.
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
  { rel: "icon", href: "/favicon.ico", sizes: "16x16 32x32 48x48" },
  { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
]

export function Layout({ children }: { children: React.ReactNode }) {
  // Available on every normal render; absent only when the root loader
  // itself failed, where the English default is the honest fallback.
  const data = useRouteLoaderData<typeof loader>("root")
  const locale = data?.locale ?? DEFAULT_LOCALE

  return (
    // SSR assumes the canonical default; THEME_INIT_SCRIPT re-stamps both
    // attributes from the stored preference before first paint, hence
    // suppressHydrationWarning (ADR-0009).
    <html
      lang={locale}
      className="dark"
      data-theme={DEFAULT_THEME}
      suppressHydrationWarning
    >
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <Meta />
        <Links />
        {/* Palette blocks for every theme (single source: lib/theme.ts). */}
        <style dangerouslySetInnerHTML={{ __html: THEME_STYLESHEET }} />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <I18nProvider locale={locale}>{children}</I18nProvider>
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
  const t = useT()
  let message = t("error.title")
  let details = t("error.generic")
  let stack: string | undefined

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : t("error.title")
    details =
      error.status === 404
        ? t("error.notFound")
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
    <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <h1 className="font-mono text-2xl font-bold text-destructive">
        {message}
      </h1>
      <p className="mt-4">{details}</p>
      {stack && (
        <pre className="mt-4 overflow-x-auto rounded-md border border-border-dim bg-bg1 p-4">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  )
}
