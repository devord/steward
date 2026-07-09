import type { Route } from "./+types/home"

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Bulletin" },
    {
      name: "description",
      content: "A dashboard of living widgets, kept fresh by routines.",
    },
  ]
}

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 leading-relaxed">
      <h1 className="font-mono text-3xl font-bold tracking-widest text-orange">
        Bulletin
      </h1>
      <p className="mt-4">
        A dashboard of living widgets, each kept fresh by a scheduled routine.
      </p>
      <p className="mt-2 text-ink-dim">
        Sign-in and the widget grid arrive in M2.
      </p>
    </main>
  )
}
