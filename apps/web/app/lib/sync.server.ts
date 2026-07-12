import type { SyncKind } from "./draft.ts"
import {
  createBranch,
  createPullRequest,
  getFile,
  GitHubError,
  putFile,
} from "./github.server.ts"

/**
 * One file the sync writes: the serialized YAML plus the blob SHA the draft
 * was made against (null → the file didn't exist). ADR-0003.
 */
export interface SyncChange {
  kind: SyncKind
  path: string
  yaml: string
  baseSha: string | null
}

/**
 * The result of persisting a draft. A commit returns the authoritative new
 * blob SHAs so the client can carry its base forward without waiting for the
 * contents API to catch up (it lags a just-made commit); a PR leaves main
 * untouched, so there are no new base SHAs to hand back. A conflict names the
 * files whose base moved — and, for a commit that got partway through before a
 * later file raced, the SHAs that *did* land so a retry doesn't false-conflict.
 */
export type SyncOutcome =
  | { ok: true; newShas: Partial<Record<SyncKind, string>> }
  | { ok: true; prUrl: string }
  | {
      ok: false
      conflicts: SyncKind[]
      committed: Partial<Record<SyncKind, string>>
    }

/**
 * Persist a draft (ADR-0003): direct commit to main (default) or a
 * `dash/config-<timestamp>` branch plus PR. Detects a moved base via blob
 * SHAs — a mismatch is a conflict, never a silent overwrite — and reports the
 * new SHAs so the client's base stays honest across the contents-API lag.
 */
export async function performSync(
  token: string,
  repo: string,
  input: { intent: "commit" | "pr"; changes: SyncChange[] },
): Promise<SyncOutcome> {
  const { intent, changes } = input

  // Stale-base pre-check against main. The same read yields the current blob
  // SHA the update PUT needs.
  const conflicts: SyncKind[] = []
  const currentShas = new Map<SyncKind, string | undefined>()
  await Promise.all(
    changes.map(async (change) => {
      const current = await getFile(token, repo, change.path, "main")
      currentShas.set(change.kind, current?.sha)
      if ((current?.sha ?? null) !== change.baseSha) conflicts.push(change.kind)
    }),
  )
  if (conflicts.length > 0) return { ok: false, conflicts, committed: {} }

  let branch = "main"
  if (intent === "pr") {
    branch = `dash/config-${Date.now()}`
    await createBranch(token, repo, branch, "main")
  }

  // Sequential: two files → two commits; parallel PUTs to one branch race on
  // the head and GitHub rejects the loser.
  const newShas: Partial<Record<SyncKind, string>> = {}
  for (const change of changes) {
    try {
      const { contentSha } = await putFile(token, repo, change.path, {
        content: change.yaml,
        message: `config: update ${change.kind} via steward`,
        branch,
        sha: currentShas.get(change.kind),
      })
      newShas[change.kind] = contentSha
    } catch (error) {
      // A direct commit lands earlier files on main sequentially, so once any
      // write has landed we must never drop those SHAs — otherwise the client
      // retries against a stale base and the file it already committed
      // false-conflicts. Report the partial commit for the failing file:
      //  - 409: a genuine moved base (the PUT's atomic SHA check, or the
      //    pre-check lagging a just-made commit) — the client re-applies.
      //  - any other error after a partial write (5xx / network — the write
      //    may or may not have landed): surface it as a conflict on the failed
      //    file so the client folds what did commit and the retry's pre-check
      //    settles the ambiguous one either way, instead of a bare 500 that
      //    strands a half-committed draft.
      // A PR only ever wrote to its branch, so main is untouched — nothing to
      // report, and a mid-branch failure should surface as the error it is.
      const isConflict = error instanceof GitHubError && error.status === 409
      const landed = intent === "commit" && Object.keys(newShas).length > 0
      if (isConflict || landed) {
        return {
          ok: false,
          conflicts: [change.kind],
          committed: intent === "commit" ? newShas : {},
        }
      }
      throw error
    }
  }

  if (intent === "pr") {
    const pull = await createPullRequest(token, repo, {
      title: "Steward config update",
      head: branch,
      base: "main",
      body: "Config edits made in the Steward dashboard.",
    })
    return { ok: true, prUrl: pull.html_url }
  }
  return { ok: true, newShas }
}
