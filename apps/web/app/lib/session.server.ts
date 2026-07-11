import { createCookieSessionStorage, redirect } from "react-router"

import { env } from "./env.server.ts"

/**
 * The whole session: the user's GitHub token never leaves the server
 * (ADR-0004). `dataRepo` is the optional per-user override of the
 * `<login>/<prefix><login>` naming convention (ADR-0001).
 */
export interface SessionData {
  token: string
  login: string
  /** GitHub display name (nullable upstream), stored at login so the chrome
      can greet the person, not the handle. Absent on pre-existing sessions. */
  name?: string
  dataRepo?: string
  /** OAuth CSRF state, only present mid-login. */
  oauthState?: string
  /** Device-flow state, only present between requesting a code and polling. */
  device?: {
    /** Secret polled for the token — never rendered. */
    code: string
    /** The code the person types on github.com. */
    userCode: string
    verificationUri: string
    /** Seconds to wait between polls; grows on `slow_down`. */
    interval: number
    /** Epoch ms when the code stops working. */
    expiresAt: number
  }
}

const storage = createCookieSessionStorage<SessionData>({
  cookie: {
    name: "__bulletin_session",
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secrets: [env().SESSION_SECRET],
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
  },
})

export const { getSession, commitSession, destroySession } = storage

export async function getAuth(request: Request) {
  const session = await getSession(request.headers.get("Cookie"))
  const token = session.get("token")
  const login = session.get("login")
  if (!token || !login) return null
  return {
    token,
    login,
    name: session.get("name"),
    dataRepo: session.get("dataRepo"),
    session,
  }
}

/** Loader guard: bounce anonymous users to the landing page. */
export async function requireAuth(request: Request) {
  const auth = await getAuth(request)
  if (!auth) throw redirect("/")
  return auth
}
