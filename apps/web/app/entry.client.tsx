import { startTransition, StrictMode } from "react"
import { hydrateRoot } from "react-dom/client"
import type { ClientInstrumentation, ClientOnErrorFunction } from "react-router"
import { HydratedRouter } from "react-router/dom"

/**
 * Hydration, and the browser half of the off switch (ADR-0059).
 *
 * The DSN arrives as a `<meta>` tag the server writes from its own
 * environment (`root.tsx`), never baked into the bundle: one build serves
 * every tier, and rotating a DSN needs no rebuild. Absent — local dev, PR
 * previews, any tier nobody configured — this file hydrates exactly as the
 * stock template does and the SDK is never fetched.
 *
 * Which is why nothing here imports `@sentry/react-router` statically, not
 * even `sentryOnError`: one static import would pull the whole browser SDK
 * into the initial bundle and the gate would be decorative. Everything
 * Sentry comes back through the dynamic import.
 */
function meta(name: string): string | undefined {
  return (
    document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ||
    undefined
  )
}

function hydrate(
  instrumentations?: ClientInstrumentation[],
  onError?: ClientOnErrorFunction,
) {
  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        {/* `onError` catches render and navigation throws once each, off the
            re-render path; `instrumentations` is what names navigation spans
            after route patterns rather than raw URLs. */}
        <HydratedRouter onError={onError} instrumentations={instrumentations} />
      </StrictMode>,
    )
  })
}

const dsn = meta("sentry-dsn")

if (dsn) {
  // Init must finish before hydration: `<HydratedRouter>` reads the
  // instrumentation once, at mount.
  void import("./lib/monitoring/monitoring.client.ts").then(
    ({ initBrowserMonitoring, sentryOnError }) => {
      const instrumentation = initBrowserMonitoring(
        dsn,
        meta("sentry-environment"),
        meta("sentry-release"),
      )
      hydrate([instrumentation], sentryOnError)
    },
  )
} else {
  hydrate()
}
