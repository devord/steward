import {
  Form,
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
import { AppHeader } from "./components/app-header.tsx"
import { Wordmark } from "./components/logo.tsx"
import { RouteProgress } from "./components/route-progress.tsx"
import { Button } from "~/components/ui/button"
import { Link } from "~/components/ui/link"
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
  // Light is the baseline; the SVG swaps to dark under prefers-color-scheme:
  // dark, while the raster fallbacks (.ico, apple-touch-icon) stay light —
  // they're static formats and home-screen icons can't theme-switch.
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
        <RouteProgress />
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
  // A dead-token 401 is the one error the user recovers from *here*, by
  // re-authing — so surface the sign-out as a primary action, not just the
  // header escape hatch.
  let sessionExpired = false

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : t("error.title")
    sessionExpired = error.status === 401
    details =
      error.status === 404
        ? t("error.notFound")
        : // Loaders throw data("<human message>", { status }) for expected
          // failures (e.g. GitHub outage, dead session) — surface that over
          // statusText.
          (typeof error.data === "string" && error.data) ||
          error.statusText ||
          details
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message
    stack = error.stack
  }

  // The error boundary replaces the whole app — including the board chrome that
  // renders sign-out. Without its own chrome, a config-load failure (a dead
  // token, an outage) would trap the user on a dead-end page with no way to
  // sign out and re-auth. So carry a minimal header with the escape hatch on
  // every error state (its sign-out form needs no loader data, so it can't be
  // taken down by the same failure).
  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6">
      <ErrorChrome />
      <main className="py-16">
        <h1 className="font-mono text-2xl font-bold text-destructive">
          {message}
        </h1>
        <p className="mt-4">{details}</p>
        {sessionExpired && (
          <Form method="post" action="/auth/logout" className="mt-6">
            <Button type="submit">{t("header.signOut")}</Button>
          </Form>
        )}
        {stack && (
          <pre className="mt-4 overflow-x-auto rounded-md border border-border-dim bg-bg1 p-4">
            <code>{stack}</code>
          </pre>
        )}
      </main>
    </div>
  )
}

/**
 * The header shell for the error boundary: the wordmark home link and an
 * always-available sign-out. Deliberately loader-data-free so it renders no
 * matter which loader failed — the guarantee that an error can never strand the
 * user without a way out.
 */
function ErrorChrome() {
  const t = useT()
  return (
    <AppHeader className="gap-x-2.5">
      <Link
        to="/"
        aria-label="Bulletin"
        className="-mx-1 inline-flex items-center rounded-md px-1 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Wordmark className="text-sm" />
      </Link>
      <Form method="post" action="/auth/logout" className="ml-auto">
        <Button
          size="sm"
          variant="ghost"
          type="submit"
          className="text-ink-dim hover:text-foreground"
        >
          {t("header.signOut")}
        </Button>
      </Form>
    </AppHeader>
  )
}
