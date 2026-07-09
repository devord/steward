import { redirect } from "react-router"

import { destroySession, getSession } from "../lib/session.server.ts"

/** POST-only: logout mutates, and a GET link would be a CSRF footgun. */
export async function action({ request }: { request: Request }) {
  const session = await getSession(request.headers.get("Cookie"))
  return redirect("/", {
    headers: { "Set-Cookie": await destroySession(session) },
  })
}

export function loader() {
  return redirect("/")
}
