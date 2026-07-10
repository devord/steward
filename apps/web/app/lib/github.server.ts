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

async function gh(token: string, path: string, init?: RequestInit) {
  // GitHub's API intermittently answers 5xx during incidents. Retrying
  // GETs (idempotent) up to twice usually rides it out; writes are never
  // retried — the caller may have partially succeeded.
  const method = init?.method ?? "GET"
  const attempts = method === "GET" ? 3 : 1
  let res: Response
  for (let attempt = 1; ; attempt++) {
    res = await fetch(`${API}${path}`, {
      // A hung GitHub call would otherwise block the loader indefinitely.
      signal: AbortSignal.timeout(15_000),
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    })
    if (res.status < 500 || attempt >= attempts) return res
    await new Promise((resolve) => setTimeout(resolve, 250 * attempt))
  }
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

export async function repoExists(token: string, repo: string) {
  const res = await gh(token, `/repos/${repo}`)
  return res.ok
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
