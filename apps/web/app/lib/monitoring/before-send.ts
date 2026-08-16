import type { Breadcrumb, ErrorEvent, EventHint } from "@sentry/react-router"

import { isJsonString } from "../json.ts"

/**
 * Redaction and noise filtering for every Sentry event, both seams
 * (ADR-0059).
 *
 * Redaction is the gate here, not hygiene: `__steward_session` carries the
 * viewer's GitHub token (ADR-0004), so an event that shipped a cookie would
 * ship a credential. The SDK's `dataCollection` options refuse the same data
 * first (`instrument.server.ts`), and this is the second refusal — because
 * the first is a library default and defaults move. It is also not purely
 * redundant: `dataCollection.httpHeaders`' deny-list filters *span
 * attributes*, while `event.request.headers` is only trimmed of `cookie`, so
 * `authorization` reaches an event unless something deletes it. This does.
 *
 * Kept SDK-init-free (types only) so `before-send.test.ts` can assert the
 * scrub and the keep/drop decision as plain functions, in the node project.
 */

/**
 * `denyUrls` for the browser SDK: an error whose top stack frame is in an
 * extension's own injected script is never our bug, and is dropped before
 * `beforeSend` runs at all.
 */
export const DENY_URLS: RegExp[] = [
  /extensions\//i,
  /^chrome:\/\//i,
  /^chrome-extension:\/\//i,
  /^moz-extension:\/\//i,
  /^safari-(web-)?extension:\/\//i,
]

/**
 * Extension origins anywhere in the event text. Catches what `denyUrls`
 * misses — an extension URL that survives only in a message, never as a
 * parsed frame.
 */
const EXTENSION_ORIGIN_PATTERNS: RegExp[] = [
  /chrome-extension:\/\//i,
  /moz-extension:\/\//i,
  /safari-(web-)?extension:\/\//i,
]

/**
 * Messages that describe the environment or a cancellation rather than a
 * defect. Small list on purpose: Steward loads no third-party scripts, so
 * most of a public site's noise surface doesn't exist here. Grow it from the
 * real inbox, one pattern and one test at a time.
 */
const NOISE_MESSAGE_PATTERNS: RegExp[] = [
  // use-poll-revalidate cancels the in-flight revalidation on every tick it
  // supersedes, and gh() composes an AbortSignal.timeout(15s) into every
  // read (github.server.ts) — both routine, neither a defect.
  /AbortError/i,
  /TimeoutError/i,
  /\bThe operation was aborted\b/i,
  /\bsignal timed out\b/i,
  // react-grid-layout measures during drag and the artifact fit pass
  // re-measures the iframe it just resized (artifact-fit.ts); a browser
  // reporting that the loop didn't settle in one frame is not an error
  // anyone can act on.
  /ResizeObserver loop/i,
  // Offline blips and blocked requests. Match the value alone: the SDK
  // normalizes an exception into separate `type` and `value` fields, so the
  // colon-joined "TypeError: Failed to fetch" form never appears.
  /\bFailed to fetch\b/i,
  /\bNetworkError when attempting to fetch\b/i,
  /\bLoad failed\b/i,
]

/**
 * The `beforeSend` both seams install. Scrubs first, then decides.
 */
export function beforeSend(
  event: ErrorEvent,
  hint?: EventHint,
): ErrorEvent | null {
  redactRequest(event)
  return filterNoise(event, hint)
}

/**
 * The `beforeBreadcrumb` both seams install. A fetch or xhr breadcrumb keeps
 * its own copy of the URL, so the same blanket query strip has to happen
 * here or `/auth/callback?code=…` survives the event that dropped it.
 */
export function beforeBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  const url = breadcrumb.data?.url
  if (isJsonString(url) && breadcrumb.data) {
    breadcrumb.data.url = redactUrl(url)
  }
  return breadcrumb
}

/**
 * Strip everything an event's request context can carry that we refuse to
 * send: the query string, the cookie jar, and the two headers that are
 * credentials.
 */
function redactRequest(event: ErrorEvent): void {
  const request = event.request
  if (!request) return

  if (request.url) request.url = redactUrl(request.url)
  // A parallel copy of the params the SDK may attach independently of `url`.
  if (request.query_string) request.query_string = undefined
  // The session cookie is the token. Never send the jar, parsed or raw.
  if (request.cookies) request.cookies = undefined

  const headers = request.headers
  if (headers) {
    for (const name of Object.keys(headers)) {
      const lower = name.toLowerCase()
      if (lower === "cookie" || lower === "authorization") delete headers[name]
    }
  }
}

/**
 * Keep the event, or return `null` to drop it so no Issue is created.
 */
export function filterNoise(
  event: ErrorEvent,
  hint?: EventHint,
): ErrorEvent | null {
  const text = eventText(event, hint)

  if (EXTENSION_ORIGIN_PATTERNS.some((pattern) => pattern.test(text))) {
    return null
  }
  if (NOISE_MESSAGE_PATTERNS.some((pattern) => pattern.test(text))) return null

  return event
}

/**
 * Drop the **whole** query string, never named keys. Steward's sensitive
 * params today are `?code=` and `?state=` on the OAuth callback and the
 * device-flow codes beside them, but the point of the blanket strip is the
 * param nobody has thought of yet: a per-key list is a list someone has to
 * remember to extend, and forgetting is silent.
 */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url)
    parsed.search = ""
    return parsed.toString()
  } catch {
    // Not an absolute URL — cut at the first `?` so a relative path with a
    // query is still redacted.
    const queryStart = url.indexOf("?")
    return queryStart === -1 ? url : url.slice(0, queryStart)
  }
}

/**
 * Every message, type and frame filename in one string, so a single pass
 * covers the serialized event and the value that was actually thrown.
 */
function eventText(event: ErrorEvent, hint?: EventHint): string {
  const parts: string[] = []

  if (event.message) parts.push(event.message)

  // The pre-normalization throw: `DOMException.name` ("AbortError") and
  // extension URLs often live only here.
  const original = hint?.originalException
  if (original instanceof Error) {
    if (original.name) parts.push(original.name)
    if (original.message) parts.push(original.message)
    if (original.stack) parts.push(original.stack)
  } else if (isJsonString(original)) {
    parts.push(original)
  }

  for (const exception of event.exception?.values ?? []) {
    if (exception.type) parts.push(exception.type)
    if (exception.value) parts.push(exception.value)
    for (const frame of exception.stacktrace?.frames ?? []) {
      if (frame.filename) parts.push(frame.filename)
      if (frame.abs_path) parts.push(frame.abs_path)
    }
  }

  return parts.join("\n")
}
