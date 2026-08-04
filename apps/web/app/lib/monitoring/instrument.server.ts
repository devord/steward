import { consoleLoggingIntegration, init } from "@sentry/react-router"

import { beforeBreadcrumb, beforeSend, DENY_URLS } from "./before-send.ts"
import { deployTier, sentryDsn, sentryRelease } from "./config.server.ts"
import { getSampleRates } from "./sample-rates.ts"

/**
 * Server-side Sentry init, imported for its side effect as the **first line**
 * of `entry.server.tsx` (ADR-0059).
 *
 * The usual Node advice is `NODE_OPTIONS='--import ./instrument.mjs'` so the
 * SDK's loader hook can patch dependencies before they are imported. That
 * isn't available here — `react-router-serve` never runs on Vercel; the
 * function is assembled from the build output — so this takes Sentry's
 * serverless direct-import path instead. The caveat that path carries is
 * nearly empty for Steward: the loader hook only matters for
 * instrumentations that patch modules at import (DB drivers, ORMs, express),
 * and Steward has none. Its one outbound dependency is `fetch`, which
 * `SentryNodeFetchInstrumentation` hooks through `diagnostics_channel`, not
 * module loading — so the reads to api.github.com are traced regardless.
 *
 * With no DSN this is a no-op with no client: `init` returns early, every
 * `captureException` becomes a nothing, and the process behaves exactly as
 * it did before this file existed. That state is where most of this repo's
 * life is spent, so it is the one the file is written for.
 */
const dsn = sentryDsn()
const rates = getSampleRates(deployTier())

init({
  dsn,
  environment: deployTier(),
  release: sentryRelease(),

  // Fail-closed rates from the deploy-tier table. A tier nobody configured
  // collects nothing even when a DSN reaches it (`sample-rates.ts`).
  sampleRate: rates.sampleRate,
  tracesSampleRate: rates.traces,

  // Server `console.*` becomes a Sentry Log. This is what makes the degrade
  // seam visible (`dashboard.server.ts`) without turning a GitHub outage
  // into an inbox full of Issues, and it picks up the streamed-render
  // `console.error` in `entry.server.tsx` at no call-site cost.
  enableLogs: true,
  integrations: [consoleLoggingIntegration()],

  /**
   * What the SDK is allowed to collect on its own. Set explicitly because
   * `__steward_session` carries the viewer's GitHub token (ADR-0004): these
   * are library defaults, and a default that moves would move the gate.
   *
   * `dataCollection` supersedes the deprecated `sendDefaultPii`, and its
   * defaults are more generous than that flag's `false` was — `cookies` and
   * `httpHeaders` both default to collecting — so stating them is required,
   * not decorative.
   *
   * `userInfo: false` suppresses only the SDK's *auto-derived* user fields
   * (the client IP read off forwarding headers). The identity we set
   * ourselves in root middleware lands on the isolation scope and is merged
   * into the event independently, so the login survives and the IP never
   * appears.
   */
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

  // The second refusal, and the noise filter. Not redundant with the above:
  // the header deny-list filters span attributes, while an event's
  // `request.headers` is only trimmed of `cookie` — `beforeSend` is what
  // deletes `authorization` and strips the query string from the URL.
  beforeSend,
  beforeBreadcrumb,
  denyUrls: DENY_URLS,
})
