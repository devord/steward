import { useState } from "react"
import { Form, redirect, useNavigation } from "react-router"

import type { Route } from "./+types/team"
import { AccountBar } from "../components/account-bar.tsx"
import { NewDashboardDialog } from "../components/dashboard-switcher.tsx"
import { Button } from "~/components/ui/button"
import { Link } from "~/components/ui/link"
import {
  listDashboards,
  repoExistsOr503,
  resolveTeamRepo,
} from "../lib/dashboard.server.ts"
import { env } from "../lib/env.server.ts"
import {
  generateFromTemplate,
  GitHubError,
  repoExists,
} from "../lib/github.server.ts"
import { useT } from "../lib/i18n.tsx"
import { requireAuth } from "../lib/session.server.ts"

export function meta(_args: Route.MetaArgs) {
  return [{ title: "Bulletin — Team" }]
}

/**
 * `/team` never renders a board itself: with boards it forwards to the
 * first one; without, it walks the user through creating the team repo
 * (ADR-0010) or its first dashboard.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request)
  const teamRepo = resolveTeamRepo()
  if (!teamRepo) {
    return { state: "unconfigured" as const, teamRepo: null, login: auth.login }
  }

  if (!(await repoExistsOr503(auth.token, teamRepo))) {
    return { state: "missing" as const, teamRepo, login: auth.login }
  }
  const dashboards = (await listDashboards(auth.token, teamRepo)) ?? []
  const [first] = dashboards
  if (first) throw redirect(`/team/${first}`)
  return { state: "empty" as const, teamRepo, login: auth.login }
}

/** Create the team repo from the data-repo template. */
export async function action({ request }: Route.ActionArgs) {
  const auth = await requireAuth(request)
  const teamRepo = resolveTeamRepo()
  if (!teamRepo) throw new Response("team repo not configured", { status: 400 })
  const [owner, name] = teamRepo.split("/")
  if (!owner || !name) {
    throw new Response("bad team repo name", { status: 400 })
  }

  try {
    await generateFromTemplate(
      auth.token,
      env().BULLETIN_DATA_REPO_TEMPLATE,
      owner,
      name,
    )
  } catch (error) {
    // 403: no permission to create repos in the org (or the OAuth app isn't
    // approved for it) — tell the user who can. 404: the template itself is
    // missing or unreadable — a config problem, not a permission one.
    if (error instanceof GitHubError && error.status === 403) {
      return { error: "denied" as const }
    }
    if (error instanceof GitHubError && error.status === 404) {
      return { error: "template" as const }
    }
    throw error
  }

  // Repo generation is asynchronous on GitHub's side; wait for it to be
  // readable so the redirect doesn't bounce straight back here.
  for (let i = 0; i < 10; i++) {
    if (await repoExists(auth.token, teamRepo).catch(() => false)) break
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  return redirect("/team")
}

export default function Team({ loaderData, actionData }: Route.ComponentProps) {
  const t = useT()
  const navigation = useNavigation()
  const [creating, setCreating] = useState(false)
  const busy = navigation.state !== "idle"

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 leading-relaxed sm:px-6">
      <AccountBar login={loaderData.login} className="mb-8" />
      <main>
        {loaderData.state === "unconfigured" && (
          <p className="text-sm text-muted-foreground">
            {t("team.notConfigured")}
          </p>
        )}

        {loaderData.state === "missing" && (
          <>
            <h1 className="font-mono text-2xl font-bold text-foreground">
              {t("team.missingTitle")}
            </h1>
            <p className="mt-4">{t("team.missingBody")}</p>
            <p className="mt-4 rounded-md border border-border-dim bg-bg1 px-4 py-3 font-mono text-sm break-all">
              {loaderData.teamRepo}
            </p>
            {actionData?.error ? (
              <p className="mt-4 text-sm text-destructive">
                {actionData.error === "denied"
                  ? t("team.missingDenied")
                  : t("team.missingTemplate")}
              </p>
            ) : (
              <Form method="post" className="mt-8">
                <Button type="submit" disabled={busy}>
                  {busy ? t("setup.creating") : t("team.missingCreate")}
                </Button>
              </Form>
            )}
          </>
        )}

        {loaderData.state === "empty" && (
          <>
            <h1 className="font-mono text-2xl font-bold text-foreground">
              {t("team.emptyTitle")}
            </h1>
            <p className="mt-4 text-sm text-muted-foreground">
              {t("team.emptyBody")}
            </p>
            <Button className="mt-8" onClick={() => setCreating(true)}>
              {t("team.emptyCta")}
            </Button>
            <NewDashboardDialog
              open={creating}
              onOpenChange={setCreating}
              defaultScope="team"
              canTeam
              takenSlugs={{ personal: [], team: [] }}
            />
          </>
        )}

        <p className="mt-10">
          <Link
            to="/"
            className="font-mono text-xs text-ink-dim transition-colors hover:text-foreground"
          >
            ← {t("team.back")}
          </Link>
        </p>
      </main>
    </div>
  )
}
