import type { ErrorEvent, EventHint } from "@sentry/react-router"
import { describe, expect, it } from "vitest"

import {
  beforeBreadcrumb,
  beforeSend,
  filterNoise,
  redactUrl,
} from "./before-send.ts"

/** The smallest event carrying one exception, optionally with a frame. */
function errorEvent(value: string, filename?: string): ErrorEvent {
  return {
    type: undefined,
    exception: {
      values: [
        {
          type: "Error",
          value,
          stacktrace: filename ? { frames: [{ filename }] } : undefined,
        },
      ],
    },
  }
}

describe("redactUrl", () => {
  it("strips the whole query string, keeping origin and path", () => {
    expect(
      redactUrl("https://steward.app/auth/callback?code=gho_x&state=abc"),
    ).toBe("https://steward.app/auth/callback")
  })

  it("leaves a URL with no query untouched", () => {
    expect(redactUrl("https://steward.app/r/devord/steward-data/main")).toBe(
      "https://steward.app/r/devord/steward-data/main",
    )
  })

  it("redacts a relative path's query", () => {
    expect(redactUrl("/run?slug=daniel-queue&sha=deadbeef")).toBe("/run")
  })
})

describe("beforeSend", () => {
  it("never sends the session cookie", () => {
    // __steward_session IS the GitHub token (ADR-0004) — the whole point of
    // the second layer.
    const event = errorEvent("boom")
    event.request = {
      cookies: { __steward_session: "s%3Atoken" },
      headers: { cookie: "__steward_session=s%3Atoken" },
    }
    const sent = beforeSend(event)
    expect(sent?.request?.cookies).toBeUndefined()
    expect(sent?.request?.headers).toEqual({})
  })

  it("deletes the authorization header whatever its casing", () => {
    const event = errorEvent("boom")
    event.request = {
      headers: { Authorization: "Bearer gho_x", accept: "*/*" },
    }
    expect(beforeSend(event)?.request?.headers).toEqual({ accept: "*/*" })
  })

  it("strips the query string from the request URL", () => {
    const event = errorEvent("boom")
    event.request = { url: "https://steward.app/auth/callback?code=gho_x" }
    expect(beforeSend(event)?.request?.url).toBe(
      "https://steward.app/auth/callback",
    )
  })

  it("clears the parallel query_string copy", () => {
    const event = errorEvent("boom")
    event.request = { query_string: "code=gho_x&state=abc" }
    expect(beforeSend(event)?.request?.query_string).toBeUndefined()
  })

  it("still drops noise after scrubbing", () => {
    const event = errorEvent("AbortError: The user aborted a request.")
    event.request = { url: "https://steward.app/?code=gho_x" }
    expect(beforeSend(event)).toBeNull()
  })

  it("keeps an event with no request context", () => {
    const event = errorEvent("Cannot read properties of undefined")
    expect(beforeSend(event)).toBe(event)
  })
})

describe("beforeBreadcrumb", () => {
  it("strips the query from a fetch breadcrumb's URL", () => {
    const crumb = beforeBreadcrumb({
      category: "fetch",
      data: {
        url: "https://steward.app/auth/callback?code=gho_x",
        method: "GET",
      },
    })
    expect(crumb?.data?.url).toBe("https://steward.app/auth/callback")
  })

  it("leaves a breadcrumb with no URL alone", () => {
    const crumb = beforeBreadcrumb({ category: "ui.click", message: "button" })
    expect(crumb?.message).toBe("button")
  })
})

describe("filterNoise", () => {
  it("drops extension-origin errors by stack frame", () => {
    expect(
      filterNoise(errorEvent("boom", "chrome-extension://abc/inject.js")),
    ).toBeNull()
  })

  it("drops moz-extension-origin errors", () => {
    expect(
      filterNoise(errorEvent("boom", "moz-extension://xyz/content.js")),
    ).toBeNull()
  })

  it("drops revalidation aborts", () => {
    // use-poll-revalidate cancels the in-flight revalidation on every tick
    // it supersedes.
    expect(
      filterNoise(errorEvent("AbortError: The user aborted a request.")),
    ).toBeNull()
  })

  it("drops the 15s GitHub read timeout", () => {
    // gh() composes AbortSignal.timeout(15_000) into every read.
    expect(filterNoise(errorEvent("TimeoutError: signal timed out"))).toBeNull()
  })

  it("drops ResizeObserver loop warnings", () => {
    // react-grid-layout measures during drag; the fit pass re-measures the
    // iframe it just resized.
    expect(
      filterNoise(
        errorEvent(
          "ResizeObserver loop completed with undelivered notifications.",
        ),
      ),
    ).toBeNull()
  })

  it("drops offline blips split across type and value", () => {
    // The SDK normalizes a throw into separate `type` and `value`, so the
    // colon-joined form never appears in a real event.
    const event: ErrorEvent = {
      type: undefined,
      exception: { values: [{ type: "TypeError", value: "Failed to fetch" }] },
    }
    expect(filterNoise(event)).toBeNull()
  })

  it("reads the original throw through the hint", () => {
    // A DOMException's name survives only on the hint, never in the
    // serialized value.
    const hint: EventHint = {
      originalException: new DOMException("aborted", "AbortError"),
    }
    expect(filterNoise(errorEvent("Something went wrong"), hint)).toBeNull()
  })

  it("keeps a genuine application error", () => {
    const event = errorEvent(
      "Cannot read properties of undefined (reading 'placements')",
      "https://steward.app/assets/root-abc123.js",
    )
    expect(filterNoise(event)).toBe(event)
  })
})
