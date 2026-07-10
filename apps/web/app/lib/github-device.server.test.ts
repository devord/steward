import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { server } from "../mocks/setup-node.ts"
import { pollDeviceToken, requestDeviceCode } from "./github-device.server.ts"

const DEVICE_CODE_URL = "https://github.com/login/device/code"
const TOKEN_URL = "https://github.com/login/oauth/access_token"

function onDeviceCode(
  body: Record<string, unknown>,
  init?: { status?: number },
) {
  server.use(http.post(DEVICE_CODE_URL, () => HttpResponse.json(body, init)))
}

function onPoll(body: Record<string, unknown>) {
  // GitHub answers 200 even for the pending/slow-down "errors", so the mock
  // mirrors that: the body carries the outcome, not the status code.
  server.use(http.post(TOKEN_URL, () => HttpResponse.json(body)))
}

describe("requestDeviceCode", () => {
  it("returns the parsed code, sending client_id and scope", async () => {
    let sent: unknown
    server.use(
      http.post(DEVICE_CODE_URL, async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json({
          device_code: "dev-123",
          user_code: "WDJB-MJHT",
          verification_uri: "https://github.com/login/device",
          expires_in: 900,
          interval: 5,
        })
      }),
    )

    const code = await requestDeviceCode("client-x", "repo read:user")

    expect(code.user_code).toBe("WDJB-MJHT")
    expect(code.device_code).toBe("dev-123")
    expect(sent).toEqual({ client_id: "client-x", scope: "repo read:user" })
  })

  it("throws a 502 Response when GitHub rejects the request", async () => {
    onDeviceCode({ error: "device_flow_disabled" }, { status: 422 })

    await expect(requestDeviceCode("client-x", "repo")).rejects.toMatchObject({
      status: 502,
    })
  })

  it("throws a 502 Response on a malformed body", async () => {
    onDeviceCode({ user_code: "WDJB-MJHT" }) // missing device_code

    await expect(requestDeviceCode("client-x", "repo")).rejects.toMatchObject({
      status: 502,
    })
  })

  it("throws a 502 Response on a non-JSON body (e.g. an HTML 5xx page)", async () => {
    server.use(
      http.post(DEVICE_CODE_URL, () =>
        HttpResponse.text("<html>502 Bad Gateway</html>", { status: 502 }),
      ),
    )

    await expect(requestDeviceCode("client-x", "repo")).rejects.toMatchObject({
      status: 502,
    })
  })
})

describe("pollDeviceToken", () => {
  it("returns the token once authorized", async () => {
    onPoll({ access_token: "gho_abc", token_type: "bearer", scope: "repo" })

    await expect(pollDeviceToken("client-x", "dev-123")).resolves.toEqual({
      status: "authorized",
      token: "gho_abc",
    })
  })

  it("maps each GitHub error code to a status", async () => {
    const cases = {
      authorization_pending: "pending",
      slow_down: "slow_down",
      expired_token: "expired",
      access_denied: "denied",
      incorrect_device_code: "error",
    } as const

    for (const [error, status] of Object.entries(cases)) {
      onPoll({ error })
      await expect(pollDeviceToken("client-x", "dev-123")).resolves.toEqual({
        status,
      })
    }
  })

  it("returns error on a body that is neither token nor error", async () => {
    onPoll({ unexpected: true })

    await expect(pollDeviceToken("client-x", "dev-123")).resolves.toEqual({
      status: "error",
    })
  })

  it("returns error on a non-JSON body instead of throwing", async () => {
    server.use(
      http.post(TOKEN_URL, () =>
        HttpResponse.text("<html>500</html>", { status: 500 }),
      ),
    )

    await expect(pollDeviceToken("client-x", "dev-123")).resolves.toEqual({
      status: "error",
    })
  })

  it("sends the device_code grant, not the auth-code grant", async () => {
    let sent: Record<string, unknown> = {}
    server.use(
      http.post(TOKEN_URL, async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ error: "authorization_pending" })
      }),
    )

    await pollDeviceToken("client-x", "dev-123")

    expect(sent).toEqual({
      client_id: "client-x",
      device_code: "dev-123",
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    })
  })
})
