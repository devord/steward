import { Form, redirect } from "react-router"

import type { Route } from "./+types/home"
import { WidgetCard } from "../components/widget-card.tsx"
import { cssVars } from "../lib/css.ts"
import {
  dataRepoExists,
  loadDashboard,
  resolveDataRepo,
} from "../lib/dashboard.server.ts"
import { getAuth } from "../lib/session.server.ts"

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Bulletin" },
    {
      name: "description",
      content: "A dashboard of living widgets, kept fresh by routines.",
    },
  ]
}

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await getAuth(request)
  if (!auth) return { kind: "anonymous" as const }

  const dataRepo = resolveDataRepo(auth.login, auth.dataRepo)
  if (!(await dataRepoExists(auth.token, dataRepo))) throw redirect("/setup")

  const view = await loadDashboard(auth.token, dataRepo)
  return {
    kind: "dashboard" as const,
    login: auth.login,
    now: Date.now(),
    view,
  }
}

export default function Home({ loaderData }: Route.ComponentProps) {
  if (loaderData.kind === "anonymous") return <Landing />
  const { login, now, view } = loaderData

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16">
      <header className="flex items-center justify-between py-4">
        <h1 className="font-mono text-lg font-bold tracking-widest text-orange">
          Bulletin
        </h1>
        <div className="flex items-center gap-3 text-sm text-ink-dim">
          <a
            href={`https://github.com/${view.dataRepo}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-xs hover:text-ink"
          >
            {view.dataRepo}
          </a>
          <span className="font-mono text-xs">{login}</span>
          <Form method="post" action="/auth/logout">
            <button
              type="submit"
              className="rounded-md border border-border-dim px-2 py-1 text-xs hover:border-border hover:text-ink"
            >
              sign out
            </button>
          </Form>
        </div>
      </header>

      {view.widgets.length === 0 ? (
        <EmptyDashboard />
      ) : (
        <main
          className="dash-grid"
          style={cssVars({ "--row-h": `${view.grid.rowHeight}px` })}
        >
          {view.widgets.map((widget) => (
            <WidgetCard key={widget.routine.slug} widget={widget} now={now} />
          ))}
        </main>
      )}
    </div>
  )
}

function Landing() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 leading-relaxed">
      <h1 className="font-mono text-3xl font-bold tracking-widest text-orange">
        Bulletin
      </h1>
      <p className="mt-4">
        A dashboard of living widgets, each kept fresh by a scheduled routine.
      </p>
      <p className="mt-2 text-ink-dim">
        Your config and artifacts live in a private GitHub repo of your own —
        the app stores nothing.
      </p>
      <a
        href="/auth/login"
        className="mt-8 inline-block rounded-md bg-orange px-4 py-2 font-mono text-sm font-bold text-bg hover:bg-orange-deep"
      >
        Sign in with GitHub
      </a>
    </main>
  )
}

function EmptyDashboard() {
  return (
    <main className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border py-24 text-center">
      <p className="text-ink-dim">No widgets on the grid yet.</p>
      <p className="text-sm text-ink-faint">
        Edit <code className="font-mono">data/dashboard.yaml</code> in your data
        repo — the add-routine wizard lands with editing.
      </p>
    </main>
  )
}
