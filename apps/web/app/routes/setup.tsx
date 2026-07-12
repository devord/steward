import { Form, redirect, useNavigation } from "react-router"

import type { Route } from "./+types/setup"
import { AccountBar } from "../components/account-bar.tsx"
import { Button } from "~/components/ui/button"
import { dataRepoExists, repoExistsOr503 } from "../lib/dashboard.server.ts"
import { env } from "../lib/env.server.ts"
import { addRepoTopic, generateFromTemplate } from "../lib/github.server.ts"
import { invalidateRepoCache, resolveHomeRepo } from "../lib/repos.server.ts"
import { useT } from "../lib/i18n.tsx"
import { requireAuth } from "../lib/session.server.ts"

export function meta(_args: Route.MetaArgs) {
  return [{ title: "Steward — Set up" }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request)
  const dataRepo = resolveHomeRepo(auth.login, auth.dataRepo)
  if (await repoExistsOr503(auth.token, dataRepo)) throw redirect("/")
  return {
    login: auth.login,
    displayName: auth.name ?? null,
    dataRepo,
  }
}

/** First-run wizard: create the private data repo from the template. */
export async function action({ request }: Route.ActionArgs) {
  const auth = await requireAuth(request)
  const dataRepo = resolveHomeRepo(auth.login, auth.dataRepo)
  const name = dataRepo.split("/")[1]
  if (!name) throw new Response("Bad data repo name", { status: 400 })

  await generateFromTemplate(
    auth.token,
    env().STEWARD_DATA_REPO_TEMPLATE,
    auth.login,
    name,
  )

  // Repo generation is asynchronous on GitHub's side; wait for it to be
  // readable so the redirect doesn't bounce straight back here. A transient
  // read failure mid-propagation is just "not ready yet" — swallow it and
  // keep polling rather than aborting the whole create.
  for (let i = 0; i < 10; i++) {
    if (await dataRepoExists(auth.token, dataRepo).catch(() => false)) break
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  // Repos generated from a template do NOT inherit its topics — tag it here
  // or discovery (ADR-0023) would only ever find it by the home convention.
  // Best-effort: the convention union covers a flaked tag until re-tagged.
  await addRepoTopic(auth.token, dataRepo, env().DATA_REPO_TOPIC).catch(
    () => {},
  )
  invalidateRepoCache(auth.token)
  return redirect("/")
}

/**
 * A translated sentence with its `{branch}` slot rendered as a mono
 * <code> element — the locale controls the words around the branch name.
 */
function BranchLine({ text, branch }: { text: string; branch: string }) {
  const [before = "", after = ""] = text.split("{branch}")
  return (
    <>
      {before}
      <code className="font-mono">{branch}</code>
      {after}
    </>
  )
}

export default function Setup({ loaderData }: Route.ComponentProps) {
  const { login, displayName, dataRepo } = loaderData
  const t = useT()
  const navigation = useNavigation()
  const creating = navigation.state !== "idle"

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 leading-relaxed sm:px-6">
      <AccountBar login={login} displayName={displayName} className="mb-8" />
      <main>
        <h1 className="font-mono text-2xl font-bold text-foreground">
          {t("setup.title")}
        </h1>
        <p className="mt-4">
          {t("setup.hi1")} <span className="font-mono">{login}</span>{" "}
          {t("setup.hi2")}
        </p>
        <p className="mt-4 rounded-md border border-border-dim bg-bg1 px-4 py-3 font-mono text-sm break-all">
          {dataRepo}
        </p>
        <ul className="mt-4 list-inside list-disc text-sm text-ink-dim">
          <li>
            <BranchLine text={t("setup.bulletMain")} branch="main" />
          </li>
          <li>
            <BranchLine text={t("setup.bulletArtifacts")} branch="artifacts" />
          </li>
          <li>{t("setup.bulletPrivate")}</li>
        </ul>
        <Form method="post" className="mt-8">
          <Button type="submit" disabled={creating}>
            {creating ? t("setup.creating") : t("setup.create")}
          </Button>
        </Form>
        {/* If the page insists on creating a repo you know exists, you're
            almost always signed in as the wrong account — name that, since the
            check is live per-load, not a stale cache. */}
        <p className="mt-6 max-w-prose text-xs text-ink-faint">
          {t("setup.wrongAccount")}
        </p>
      </main>
    </div>
  )
}
