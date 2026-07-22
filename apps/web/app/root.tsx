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
import { ErrorScreen } from "./components/error-screen.tsx"
import { RouteProgress } from "./components/route-progress.tsx"
import { DEFAULT_LOCALE, I18nProvider, useT } from "./lib/i18n.tsx"
import { getLocale } from "./lib/locale.server.ts"
import {
  DEFAULT_DARK_THEME,
  THEME_INIT_SCRIPT,
  themeStylesheet,
} from "./lib/theme.ts"

export function loader({ request }: Route.LoaderArgs) {
  return { locale: getLocale(request) }
}

// Both are pure functions of the registry — compute once per server start.
const THEME_STYLESHEET = themeStylesheet()

export const links: Route.LinksFunction = () => [
  // Every icon surface wears the product-icon chip (Fold + Chip,
  // DESIGN.md § Mark) — the bare glyph floated on arbitrary tab colours.
  // favicon.svg swaps the chip's tile + inks with prefers-color-scheme;
  // the .ico fallback (16/32/48) bakes the dark identity chip, since .ico
  // can't media-query. apple-touch + manifest icons bake the same dark
  // chip, opaque so they hold their own on unknown wallpapers; the
  // manifest gives Android a real maskable adaptive icon (full-bleed dark,
  // bow inside the safe zone) instead of masking apple-touch.
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
  { rel: "icon", href: "/favicon.ico", sizes: "16x16 32x32 48x48" },
  { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
  { rel: "manifest", href: "/manifest.webmanifest" },
]

export function Layout({ children }: { children: React.ReactNode }) {
  // Available on every normal render; absent only when the root loader
  // itself failed, where the English default is the honest fallback.
  const data = useRouteLoaderData<typeof loader>("root")
  const locale = data?.locale ?? DEFAULT_LOCALE

  return (
    // SSR stamps the fresh-install dark default, so the no-JS fallback and
    // the pre-hydration frame match what a new viewer resolves to
    // (ADR-0046 amendment — the gruvbox canonical anchor stays on `:root`
    // for the artifact contract; only the stamped attribute moved).
    // THEME_INIT_SCRIPT re-stamps both attributes from the stored
    // preference before first paint, hence suppressHydrationWarning
    // (ADR-0009).
    <html
      lang={locale}
      className="dark"
      data-theme={DEFAULT_DARK_THEME}
      suppressHydrationWarning
    >
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        {/* Match the SSR-stamped fresh-install default (flexoki dark) so
            mobile browser chrome reads as part of the dark board, like the
            identity tile. */}
        <meta name="theme-color" content="#100f0f" />
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
  // sign out and re-auth. ErrorScreen carries a minimal header with the escape
  // hatch on every error state (its sign-out form needs no loader data, so it
  // can't be taken down by the same failure).
  return (
    <ErrorScreen
      title={message}
      details={details}
      sessionExpired={sessionExpired}
      stack={stack}
    />
  )
}
