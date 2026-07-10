import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { seedRepo } from "../mocks/github.ts"
import { server } from "../mocks/setup-node.ts"
import { getFile } from "./github.server.ts"
import { performSync } from "./sync.server.ts"

const REPO = "daniel/bulletin-data-daniel"
const ROUTINES = "routines:\n  - slug: a\n    name: A\n    instructions: x\n"
const DASHBOARD = "grid:\n  columns: 4\n  rowHeight: 150\nwidgets: []\n"

describe("performSync", () => {
  it("commits and returns newShas that match a follow-up read", async () => {
    seedRepo(REPO, { "data/routines.yaml": ROUTINES })
    const before = await getFile("token", REPO, "data/routines.yaml", "main")
    const updated = "routines: []\n"

    const outcome = await performSync("token", REPO, {
      intent: "commit",
      changes: [
        {
          kind: "routines",
          path: "data/routines.yaml",
          yaml: updated,
          baseSha: before?.sha ?? null,
        },
      ],
    })

    expect(outcome.ok).toBe(true)
    const newShas = (outcome as { newShas: Record<string, string> }).newShas
    const after = await getFile("token", REPO, "data/routines.yaml", "main")
    expect(after?.text).toBe(updated)
    // The SHA handed back is authoritative — a later read agrees with it.
    expect(after?.sha).toBe(newShas.routines)
  })

  it("creates a file that didn't exist and returns its SHA", async () => {
    seedRepo(REPO, {})

    const outcome = await performSync("token", REPO, {
      intent: "commit",
      changes: [
        {
          kind: "dashboard",
          path: "data/dashboards/main.yaml",
          yaml: DASHBOARD,
          baseSha: null,
        },
      ],
    })

    expect(outcome.ok).toBe(true)
    const after = await getFile(
      "token",
      REPO,
      "data/dashboards/main.yaml",
      "main",
    )
    expect(after?.text).toBe(DASHBOARD)
  })

  it("rejects a stale base without touching the repo", async () => {
    seedRepo(REPO, { "data/routines.yaml": ROUTINES })

    const outcome = await performSync("token", REPO, {
      intent: "commit",
      changes: [
        {
          kind: "routines",
          path: "data/routines.yaml",
          yaml: "routines: []\n",
          baseSha: "sha:main:data/routines.yaml:staleaaaaaaaa",
        },
      ],
    })

    expect(outcome).toEqual({
      ok: false,
      conflicts: ["routines"],
      committed: {},
    })
    // The commit never happened — the repo still holds the original.
    const after = await getFile("token", REPO, "data/routines.yaml", "main")
    expect(after?.text).toBe(ROUTINES)
  })

  it("reports the already-committed file when a later PUT races", async () => {
    seedRepo(REPO, {
      "data/routines.yaml": ROUTINES,
      "data/dashboards/main.yaml": DASHBOARD,
    })
    const r = await getFile("token", REPO, "data/routines.yaml", "main")
    const d = await getFile("token", REPO, "data/dashboards/main.yaml", "main")
    // The second file's PUT loses a head race — GitHub answers 409.
    server.use(
      http.put(
        "https://api.github.com/repos/:owner/:repo/contents/data/dashboards/main.yaml",
        () => new HttpResponse(null, { status: 409 }),
      ),
    )

    const outcome = await performSync("token", REPO, {
      intent: "commit",
      changes: [
        {
          kind: "routines",
          path: "data/routines.yaml",
          yaml: "routines: []\n",
          baseSha: r?.sha ?? null,
        },
        {
          kind: "dashboard",
          path: "data/dashboards/main.yaml",
          yaml: `${DASHBOARD}\n`,
          baseSha: d?.sha ?? null,
        },
      ],
    })

    expect(outcome.ok).toBe(false)
    const conflict = outcome as {
      conflicts: string[]
      committed: Record<string, string>
    }
    expect(conflict.conflicts).toEqual(["dashboard"])
    // The routines file did land first — its SHA comes back so a retry
    // doesn't false-conflict on it.
    expect(conflict.committed.routines).toBeDefined()
  })

  it("surfaces the committed file when a later PUT fails with a non-409 error", async () => {
    seedRepo(REPO, {
      "data/routines.yaml": ROUTINES,
      "data/dashboards/main.yaml": DASHBOARD,
    })
    const r = await getFile("token", REPO, "data/routines.yaml", "main")
    const d = await getFile("token", REPO, "data/dashboards/main.yaml", "main")
    // The second file's PUT hits a 5xx after the first already landed on main.
    server.use(
      http.put(
        "https://api.github.com/repos/:owner/:repo/contents/data/dashboards/main.yaml",
        () => new HttpResponse(null, { status: 500 }),
      ),
    )

    const outcome = await performSync("token", REPO, {
      intent: "commit",
      changes: [
        {
          kind: "routines",
          path: "data/routines.yaml",
          yaml: "routines: []\n",
          baseSha: r?.sha ?? null,
        },
        {
          kind: "dashboard",
          path: "data/dashboards/main.yaml",
          yaml: `${DASHBOARD}\n`,
          baseSha: d?.sha ?? null,
        },
      ],
    })

    expect(outcome.ok).toBe(false)
    const conflict = outcome as {
      conflicts: string[]
      committed: Record<string, string>
    }
    expect(conflict.conflicts).toEqual(["dashboard"])
    // The routines write landed before the 500 — its SHA must not be lost, or
    // the retry would false-conflict on a file the client already committed.
    expect(conflict.committed.routines).toBeDefined()
  })

  it("rethrows when the very first PUT fails and nothing has landed", async () => {
    seedRepo(REPO, { "data/routines.yaml": ROUTINES })
    const r = await getFile("token", REPO, "data/routines.yaml", "main")
    server.use(
      http.put(
        "https://api.github.com/repos/:owner/:repo/contents/data/routines.yaml",
        () => new HttpResponse(null, { status: 500 }),
      ),
    )

    // Nothing committed → a bare failure, not a spurious partial-commit report.
    await expect(
      performSync("token", REPO, {
        intent: "commit",
        changes: [
          {
            kind: "routines",
            path: "data/routines.yaml",
            yaml: "routines: []\n",
            baseSha: r?.sha ?? null,
          },
        ],
      }),
    ).rejects.toThrow()
  })
})
