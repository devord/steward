import {
  createSentryClientInstrumentation,
  init,
  reactRouterTracingIntegration,
  replayIntegration,
} from "@sentry/react-router"
import type { ClientInstrumentation } from "react-router"

import { beforeBreadcrumb, beforeSend, DENY_URLS } from "./before-send.ts"
import { getSampleRates } from "./sample-rates.ts"

/**
 * Re-exported so `entry.client.tsx` can reach it without a static import of
 * the SDK — see the note there about why one would defeat the whole gate.
 */
export { sentryOnError } from "@sentry/react-router"

/**
 * Browser-side Sentry init (ADR-0059).
 *
 * Reached only through a dynamic `import()` in `entry.client.tsx`, gated on
 * the `sentry-dsn` meta tag the server writes from its own environment. With
 * no DSN this module is never fetched, so an inert environment pays nothing —
 * not the init, not the ~40KB of SDK.
 *
 * Returns the instrumentation `<HydratedRouter>` needs to name navigation
 * spans after route patterns rather than URLs; the caller passes it straight
 * through.
 */
export function initBrowserMonitoring(
  dsn: string,
  environment?: string,
  release?: string,
): ClientInstrumentation {
  // The tier is the Sentry `environment` tag and the sample-rate key, same
  // as on the server (`config.server.ts`) — one value, so the two sides
  // cannot disagree about how much they collect.
  const rates = getSampleRates(environment)

  init({
    dsn,
    environment,
    release,

    sampleRate: rates.sampleRate,
    tracesSampleRate: rates.traces,
    replaysSessionSampleRate: rates.replaySessions,
    replaysOnErrorSampleRate: rates.replayErrors,

    integrations: [
      reactRouterTracingIntegration(),
      /**
       * Replay records the chrome and only the chrome.
       *
       * Widget tiles are `srcdoc` iframes with an opaque origin (ADR-0002 /
       * ADR-0028), and Replay blocks `iframe[srcdoc]` by default because its
       * masking cannot run inside one — so every widget replays as a grey
       * box, and `maskAllText` hides repo and routine names besides. The
       * `unblock: ['iframe[srcdoc]']` escape hatch exists and is
       * deliberately not taken: it would record private repo contents
       * unmasked, which is a worse trade than the grey box. What replay is
       * here for is the grid drag, the dialogs and the rail.
       *
       * Mounted only when a replay rate is non-zero, so an OFF tier never
       * loads the recorder's worker at all.
       */
      ...(rates.replaySessions > 0 || rates.replayErrors > 0
        ? [replayIntegration()]
        : []),
    ],

    // Mirror the server's collection refusals (`instrument.server.ts`). The
    // session cookie is httpOnly and out of the browser's reach anyway, but
    // symmetry is what keeps the two seams reviewable as one decision.
    dataCollection: {
      userInfo: false,
      cookies: false,
      urlQueryParams: false,
      httpHeaders: {
        request: { deny: ["cookie", "authorization"] },
        response: { deny: ["set-cookie"] },
      },
      httpBodies: [],
    },

    beforeSend,
    beforeBreadcrumb,
    denyUrls: DENY_URLS,
  })

  // `captureErrors: false`: `sentryOnError` on `<HydratedRouter>` already
  // files every render, navigation and loader throw, so leaving this on
  // would file each one twice.
  return createSentryClientInstrumentation({ captureErrors: false })
}
