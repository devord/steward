import {
  parseRepoFile,
  REPO_FILE_PATH,
  REPO_NAME_MAX,
  type RepoFile,
  serializeRepoFile,
} from "@steward/schema"

import { data } from "react-router"
import { z } from "zod"

import { env } from "../lib/env.server.ts"
import {
  invalidateSidebarCache,
  listDashboards,
} from "../lib/dashboard.server.ts"
import {
  addRepoTopic,
  deleteFile,
  generateFromTemplate,
  getFile,
  GitHubError,
  getRepoMeta,
  listUserOrgs,
  putFile,
  repoExists,
} from "../lib/github.server.ts"
import { DEFAULT_DASHBOARD, parseRepo } from "../lib/repos.ts"
import { invalidateRepoCache, requireDataRepo } from "../lib/repos.server.ts"
import { requireAuth } from "../lib/session.server.ts"

/**
 * Data-repo lifecycle (ADR-0023). Two ways a repo joins the registry:
 * *create* generates a fresh one from the template (in the viewer's account
 * or any org they can create repos in), *register* tags an existing repo
 * with the discovery topic. Both end with the topic set and the registry
 * cache dropped, so the rail picks the repo up immediately — no waiting on
 * the search index (requireDataRepo's live check covers the lag).
 *
 * *rename* sets the repo's display name (ADR-0026) — a commit to the repo's
 * own data/repo.yaml, so the name is versioned and shared with everyone who
 * reads the repo. GitHub's own permissions gate it: no push, no commit.
 */

export interface DataRepoOwners {
  login: string
  orgs: string[]
  /** Conventional repo-name prefix, for the create form's default. */
  prefix: string
  /** GitHub's authorization page for this OAuth app — where a member requests
      org approval and an owner grants it. The client id is public, not a
      secret (ADR-0004), so it's safe to hand to the browser. */
  oauthAppUrl: string
}

export async function loader({ request }: { request: Request }) {
  const auth = await requireAuth(request)
  // Org list is a suggestion pool: a flake degrades to "just your account".
  const orgs = await listUserOrgs(auth.token).catch(() => [])
  return {
    login: auth.login,
    orgs,
    prefix: env().STEWARD_DATA_REPO_PREFIX,
    oauthAppUrl: `https://github.com/settings/connections/applications/${env().GITHUB_CLIENT_ID}`,
  } satisfies DataRepoOwners
}

const payloadSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("create"),
    owner: z.string().min(1),
    name: z
      .string()
      .regex(/^[A-Za-z0-9._-]+$/, "not a plausible GitHub repo name"),
  }),
  z.object({
    intent: z.literal("register"),
    repo: z.string(),
  }),
  z.object({
    intent: z.literal("rename"),
    repo: z.string(),
    /** New display name; blank clears it (back to the repo's short name). */
    name: z.string().max(REPO_NAME_MAX),
  }),
])

export type RenameRepoResult =
  | { ok: true }
  /** denied — no push access (or the repo vanished); conflict — someone
      else committed repo.yaml between read and write: retry. */
  | { ok: false; error: "denied" | "conflict" }

export type DataRepoResult =
  | {
      ok: true
      repo: string
      /** The board to open — the repo's actual first dashboard, or `main`
          for a freshly created template repo. null → no boards yet: the
          client lands on `/` where the new group's create-first row waits. */
      dashboard: string | null
    }
  | {
      ok: false
      error: "denied" | "template" | "exists" | "missing" | "not-data-repo"
    }

export async function action({ request }: { request: Request }) {
  const auth = await requireAuth(request)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw data({ error: "invalid JSON" }, { status: 400 })
  }
  const parsed = payloadSchema.safeParse(body)
  if (!parsed.success) {
    throw data({ error: "invalid payload" }, { status: 400 })
  }
  const payload = parsed.data

  if (payload.intent === "rename") {
    // The registry gate first — rename must not be a probe for arbitrary
    // repos (same 404-indistinguishable contract as every repo-taking action).
    const repo = await requireDataRepo(
      auth.token,
      auth.login,
      payload.repo,
      auth.dataRepo,
    )
    const name = payload.name.trim()
    try {
      const current = await getFile(
        auth.token,
        repo.full,
        REPO_FILE_PATH,
        "main",
      )
      // The name is one field among several (`sections`, `categories`) — read
      // the rest through so a rename never drops orders it doesn't own.
      // Best-effort, as in the section-rename path: a malformed repo.yaml is
      // treated as no siblings, never a failed rename.
      let siblings: Omit<RepoFile, "name"> = {}
      if (current) {
        try {
          const { name: _drop, ...rest } = parseRepoFile(current.text)
          siblings = rest
        } catch {
          siblings = {}
        }
      }
      const hasSiblings = Object.keys(siblings).length > 0
      if (name === "" && !hasSiblings) {
        // Clear, and the name was all the file held — the file itself goes
        // (absent is the honest blank).
        if (current) {
          await deleteFile(auth.token, repo.full, REPO_FILE_PATH, {
            message: "Clear repo display name",
            sha: current.sha,
            branch: "main",
          })
        }
      } else {
        await putFile(auth.token, repo.full, REPO_FILE_PATH, {
          content: serializeRepoFile(
            name === "" ? siblings : { ...siblings, name },
          ),
          message:
            name === ""
              ? "Clear repo display name"
              : `Set repo display name to ${name}`,
          branch: "main",
          ...(current ? { sha: current.sha } : {}),
        })
      }
    } catch (error) {
      // 403/404: no push access (a plain reader — GitHub's permissions are
      // the gate). 409/422: the file moved between read and write — retry.
      if (error instanceof GitHubError && [403, 404].includes(error.status)) {
        return { ok: false, error: "denied" } satisfies RenameRepoResult
      }
      if (error instanceof GitHubError && [409, 422].includes(error.status)) {
        return { ok: false, error: "conflict" } satisfies RenameRepoResult
      }
      throw error
    }
    // The rail shows display names from the SWR cache (ADR-0030) — drop it
    // so the rename shows on the very next load.
    invalidateSidebarCache(auth.token)
    return { ok: true } satisfies RenameRepoResult
  }

  if (payload.intent === "create") {
    const full = `${payload.owner}/${payload.name}`
    try {
      await generateFromTemplate(
        auth.token,
        env().STEWARD_DATA_REPO_TEMPLATE,
        payload.owner,
        payload.name,
      )
    } catch (error) {
      // 403: no permission to create repos there (or the OAuth app isn't
      // approved for the org). 404: the template itself is missing or
      // unreadable — a deployment problem, not the user's. 422: the name
      // is taken.
      if (error instanceof GitHubError && error.status === 403) {
        return { ok: false, error: "denied" } satisfies DataRepoResult
      }
      if (error instanceof GitHubError && error.status === 404) {
        return { ok: false, error: "template" } satisfies DataRepoResult
      }
      if (error instanceof GitHubError && error.status === 422) {
        return { ok: false, error: "exists" } satisfies DataRepoResult
      }
      throw error
    }
    // Generation is asynchronous on GitHub's side; wait for readability so
    // the client's navigation doesn't 404. Then tag it — generated repos do
    // NOT inherit the template's topics (best-effort; the home-convention
    // union or a later register re-tag covers a flake).
    for (let i = 0; i < 10; i++) {
      if (await repoExists(auth.token, full).catch(() => false)) break
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
    await addRepoTopic(auth.token, full, env().DATA_REPO_TOPIC).catch(() => {})
    invalidateRepoCache(auth.token)
    invalidateSidebarCache(auth.token)
    // Template repos always ship a `main` board.
    return {
      ok: true,
      repo: full,
      dashboard: DEFAULT_DASHBOARD,
    } satisfies DataRepoResult
  }

  // register — the repo must exist, be readable, and actually be a data
  // repo (its routine pool at data/routines.yaml is the shape everything
  // else reads); tagging an arbitrary repo would put a dead group in the rail.
  const ref = parseRepo(payload.repo)
  if (!ref) {
    return { ok: false, error: "missing" } satisfies DataRepoResult
  }
  const meta = await getRepoMeta(auth.token, ref.full)
  if (!meta) {
    return { ok: false, error: "missing" } satisfies DataRepoResult
  }
  const routines = await getFile(
    auth.token,
    ref.full,
    "data/routines.yaml",
    "main",
  ).catch(() => null)
  if (!routines) {
    return { ok: false, error: "not-data-repo" } satisfies DataRepoResult
  }
  try {
    await addRepoTopic(auth.token, ref.full, env().DATA_REPO_TOPIC)
  } catch (error) {
    // Topics need push access — a plain reader can see the repo but not
    // register it.
    if (error instanceof GitHubError && error.status === 403) {
      return { ok: false, error: "denied" } satisfies DataRepoResult
    }
    throw error
  }
  invalidateRepoCache(auth.token)
  invalidateSidebarCache(auth.token)
  // Registered repos carry whatever boards they already have (a data repo
  // needn't have `main`) — land on the first, or `/` when it has none yet.
  const dashboards = await listDashboards(auth.token, ref.full).catch(
    () => null,
  )
  return {
    ok: true,
    repo: ref.full,
    dashboard: dashboards?.[0] ?? null,
  } satisfies DataRepoResult
}
