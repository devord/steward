import { Form, redirect, useNavigation } from "react-router"

import type { Route } from "./+types/setup"
import { dataRepoExists, resolveDataRepo } from "../lib/dashboard.server.ts"
import { env } from "../lib/env.server.ts"
import { generateFromTemplate } from "../lib/github.server.ts"
import { requireAuth } from "../lib/session.server.ts"

export function meta(_args: Route.MetaArgs) {
  return [{ title: "Bulletin — set up" }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request)
  const dataRepo = resolveDataRepo(auth.login, auth.dataRepo)
  if (await dataRepoExists(auth.token, dataRepo)) throw redirect("/")
  return { login: auth.login, dataRepo }
}

/** First-run wizard: create the private data repo from the template. */
export async function action({ request }: Route.ActionArgs) {
  const auth = await requireAuth(request)
  const dataRepo = resolveDataRepo(auth.login, auth.dataRepo)
  const name = dataRepo.split("/")[1]
  if (!name) throw new Response("Bad data repo name", { status: 400 })

  await generateFromTemplate(
    auth.token,
    env().BULLETIN_DATA_REPO_TEMPLATE,
    auth.login,
    name,
  )

  // Repo generation is asynchronous on GitHub's side; wait for it to be
  // readable so the redirect doesn't bounce straight back here.
  for (let i = 0; i < 10; i++) {
    if (await dataRepoExists(auth.token, dataRepo)) break
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  return redirect("/")
}

export default function Setup({ loaderData }: Route.ComponentProps) {
  const { login, dataRepo } = loaderData
  const navigation = useNavigation()
  const creating = navigation.state !== "idle"

  return (
    <main className="mx-auto max-w-2xl px-6 py-16 leading-relaxed">
      <h1 className="font-mono text-2xl font-bold tracking-widest text-orange">
        Create your dashboard repo
      </h1>
      <p className="mt-4">
        Hi <span className="font-mono">{login}</span> — Bulletin keeps
        everything it knows about you in one private GitHub repo:
      </p>
      <p className="mt-4 rounded-md border border-border-dim bg-bg1 px-4 py-3 font-mono text-sm">
        {dataRepo}
      </p>
      <ul className="mt-4 list-inside list-disc text-sm text-ink-dim">
        <li>
          <code className="font-mono">main</code> holds config — which routines
          run, and the grid layout
        </li>
        <li>
          an <code className="font-mono">artifacts</code> branch holds what they
          publish
        </li>
        <li>private: only you (and collaborators you invite) can read it</li>
      </ul>
      <Form method="post" className="mt-8">
        <button
          type="submit"
          disabled={creating}
          className="rounded-md bg-orange px-4 py-2 font-mono text-sm font-bold text-bg hover:bg-orange-deep disabled:opacity-50"
        >
          {creating ? "creating…" : "Create repo"}
        </button>
      </Form>
    </main>
  )
}
