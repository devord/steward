import { redirect } from "react-router"
import { z } from "zod"

import { env } from "../lib/env.server.ts"
import { getAuthedUser } from "../lib/github.server.ts"
import { commitSession, getSession } from "../lib/session.server.ts"

const tokenResponseSchema = z.object({ access_token: z.string().min(1) })

/** OAuth code→token exchange; the reason this app needs a server at all. */
export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const session = await getSession(request.headers.get("Cookie"))

  if (!code || !state || state !== session.get("oauthState")) {
    throw new Response("Invalid OAuth state", { status: 400 })
  }

  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: env().GITHUB_CLIENT_ID,
      client_secret: env().GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: new URL("/auth/callback", request.url).toString(),
    }),
  })
  const parsed = tokenResponseSchema.safeParse(await res.json())
  if (!res.ok || !parsed.success) {
    throw new Response("GitHub token exchange failed", { status: 502 })
  }

  const token = parsed.data.access_token
  const user = await getAuthedUser(token)

  session.set("token", token)
  session.set("login", user.login)
  session.unset("oauthState")

  return redirect("/", {
    headers: { "Set-Cookie": await commitSession(session) },
  })
}
