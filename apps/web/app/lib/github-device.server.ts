import { z } from "zod"

/**
 * GitHub's OAuth device flow (ADR-0011). Unlike the redirect flow, these two
 * github.com endpoints need no callback URL — so they work on any host,
 * including every Vercel preview subdomain. They're unauthenticated (no bearer
 * token) and live on github.com, not api.github.com, so they sit outside the
 * authed `gh()` client in github.server.ts.
 */

/** Parse a JSON body, or null when GitHub answers with something else (an
    HTML 5xx page, an empty body) — so a bad response degrades, never throws. */
async function jsonOrNull(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    return null
  }
}

const deviceCodeSchema = z.object({
  device_code: z.string().min(1),
  user_code: z.string().min(1),
  verification_uri: z.string().min(1),
  expires_in: z.number(),
  interval: z.number(),
})

export type DeviceCode = z.infer<typeof deviceCodeSchema>

/** Step 1: ask GitHub for a user code the person types on github.com. */
export async function requestDeviceCode(
  clientId: string,
  scope: string,
): Promise<DeviceCode> {
  const res = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: clientId, scope }),
  })
  const parsed = deviceCodeSchema.safeParse(await jsonOrNull(res))
  if (!res.ok || !parsed.success) {
    throw new Response("GitHub device-code request failed", { status: 502 })
  }
  return parsed.data
}

/**
 * The poll response is either a success or an `{ error }` — and GitHub returns
 * HTTP 200 for the pending/slow-down errors too, so the status code tells us
 * nothing; the body does.
 */
const pollSchema = z.union([
  z.object({ access_token: z.string().min(1) }),
  z.object({ error: z.string() }),
])

export type DevicePoll =
  | { status: "authorized"; token: string }
  | { status: "pending" }
  | { status: "slow_down" }
  | { status: "expired" }
  | { status: "denied" }
  | { status: "error" }

/** Step 2: poll for the token until the person authorizes (or the code dies). */
export async function pollDeviceToken(
  clientId: string,
  deviceCode: string,
): Promise<DevicePoll> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      device_code: deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    }),
  })
  const parsed = pollSchema.safeParse(await jsonOrNull(res))
  if (!parsed.success) return { status: "error" }
  if ("access_token" in parsed.data) {
    return { status: "authorized", token: parsed.data.access_token }
  }
  switch (parsed.data.error) {
    case "authorization_pending":
      return { status: "pending" }
    case "slow_down":
      return { status: "slow_down" }
    case "expired_token":
      return { status: "expired" }
    case "access_denied":
      return { status: "denied" }
    default:
      return { status: "error" }
  }
}
