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

interface Failure {
  status: number
  /** Remaining failures; Infinity → fail every attempt. */
  times: number
}

/** `${repo}:${path}` → injected failure for contents/commits requests. */
const failures = new Map<string, Failure>()

export function resetGitHub() {
  repos.clear()
  failures.clear()
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

/** Make the next `times` contents/commits requests for `path` fail. */
export function failPath(
  repo: string,
  path: string,
  { status = 500, times = Infinity } = {},
) {
  failures.set(`${repo}:${path}`, { status, times })
}

function takeFailure(repo: string, path: string): Failure | null {
  const failure = failures.get(`${repo}:${path}`)
  if (!failure || failure.times <= 0) return null
  failure.times -= 1
  return failure
}

export const githubHandlers = [
  // repoExists probe.
  http.get("https://api.github.com/repos/:owner/:repo", ({ params }) => {
    const repo = `${params.owner}/${params.repo}`
    if (!repos.has(repo)) return new HttpResponse(null, { status: 404 })
    return HttpResponse.json({ full_name: repo })
  }),

  // Contents API — single file, base64 payload.
  http.get(
    "https://api.github.com/repos/:owner/:repo/contents/*",
    ({ params, request }) => {
      const repo = `${params.owner}/${params.repo}`
      const url = new URL(request.url)
      const path = decodeURIComponent(
        url.pathname.replace(`/repos/${repo}/contents/`, ""),
      )
      const failure = takeFailure(repo, path)
      if (failure) return new HttpResponse(null, { status: failure.status })
      const ref = url.searchParams.get("ref") ?? "main"
      const file = repos.get(repo)?.get(`${ref}:${path}`)
      if (!file) return new HttpResponse(null, { status: 404 })
      return HttpResponse.json({
        content: Buffer.from(file.text, "utf8").toString("base64"),
        sha: `sha:${ref}:${path}`,
      })
    },
  ),

  // Commits list — only the shape getLastCommitDate reads.
  http.get(
    "https://api.github.com/repos/:owner/:repo/commits",
    ({ params, request }) => {
      const repo = `${params.owner}/${params.repo}`
      const url = new URL(request.url)
      const path = url.searchParams.get("path") ?? ""
      const failure = takeFailure(repo, path)
      if (failure) return new HttpResponse(null, { status: failure.status })
      const ref = url.searchParams.get("sha") ?? "main"
      const file = repos.get(repo)?.get(`${ref}:${path}`)
      if (!file) return new HttpResponse(null, { status: 404 })
      if (!file.lastCommit) return HttpResponse.json([])
      return HttpResponse.json([
        { commit: { committer: { date: file.lastCommit } } },
      ])
    },
  ),
]
