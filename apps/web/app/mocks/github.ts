import { createHash } from "node:crypto"

import { http, HttpResponse } from "msw"
import { z } from "zod"

/**
 * GitHub REST mock (the slice github.server.ts touches): a seedable
 * in-memory store of repos → refs → files, plus per-path failure
 * injection for exercising the 5xx retry/degradation paths. One handler
 * set shared by every test transport so mocks can't drift.
 */

interface MockFile {
  text: string
  /** ISO date reported by the commits API for this path, if any. */
  lastCommit: string | null
}

/** repo → `${ref}:${path}` → file */
const repos = new Map<string, Map<string, MockFile>>()

type Endpoint = "contents" | "commits" | "repo"

interface Failure {
  status: number
  /** Remaining failures; Infinity → fail every attempt. */
  times: number
  /** Restrict the failure to one endpoint; undefined → either. */
  endpoint?: Endpoint
  /** Reject as a network error (fetch throws) rather than an HTTP status. */
  network?: boolean
}

/** `${repo}:${path}` → injected failure for contents/commits requests. */
const failures = new Map<string, Failure>()

/**
 * Repo-level metadata the registry endpoints serve (ADR-0023): visibility,
 * the viewer's permission slice, topics, collaborators. Defaults model the
 * common case — a private repo the viewer admins, no topics, no listable
 * collaborators — so file-oriented tests never have to seed metadata.
 */
interface MockRepoMeta {
  private: boolean
  /** null → GitHub omits the permissions block entirely. */
  permissions: { admin: boolean; push: boolean } | null
  topics: string[]
  /** GitHub template-repository flag. */
  isTemplate: boolean
  /** "forbidden" → the collaborators endpoint answers 403 (viewer lacks
      push access), exactly GitHub's behavior for plain readers. */
  collaborators: { login: string; avatar_url: string }[] | "forbidden"
}

const repoMeta = new Map<string, Partial<MockRepoMeta>>()

const DEFAULT_META: MockRepoMeta = {
  private: true,
  permissions: { admin: true, push: true },
  topics: [],
  isTemplate: false,
  collaborators: [],
}

function metaFor(repo: string): MockRepoMeta {
  return { ...DEFAULT_META, ...repoMeta.get(repo) }
}

/** Seed (merge) registry metadata; also registers the repo as existing. */
export function seedRepoMeta(repo: string, meta: Partial<MockRepoMeta>) {
  repoMeta.set(repo, { ...repoMeta.get(repo), ...meta })
  if (!repos.has(repo)) repos.set(repo, new Map())
}

function mockRepoExists(repo: string): boolean {
  return repos.has(repo) || repoMeta.has(repo)
}

/** Injected failure for the repo search endpoint. */
let searchFailure: Failure | null = null

export function failSearch({
  status = 500,
  times = Infinity,
  network,
}: { status?: number; times?: number; network?: boolean } = {}) {
  searchFailure = { status, times, network }
}

/** Orgs /user/orgs reports for every token. */
let userOrgs: string[] = []

export function seedUserOrgs(orgs: string[]) {
  userOrgs = orgs
}

/** The slice of a contents-API PUT body the mock reads (base64 content +
    branch + optional expected SHA). */
const putBodySchema = z.object({
  content: z.string(),
  branch: z.string().optional(),
  sha: z.string().optional(),
})

/**
 * How the last requests resolved, so tests can assert the ETag path: `full`
 * counts 200s that shipped a body, `conditional` counts 304s answered from a
 * replayed `If-None-Match`.
 */
export const githubStats = { full: 0, conditional: 0 }

export function resetGitHub() {
  repos.clear()
  failures.clear()
  repoMeta.clear()
  searchFailure = null
  userOrgs = []
  githubStats.full = 0
  githubStats.conditional = 0
}

/** Deterministic content-derived validator — matches only identical bodies. */
function etagFor(body: string): string {
  return `"${createHash("sha1").update(body).digest("hex")}"`
}

/**
 * Content-derived blob SHA — like GitHub's, a different body yields a
 * different SHA, so the sync stale-base check and the PUT's optimistic
 * concurrency have something real to compare (a constant-per-path SHA can
 * never conflict, hiding exactly the races the sync flow guards against).
 */
function blobSha(ref: string, path: string, text: string): string {
  return `sha:${ref}:${path}:${createHash("sha1").update(text).digest("hex").slice(0, 12)}`
}

/**
 * Serve a JSON body with an ETag, honoring conditional requests exactly like
 * GitHub: a matching `If-None-Match` yields a bodyless 304, everything else a
 * full 200. Every GET handler routes success through here.
 */
function json(request: Request, value: unknown): Response {
  const body = JSON.stringify(value)
  const etag = etagFor(body)
  if (request.headers.get("If-None-Match") === etag) {
    githubStats.conditional += 1
    return new HttpResponse(null, { status: 304, headers: { ETag: etag } })
  }
  githubStats.full += 1
  return new HttpResponse(body, {
    status: 200,
    headers: { ETag: etag, "Content-Type": "application/json" },
  })
}

export function seedRepo(
  repo: string,
  files: Record<string, string | { text: string; lastCommit?: string }>,
  ref = "main",
) {
  const store = repos.get(repo) ?? new Map<string, MockFile>()
  for (const [path, value] of Object.entries(files)) {
    const file =
      typeof value === "string"
        ? { text: value, lastCommit: null }
        : { text: value.text, lastCommit: value.lastCommit ?? null }
    store.set(`${ref}:${path}`, file)
  }
  repos.set(repo, store)
}

/**
 * Make the next `times` requests for `path` fail. `endpoint` restricts the
 * failure to contents or commits (default: either); `network` rejects as a
 * fetch-level network error instead of an HTTP status.
 */
export function failPath(
  repo: string,
  path: string,
  {
    status = 500,
    times = Infinity,
    endpoint,
    network,
  }: {
    status?: number
    times?: number
    endpoint?: Endpoint
    network?: boolean
  } = {},
) {
  failures.set(`${repo}:${path}`, { status, times, endpoint, network })
}

function takeFailure(
  repo: string,
  path: string,
  endpoint: Endpoint,
): Failure | null {
  const failure = failures.get(`${repo}:${path}`)
  if (!failure || failure.times <= 0) return null
  if (failure.endpoint && failure.endpoint !== endpoint) return null
  failure.times -= 1
  return failure
}

/** The response for an injected failure: a network error or an HTTP status. */
function failureResponse(failure: Failure): Response {
  return failure.network
    ? HttpResponse.error()
    : new HttpResponse(null, { status: failure.status })
}

export const githubHandlers = [
  // Repo probe — repoExists and getRepoMeta both read this. The failure map
  // keys the probe under the empty path, so tests can inject a 5xx/network
  // blip on the existence/metadata check itself.
  http.get(
    "https://api.github.com/repos/:owner/:repo",
    ({ params, request }) => {
      const repo = `${params.owner}/${params.repo}`
      const failure = takeFailure(repo, "", "repo")
      if (failure) return failureResponse(failure)
      if (!mockRepoExists(repo)) return new HttpResponse(null, { status: 404 })
      const meta = metaFor(repo)
      return json(request, {
        full_name: repo,
        private: meta.private,
        is_template: meta.isTemplate,
        ...(meta.permissions ? { permissions: meta.permissions } : {}),
      })
    },
  ),

  // Repo search — the data-repo registry's discovery call (ADR-0023). Only
  // the `topic:` qualifier is modeled; results are every existing repo
  // carrying that topic, in the metadata shape the registry reads.
  http.get("https://api.github.com/search/repositories", ({ request }) => {
    if (searchFailure && searchFailure.times > 0) {
      searchFailure.times -= 1
      return failureResponse(searchFailure)
    }
    const q = new URL(request.url).searchParams.get("q") ?? ""
    const topic = /topic:([a-z0-9-]+)/.exec(q)?.[1]
    const names = new Set([...repos.keys(), ...repoMeta.keys()])
    const items = [...names]
      .filter((repo) => topic != null && metaFor(repo).topics.includes(topic))
      .map((repo) => {
        const meta = metaFor(repo)
        return {
          full_name: repo,
          private: meta.private,
          is_template: meta.isTemplate,
          ...(meta.permissions ? { permissions: meta.permissions } : {}),
        }
      })
    return json(request, { total_count: items.length, items })
  }),

  // Topics read + replace — GitHub's PUT swaps the whole set, which is why
  // addRepoTopic must read-then-union; the mock mirrors that contract.
  http.get(
    "https://api.github.com/repos/:owner/:repo/topics",
    ({ params, request }) => {
      const repo = `${params.owner}/${params.repo}`
      if (!mockRepoExists(repo)) return new HttpResponse(null, { status: 404 })
      return json(request, { names: metaFor(repo).topics })
    },
  ),
  http.put(
    "https://api.github.com/repos/:owner/:repo/topics",
    async ({ params, request }) => {
      const repo = `${params.owner}/${params.repo}`
      if (!mockRepoExists(repo)) return new HttpResponse(null, { status: 404 })
      const body = z
        .object({ names: z.array(z.string()) })
        .parse(await request.json())
      seedRepoMeta(repo, { topics: body.names })
      return HttpResponse.json({ names: body.names })
    },
  ),

  // Collaborators — 403 for viewers without push access, like GitHub.
  http.get(
    "https://api.github.com/repos/:owner/:repo/collaborators",
    ({ params, request }) => {
      const repo = `${params.owner}/${params.repo}`
      if (!mockRepoExists(repo)) return new HttpResponse(null, { status: 404 })
      const { collaborators } = metaFor(repo)
      if (collaborators === "forbidden") {
        return new HttpResponse(null, { status: 403 })
      }
      return json(request, collaborators)
    },
  ),

  // The viewer's orgs — owner choices for create-from-template.
  http.get("https://api.github.com/user/orgs", ({ request }) =>
    json(
      request,
      userOrgs.map((login) => ({ login })),
    ),
  ),

  // Contents API — single file, base64 payload.
  http.get(
    "https://api.github.com/repos/:owner/:repo/contents/*",
    ({ params, request }) => {
      const repo = `${params.owner}/${params.repo}`
      const url = new URL(request.url)
      const path = decodeURIComponent(
        url.pathname.replace(`/repos/${repo}/contents/`, ""),
      )
      const failure = takeFailure(repo, path, "contents")
      if (failure) return failureResponse(failure)
      const ref = url.searchParams.get("ref") ?? "main"
      const file = repos.get(repo)?.get(`${ref}:${path}`)
      if (!file) {
        // Directory listing — the contents API answers with an array of
        // entries when the path is a directory.
        const prefix = `${ref}:${path}/`
        const names = new Set<string>()
        for (const key of repos.get(repo)?.keys() ?? []) {
          if (key.startsWith(prefix)) {
            const [head] = key.slice(prefix.length).split("/")
            if (head) names.add(head)
          }
        }
        if (names.size === 0) return new HttpResponse(null, { status: 404 })
        return json(
          request,
          [...names].map((name) => ({
            name,
            type: repos.get(repo)?.has(`${prefix}${name}`) ? "file" : "dir",
            sha: `sha:${ref}:${path}/${name}`,
          })),
        )
      }
      return json(request, {
        content: Buffer.from(file.text, "utf8").toString("base64"),
        sha: blobSha(ref, path, file.text),
      })
    },
  ),

  // Contents API PUT — create or update a file with GitHub's optimistic
  // concurrency: an update whose `sha` doesn't match the current blob is a
  // 409, and a create over an existing file (no `sha`) is a 422. Returns the
  // new content SHA so the sync flow can capture the authoritative base.
  http.put(
    "https://api.github.com/repos/:owner/:repo/contents/*",
    async ({ params, request }) => {
      const repo = `${params.owner}/${params.repo}`
      const url = new URL(request.url)
      const path = decodeURIComponent(
        url.pathname.replace(`/repos/${repo}/contents/`, ""),
      )
      const failure = takeFailure(repo, path, "contents")
      if (failure) return failureResponse(failure)
      const body = putBodySchema.parse(await request.json())
      const ref = body.branch ?? "main"
      const store = repos.get(repo) ?? new Map<string, MockFile>()
      const key = `${ref}:${path}`
      const existing = store.get(key)
      const existingSha = existing ? blobSha(ref, path, existing.text) : null
      if (body.sha) {
        // Update: the supplied SHA must match the current blob.
        if (!existing || existingSha !== body.sha) {
          return new HttpResponse(null, { status: 409 })
        }
      } else if (existing) {
        // Create over an existing file — GitHub demands the SHA.
        return new HttpResponse(null, { status: 422 })
      }
      const text = Buffer.from(body.content, "base64").toString("utf8")
      store.set(key, { text, lastCommit: existing?.lastCommit ?? null })
      repos.set(repo, store)
      return HttpResponse.json({ content: { sha: blobSha(ref, path, text) } })
    },
  ),

  // Recursive tree of the default branch — the shape listTreePaths reads.
  // Derived from the seeded main-ref files, so discovery tests seed repos
  // exactly like every other test.
  http.get(
    "https://api.github.com/repos/:owner/:repo/git/trees/HEAD",
    ({ params, request }) => {
      const repo = `${params.owner}/${params.repo}`
      const store = repos.get(repo)
      if (!store) return new HttpResponse(null, { status: 404 })
      const tree = [...store.keys()].flatMap((key) =>
        key.startsWith("main:")
          ? [{ path: key.slice("main:".length), type: "blob" }]
          : [],
      )
      return json(request, { tree, truncated: false })
    },
  ),

  // Commits list — only the shape listPathCommits reads (the publish
  // receipts, ADR-0033; getLastCommitDate rides the same client).
  http.get(
    "https://api.github.com/repos/:owner/:repo/commits",
    ({ params, request }) => {
      const repo = `${params.owner}/${params.repo}`
      const url = new URL(request.url)
      const path = url.searchParams.get("path") ?? ""
      const failure = takeFailure(repo, path, "commits")
      if (failure) return failureResponse(failure)
      const ref = url.searchParams.get("sha") ?? "main"
      const file = repos.get(repo)?.get(`${ref}:${path}`)
      if (!file) return new HttpResponse(null, { status: 404 })
      if (!file.lastCommit) return json(request, [])
      return json(request, [
        {
          sha: "0000000000000000000000000000000000000000",
          html_url: `https://github.com/${repo}/commit/0000000`,
          commit: {
            committer: { date: file.lastCommit },
            author: { name: "Steward" },
          },
        },
      ])
    },
  ),
]
