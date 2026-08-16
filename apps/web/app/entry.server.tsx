// Must be the first import in the file: it calls Sentry.init (ADR-0059).
// `react-router-serve` never runs on Vercel, so the usual
// `NODE_OPTIONS='--import …'` loader hook isn't available and this is
// Sentry's serverless direct-import path instead — see instrument.server.ts
// for why that costs almost nothing here.
import "./lib/monitoring/instrument.server.ts"

import { PassThrough } from "node:stream"

import { createReadableStreamFromReadable } from "@react-router/node"
import {
  createSentryHandleError,
  createSentryServerInstrumentation,
  getMetaTagTransformer,
  wrapSentryHandleRequest,
} from "@sentry/react-router"
import { isbot } from "isbot"
import type { RenderToPipeableStreamOptions } from "react-dom/server"
import { renderToPipeableStream } from "react-dom/server"
import type { EntryContext, RouterContextProvider } from "react-router"
import { ServerRouter } from "react-router"

/**
 * How long streamed loader promises may stay pending before the server aborts
 * them. This is the whole reason this file exists: without an entry.server,
 * react-router's defaults cap streaming at ~5s (4950ms for `.data`
 * revalidations), and the board's deferred artifacts (ADR-0002) routinely
 * outlive that on a cold instance — GitHub contents + commits reads per
 * widget, each allowed 15s with retries. Every poll revalidation
 * (use-poll-revalidate) that crossed the cap rejected the streamed promise
 * client-side and crashed the board into the generic error page. The rest of
 * the file is the stock node template.
 */
export const streamTimeout = 30_000

/**
 * Loader, action, and render throws become Issues (ADR-0059).
 *
 * `logErrors: false` because `consoleLoggingIntegration` is on: logging what
 * has just been filed as an Issue would file the same failure twice, once in
 * each stream. Thrown `Response`s never reach here — React Router treats them
 * as control flow — which is why the degrade path logs for itself
 * (`dashboard.server.ts`).
 */
export const handleError = createSentryHandleError({ logErrors: false })

/**
 * React Router's own instrumentation hook, which is what puts middleware and
 * loader spans inside the request span. Without it a board trace is one flat
 * `http.server` bar and the GitHub reads hanging off it, with no way to see
 * which loader spent the time — tracing that decorates rather than answers.
 *
 * `captureErrors: false` because `handleError` above already files every
 * loader and action throw; leaving it on would file each one twice.
 */
export const instrumentations = [
  createSentryServerInstrumentation({ captureErrors: false }),
]

// `async` only so the signature matches wrapSentryHandleRequest's
// `Promise<unknown>` contract; the HEAD branch below is still synchronous
// work.
async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  _loadContext: RouterContextProvider,
) {
  // https://httpwg.org/specs/rfc9110.html#HEAD
  if (request.method.toUpperCase() === "HEAD") {
    return new Response(null, {
      status: responseStatusCode,
      headers: responseHeaders,
    })
  }

  return new Promise((resolve, reject) => {
    let shellRendered = false
    const userAgent = request.headers.get("user-agent")

    // Ensure requests from bots and SPA Mode renders wait for all content to
    // load before responding.
    // https://react.dev/reference/react-dom/server/renderToPipeableStream#waiting-for-all-content-to-load-for-crawlers-and-static-generation
    const readyOption: keyof RenderToPipeableStreamOptions =
      (userAgent && isbot(userAgent)) || routerContext.isSpaMode
        ? "onAllReady"
        : "onShellReady"

    // Abort the rendering stream after the `streamTimeout` so it has time to
    // flush down the rejected boundaries.
    let timeoutId: ReturnType<typeof setTimeout> | undefined = setTimeout(
      () => abort(),
      streamTimeout + 1000,
    )

    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter context={routerContext} url={request.url} />,
      {
        [readyOption]() {
          shellRendered = true
          const body = new PassThrough({
            final(callback) {
              // Clear the timeout to prevent retaining the closure and
              // leaking memory.
              clearTimeout(timeoutId)
              timeoutId = undefined
              callback()
            },
          })
          const stream = createReadableStreamFromReadable(body)

          responseHeaders.set("Content-Type", "text/html")

          // Render into a transform that injects `sentry-trace` and
          // `baggage` meta tags before `</head>`, so the browser's pageload
          // continues the SSR trace instead of starting its own (ADR-0059).
          // Inert with no DSN: the tags come out empty.
          pipe(getMetaTagTransformer(body))

          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          )
        },
        onShellError(error) {
          reject(error)
        },
        onError(error) {
          responseStatusCode = 500
          // Log streaming rendering errors from inside the shell. Errors
          // during initial shell rendering reject above and get logged there.
          // `handleError` never sees these — they are React's, not the
          // router's — so they become Sentry Logs rather than Issues
          // (consoleLoggingIntegration). Kept that way deliberately: the
          // reader already has their page and a boundary, and the failure
          // this most often is — a deferred artifact read outliving the 30s
          // budget above — is the same GitHub trouble the degrade seam files
          // as a Log too (ADR-0059).
          if (shellRendered) {
            console.error(error)
          }
        },
      },
    )
  })
}

/**
 * Wrapped rather than replaced. `createSentryHandleRequest` would supply its
 * own handler, and with it react-router's stock ~5s stream cap — the exact
 * thing `streamTimeout` above exists to raise. `wrapSentryHandleRequest`
 * only renames the request's root span after the matched route pattern and
 * flushes on the way out, so the 30s budget survives intact.
 */
export default wrapSentryHandleRequest(handleRequest)
