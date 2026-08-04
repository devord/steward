import { getIsolationScope, withIsolationScope } from "@sentry/react-router"
import type { Scope } from "@sentry/react-router"
import type { MiddlewareFunction } from "react-router"

import { resolveHomeRepo } from "../repos.server.ts"
import { getAuth } from "../session.server.ts"
import { stewardTags } from "./scope.ts"

/**
 * Root middleware: name the viewer, and name the place (ADR-0059).
 *
 * Everyone past the landing page is signed in, so an anonymous crash report
 * would be a self-inflicted wound — and *where* answers more here than
 * *who*, since a Steward failure is nearly always one repo's config or one
 * routine's artifact. Deriving both here rather than at seventeen call sites
 * costs one extra cookie decrypt per request (routes still call `getAuth`
 * themselves) and keeps the resource routes — `/sync`, `/run`,
 * `/dashboards` — named too, which a loader-level hook would have missed.
 *
 * Middleware wraps the whole document render: React Router runs the data
 * query, the SSR render and `handleError` inside `next()`, so a loader
 * throw, a render throw and a caught route error all land inside this scope.
 * What falls outside it is the deferred stream (ADR-0002) — those promises
 * resolve after the shell response is handed back, so a failure there
 * arrives as the `console.error` in `entry.server.tsx`, which is a Log.
 */
export const stewardScope: MiddlewareFunction<Response> = ({ request }, next) =>
  onRequestScope(async (scope) => {
    // Cookie decrypt only — no network, no GitHub call.
    const auth = await getAuth(request)

    scope.setUser(
      auth
        ? {
            // The login is the stable identity: `name` is optional on
            // SessionData (absent on sessions predating it), so it decorates
            // and never identifies. No email, and no IP —
            // `dataCollection.userInfo: false` refuses that separately.
            id: auth.login,
            username: auth.login,
            ...(auth.name ? { name: auth.name } : {}),
          }
        : null,
    )

    const homeRepo = auth
      ? resolveHomeRepo(auth.login, auth.dataRepo)
      : undefined
    // Only tags that mean something: a key present but empty on most events
    // is noise in every facet that lists it.
    for (const [key, value] of Object.entries(
      stewardTags(new URL(request.url).pathname, homeRepo),
    )) {
      if (value) scope.setTag(key, value)
    }

    return next()
  })

/**
 * Run `write` against the isolation scope this request's events will be read
 * from — without ever writing an identity somewhere it could outlive the
 * request.
 *
 * Sentry's HTTP instrumentation already clones an isolation scope per
 * incoming request, and the request's transaction is bound to *that* scope
 * at the moment the span opens — before any middleware runs. So forking here
 * would tag the errors and leave every transaction anonymous, which is how
 * this was first written and what a local envelope capture showed.
 *
 * Writing in place is only safe while that per-request clone exists, so the
 * case where it doesn't — the process-wide default scope, because the SDK is
 * inert or its server instrumentation never ran — forks instead. Getting
 * that wrong would not leave events unattributed; it would attribute them to
 * whoever loaded a page last, and a leaked identity is worse than a missing
 * one.
 *
 * The test is the request data the HTTP instrumentation stamps onto the
 * clone it makes, which is the very property being relied on rather than a
 * proxy for it: if this scope already knows which request it belongs to, it
 * cannot outlive it.
 */
function onRequestScope<T>(write: (scope: Scope) => Promise<T>): Promise<T> {
  const ambient = getIsolationScope()
  const belongsToThisRequest = Boolean(
    ambient.getScopeData().sdkProcessingMetadata.normalizedRequest,
  )
  return belongsToThisRequest ? write(ambient) : withIsolationScope(write)
}
