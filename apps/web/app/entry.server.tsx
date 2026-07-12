import { PassThrough } from "node:stream"

import { createReadableStreamFromReadable } from "@react-router/node"
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

export default function handleRequest(
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

          pipe(body)

          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          )
        },
        onShellError(error: unknown) {
          reject(error)
        },
        onError(error: unknown) {
          responseStatusCode = 500
          // Log streaming rendering errors from inside the shell. Errors
          // during initial shell rendering reject above and get logged there.
          if (shellRendered) {
            console.error(error)
          }
        },
      },
    )
  })
}
