import { createHash } from "node:crypto"

import { http, HttpResponse } from "msw"

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

type Endpoint = "contents" | "commits"

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
 * How the last requests resolved, so tests can assert the ETag path: `full`
 * counts 200s that shipped a body, `conditional` counts 304s answered from a
 * replayed `If-None-Match`.
 */
export const githubStats = { full: 0, conditional: 0 }

export function resetGitHub() {
  repos.clear()
  failures.clear()
  githubStats.full = 0
  githubStats.conditional = 0
}

/** Deterministic content-derived validator — matches only identical bodies. */
function etagFor(body: string): string {
  return `"${createHash("sha1").update(body).digest("hex")}"`
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
  // repoExists probe.
  http.get(
    "https://api.github.com/repos/:owner/:repo",
    ({ params, request }) => {
      const repo = `${params.owner}/${params.repo}`
      if (!repos.has(repo)) return new HttpResponse(null, { status: 404 })
      return json(request, { full_name: repo })
    },
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
        sha: `sha:${ref}:${path}`,
      })
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

  // Commits list — only the shape getLastCommitDate reads.
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
        { commit: { committer: { date: file.lastCommit } } },
      ])
    },
  ),
]
