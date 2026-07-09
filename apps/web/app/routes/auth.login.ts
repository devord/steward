import { redirect } from "react-router"

import { env } from "../lib/env.server.ts"
import { commitSession, getSession } from "../lib/session.server.ts"

/** Kick off the GitHub OAuth dance (ADR-0004). */
export async function loader({ request }: { request: Request }) {
  const session = await getSession(request.headers.get("Cookie"))
  const state = crypto.randomUUID()
  session.set("oauthState", state)

  const authorize = new URL("https://github.com/login/oauth/authorize")
  authorize.searchParams.set("client_id", env().GITHUB_CLIENT_ID)
  authorize.searchParams.set(
    "redirect_uri",
    new URL("/auth/callback", request.url).toString(),
  )
  authorize.searchParams.set("scope", "repo read:user")
  authorize.searchParams.set("state", state)

  return redirect(authorize.toString(), {
    headers: { "Set-Cookie": await commitSession(session) },
  })
}
