import { z } from "zod"

/**
 * Thin GitHub REST client. Every call runs with the signed-in user's token —
 * GitHub itself enforces that a token can't read someone else's private data
 * repo (ADR-0001). No SDK: the app touches a handful of endpoints, each
 * response validated against the slice of the shape it actually uses.
 */
const API = "https://api.github.com"

export class GitHubError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

/**
 * Per-instance ETag cache for GET requests. Every repeat read replays the
 * stored validator as `If-None-Match`; GitHub then answers **304 Not
 * Modified** — which returns no body and, crucially, does not count against
 * the 5,000/hr per-user rate limit (a dashboard with N widgets otherwise
 * burns ~4 + 2N requests per page load). Validation is always live, so there
 * is no staleness window: the moment a resource changes, GitHub sends a fresh
 * 200 with a new ETag and the store updates — which is what keeps the sync
 * stale-base SHA check (sync.ts) honest. The cache is a bounded LRU scoped to
 * the caller's token (a token can only ever revalidate its own reads); it
 * lives per warm serverless instance and a cold start simply re-primes it.
 */
interface CacheEntry {
  etag: string
  body: string
}

const etagCache = new Map<string, CacheEntry>()
const MAX_ENTRIES = 500
// Keeps a widget-heavy board's artifacts (contents API caps a file at ~1MB)
// from letting one instance's cache grow without bound.
const MAX_BYTES = 16_000_000
let cachedBytes = 0

function readCache(key: string): CacheEntry | undefined {
  const entry = etagCache.get(key)
  // Re-insert to mark most-recently-used (Map preserves insertion order).
  if (entry) {
    etagCache.delete(key)
    etagCache.set(key, entry)
  }
  return entry
}

function writeCache(key: string, entry: CacheEntry): void {
  const existing = etagCache.get(key)
  if (existing) cachedBytes -= existing.body.length
  etagCache.delete(key)
  etagCache.set(key, entry)
  cachedBytes += entry.body.length
  while (etagCache.size > MAX_ENTRIES || cachedBytes > MAX_BYTES) {
    const oldest = etagCache.keys().next().value
    if (oldest === undefined) break
    cachedBytes -= etagCache.get(oldest)?.body.length ?? 0
    etagCache.delete(oldest)
  }
}

/** Test-only: drop the per-instance cache so cases don't leak ETags. */
export function __resetGitHubCache(): void {
  etagCache.clear()
  cachedBytes = 0
}

// Every cacheable GitHub GET we make answers JSON; a replayed body is served
// back through this so callers' res.json()/res.ok paths behave identically.
function jsonResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

async function gh(token: string, path: string, init?: RequestInit) {
  // GitHub's API intermittently answers 5xx during incidents. Retrying
  // GETs (idempotent) up to twice usually rides it out; writes are never
  // retried — the caller may have partially succeeded.
  const method = init?.method ?? "GET"
  const attempts = method === "GET" ? 3 : 1
  // Only GETs are cached; writes must never be revalidated or replayed.
  const cacheKey = method === "GET" ? `${token}\0${path}` : undefined
  const cached = cacheKey ? readCache(cacheKey) : undefined
  // A hung GitHub call would otherwise block the loader indefinitely. Compose
  // the timeout with any caller signal (loader cancellation) rather than let
  // `...init` clobber one with the other — both must be able to abort.
  const timeout = AbortSignal.timeout(15_000)
  const signal = init?.signal
    ? AbortSignal.any([init.signal, timeout])
    : timeout
  let res: Response
  for (let attempt = 1; ; attempt++) {
    try {
      res = await fetch(`${API}${path}`, {
        ...init,
        signal,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(cached ? { "If-None-Match": cached.etag } : {}),
          ...(init?.body ? { "Content-Type": "application/json" } : {}),
          ...init?.headers,
        },
      })
    } catch (cause) {
      // An abort is terminal, not transient: retrying a caller cancellation
      // ignores their intent, and each timeout retry is another 15s hang on
      // the request path. Surface it (still a GitHubError, so callers degrade
      // to a 503 rather than the generic crash) without burning retries.
      const aborted =
        cause instanceof Error &&
        (cause.name === "AbortError" || cause.name === "TimeoutError")
      // Every other throw — dropped connection, DNS blip — is the transient
      // class the 5xx retry rides out, so retry GETs the same way.
      if (aborted || attempt >= attempts) {
        throw new GitHubError(503, `${path} → request failed: ${String(cause)}`)
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * attempt))
      continue
    }
    if (res.status < 500 || attempt >= attempts) break
    await new Promise((resolve) => setTimeout(resolve, 250 * attempt))
  }

  if (!cacheKey) return res
  // 304: GitHub confirms the stored representation is still current.
  if (res.status === 304 && cached) return jsonResponse(cached.body)
  // 200 with a validator: refresh the store, hand back a replayable copy.
  const etag = res.status === 200 ? res.headers.get("ETag") : null
  if (etag) {
    const body = await res.text()
    writeCache(cacheKey, { etag, body })
    return jsonResponse(body)
  }
  return res
}

/** Encode a repo-relative path for the contents API, keeping `/` separators. */
function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/")
}

async function ghJson<T>(
  token: string,
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const res = await gh(token, path, init)
  if (!res.ok) {
    const body = await res.text()
    throw new GitHubError(res.status, `${path} → ${res.status}: ${body}`)
  }
  return schema.parse(await res.json())
}

const userSchema = z.object({
  login: z.string(),
  name: z.string().nullable(),
  avatar_url: z.string(),
})

export type GitHubUser = z.infer<typeof userSchema>

export function getAuthedUser(token: string): Promise<GitHubUser> {
  return ghJson(token, "/user", userSchema)
}

const repoListSchema = z.array(z.object({ full_name: z.string() }))

/**
 * The viewer's repos (owned + collaborator + org), most recently pushed
 * first — the suggestion pool for the wizard's repo typeahead (ADR-0020).
 * Two pages ≈ 200 repos: recent activity is what people pick from; anything
 * beyond that is still reachable by typing the full owner/repo. Both pages
 * are ETag-cached like every other GET here.
 */
export async function listUserRepos(token: string): Promise<string[]> {
  const pages = await Promise.all(
    [1, 2].map((page) =>
      ghJson(
        token,
        `/user/repos?per_page=100&sort=pushed&page=${page}`,
        repoListSchema,
      ),
    ),
  )
  return pages.flat().map((repo) => repo.full_name)
}

const contentsSchema = z.object({ content: z.string(), sha: z.string() })

export interface RepoFile {
  text: string
  sha: string
}

/**
 * Fetch one file via the contents API. Returns null for 404 (missing file
 * or missing ref — e.g. a data repo without an artifacts branch yet).
 */
export async function getFile(
  token: string,
  repo: string,
  path: string,
  ref?: string,
): Promise<RepoFile | null> {
  const query = ref ? `?ref=${encodeURIComponent(ref)}` : ""
  const res = await gh(
    token,
    `/repos/${repo}/contents/${encodePath(path)}${query}`,
  )
  if (res.status === 404) return null
  if (!res.ok) {
    throw new GitHubError(res.status, `${repo}/${path} → ${res.status}`)
  }
  // Directories come back as arrays; >1MB files with empty content. Fail as
  // a GitHubError like every other path here, not a bare ZodError.
  const parsed = contentsSchema.safeParse(await res.json())
  if (!parsed.success) {
    throw new GitHubError(
      422,
      `${repo}/${path} is not a regular file readable via the contents API (directory or >1MB?)`,
    )
  }
  const { content, sha } = parsed.data
  return { text: Buffer.from(content, "base64").toString("utf8"), sha }
}

const commitsSchema = z.array(
  z.object({
    commit: z.object({
      committer: z.object({ date: z.string() }).nullable(),
    }),
  }),
)

/** ISO date of the last commit touching `path` on `ref`, or null. */
export async function getLastCommitDate(
  token: string,
  repo: string,
  path: string,
  ref: string,
): Promise<string | null> {
  const search = new URLSearchParams({ path, sha: ref, per_page: "1" })
  const res = await gh(token, `/repos/${repo}/commits?${search}`)
  // 404: no such ref; 409: empty repository — both mean "never ran".
  if (res.status === 404 || res.status === 409) return null
  if (!res.ok) {
    throw new GitHubError(res.status, `${repo} commits → ${res.status}`)
  }
  const [first] = commitsSchema.parse(await res.json())
  return first?.commit.committer?.date ?? null
}

/**
 * Whether the token can see `repo`. Only a definitive 404 (absent, or private
 * and invisible to this token) is a real "no"; every other non-2xx — a 5xx, a
 * rate-limit 403, a network blip surfaced by `gh` as a GitHubError — is
 * transient and re-thrown, so callers degrade to a 503 refresh page instead of
 * crashing or falsely concluding the repo is missing (ADR: degrade, not crash).
 */
export async function repoExists(
  token: string,
  repo: string,
): Promise<boolean> {
  const res = await gh(token, `/repos/${repo}`)
  if (res.ok) return true
  if (res.status === 404) return false
  throw new GitHubError(res.status, `${repo} → ${res.status}`)
}

const dirEntriesSchema = z.array(
  z.object({ name: z.string(), type: z.string(), sha: z.string() }),
)

export type DirEntry = z.infer<typeof dirEntriesSchema>[number]

/**
 * List a directory via the contents API. Returns null for 404 (missing dir,
 * ref, or repo the token can't see) so callers can degrade instead of crash.
 */
export async function listDirectory(
  token: string,
  repo: string,
  path: string,
  ref?: string,
): Promise<DirEntry[] | null> {
  const query = ref ? `?ref=${encodeURIComponent(ref)}` : ""
  const res = await gh(
    token,
    `/repos/${repo}/contents/${encodePath(path)}${query}`,
  )
  if (res.status === 404) return null
  if (!res.ok) {
    throw new GitHubError(res.status, `${repo}/${path} → ${res.status}`)
  }
  const parsed = dirEntriesSchema.safeParse(await res.json())
  if (!parsed.success) {
    throw new GitHubError(422, `${repo}/${path} is not a directory`)
  }
  return parsed.data
}

const treeSchema = z.object({
  tree: z.array(z.object({ path: z.string(), type: z.string() })),
  truncated: z.boolean(),
})

/**
 * Every blob path in the repo's default branch, in one ETag-cached call —
 * how skill discovery finds SKILL.md files across arbitrary layouts
 * (`.claude/skills/` in data repos, `<plugin>/skills/` in the plugins
 * marketplace) without walking directories (ADR-0015). Returns null for
 * 404/409 (no repo, no access, empty repo) so discovery can degrade.
 */
export async function listTreePaths(
  token: string,
  repo: string,
): Promise<string[] | null> {
  const res = await gh(token, `/repos/${repo}/git/trees/HEAD?recursive=1`)
  if (res.status === 404 || res.status === 409) return null
  if (!res.ok) {
    throw new GitHubError(res.status, `${repo} tree → ${res.status}`)
  }
  const parsed = treeSchema.safeParse(await res.json())
  if (!parsed.success) {
    throw new GitHubError(422, `${repo} tree → unexpected payload`)
  }
  // GitHub caps recursive trees (100k entries / 7MB) and flags the cut with
  // `truncated` instead of paginating — a partial listing would silently
  // drop skills, so fail the source loudly and let the caller degrade.
  if (parsed.data.truncated) {
    throw new GitHubError(422, `${repo} tree → truncated by GitHub`)
  }
  return parsed.data.tree
    .filter((entry) => entry.type === "blob")
    .map((entry) => entry.path)
}

/** Delete a file on a branch (dashboard deletion). */
export async function deleteFile(
  token: string,
  repo: string,
  path: string,
  options: { message: string; sha: string; branch: string },
): Promise<void> {
  await ghJson(
    token,
    `/repos/${repo}/contents/${encodePath(path)}`,
    z.unknown(),
    {
      method: "DELETE",
      body: JSON.stringify(options),
    },
  )
}

/** First-run wizard: create the private data repo from the template. */
export async function generateFromTemplate(
  token: string,
  templateRepo: string,
  owner: string,
  name: string,
): Promise<void> {
  await ghJson(token, `/repos/${templateRepo}/generate`, z.unknown(), {
    method: "POST",
    body: JSON.stringify({
      owner,
      name,
      private: true,
      description: "Bulletin data repo — config on main, artifacts branch",
    }),
  })
}

const putResultSchema = z.object({ content: z.object({ sha: z.string() }) })

/** Create or update a file on a branch (sync commit path, ADR-0003). */
export async function putFile(
  token: string,
  repo: string,
  path: string,
  options: {
    content: string
    message: string
    branch: string
    /** Required when updating; omit when creating. */
    sha?: string
  },
): Promise<{ contentSha: string }> {
  const result = await ghJson(
    token,
    `/repos/${repo}/contents/${encodePath(path)}`,
    putResultSchema,
    {
      method: "PUT",
      body: JSON.stringify({
        message: options.message,
        content: Buffer.from(options.content, "utf8").toString("base64"),
        branch: options.branch,
        ...(options.sha ? { sha: options.sha } : {}),
      }),
    },
  )
  return { contentSha: result.content.sha }
}

const refSchema = z.object({ object: z.object({ sha: z.string() }) })

/** Create `branch` pointing at the current head of `fromBranch`. */
export async function createBranch(
  token: string,
  repo: string,
  branch: string,
  fromBranch: string,
): Promise<void> {
  const head = await ghJson(
    token,
    `/repos/${repo}/git/ref/heads/${fromBranch}`,
    refSchema,
  )
  await ghJson(token, `/repos/${repo}/git/refs`, z.unknown(), {
    method: "POST",
    body: JSON.stringify({
      ref: `refs/heads/${branch}`,
      sha: head.object.sha,
    }),
  })
}

const pullSchema = z.object({ html_url: z.string() })

export function createPullRequest(
  token: string,
  repo: string,
  options: { title: string; head: string; base: string; body?: string },
): Promise<{ html_url: string }> {
  return ghJson(token, `/repos/${repo}/pulls`, pullSchema, {
    method: "POST",
    body: JSON.stringify(options),
  })
}
