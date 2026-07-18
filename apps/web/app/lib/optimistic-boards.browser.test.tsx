import { useState } from "react"
import { userEvent } from "vitest/browser"
import { beforeEach, describe, expect, it } from "vitest"
import { render } from "vitest-browser-react"

import type { SidebarData, SidebarRepo } from "./dashboard.server.ts"
import {
  __resetOptimisticBoards,
  markBoardDeleted,
  useOptimisticSidebar,
} from "./optimistic-boards.ts"

const REPO = "alice/steward-data"
const OTHER = "acme/steward-team"

function repo(full: string, slugs: string[]): SidebarRepo {
  return {
    repo: full,
    name: full.split("/")[1] ?? full,
    displayName: null,
    isHome: full === REPO,
    private: true,
    collaborators: null,
    viewerIsAdmin: true,
    viewerCanPush: true,
    sections: [],
    dashboards: slugs.map((slug) => ({
      slug,
      section: null,
      lastRunAt: null,
      stale: false,
    })),
  }
}

function data(repos: SidebarRepo[]): SidebarData {
  return { repos, complete: true, degraded: false }
}

/** Renders the rail slugs the hook returns, with buttons to delete a board and
    to swap in a fresh server listing (dropping or re-adding the same slug). */
function Harness({ initial }: { initial: SidebarData }) {
  const [source, setSource] = useState(initial)
  const result = useOptimisticSidebar(source)
  const slugs =
    result?.repos.flatMap((r) =>
      r.dashboards.map((b) => `${r.repo}/${b.slug}`),
    ) ?? []
  return (
    <div>
      <button type="button" onClick={() => markBoardDeleted(REPO, "test")}>
        delete
      </button>
      <button
        type="button"
        onClick={() => setSource(data([repo(REPO, ["main"])]))}
      >
        server-drop
      </button>
      <button
        type="button"
        onClick={() => setSource(data([repo(REPO, ["main", "test"])]))}
      >
        server-readd
      </button>
      <ul aria-label="boards">
        {slugs.map((slug) => (
          <li key={slug}>{slug}</li>
        ))}
      </ul>
    </div>
  )
}

describe("useOptimisticSidebar", () => {
  beforeEach(() => {
    __resetOptimisticBoards()
  })

  it("drops a board from the rail the moment it's marked deleted", async () => {
    const screen = await render(
      <Harness initial={data([repo(REPO, ["main", "test"])])} />,
    )
    await expect.element(screen.getByText(`${REPO}/test`)).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "delete" }))

    await expect
      .element(screen.getByText(`${REPO}/test`))
      .not.toBeInTheDocument()
    await expect.element(screen.getByText(`${REPO}/main`)).toBeInTheDocument()
  })

  it("keeps hiding it while the rail is still stale, then forgets it once the server drops it", async () => {
    const screen = await render(
      <Harness initial={data([repo(REPO, ["main", "test"])])} />,
    )
    await userEvent.click(screen.getByRole("button", { name: "delete" }))
    // Still hidden even though the (stale) source listing still contains it.
    await expect
      .element(screen.getByText(`${REPO}/test`))
      .not.toBeInTheDocument()

    // Server catches up — the rail no longer lists it, so reconcile forgets it.
    await userEvent.click(screen.getByRole("button", { name: "server-drop" }))
    await expect
      .element(screen.getByText(`${REPO}/test`))
      .not.toBeInTheDocument()

    // A board later recreated with the same slug is not hidden by a stale
    // pending deletion.
    await userEvent.click(screen.getByRole("button", { name: "server-readd" }))
    await expect.element(screen.getByText(`${REPO}/test`)).toBeInTheDocument()
  })

  it("hides only the matching repo's board, not a same-slug board elsewhere", async () => {
    const screen = await render(
      <Harness
        initial={data([repo(REPO, ["main", "test"]), repo(OTHER, ["test"])])}
      />,
    )
    await userEvent.click(screen.getByRole("button", { name: "delete" }))

    await expect
      .element(screen.getByText(`${REPO}/test`))
      .not.toBeInTheDocument()
    await expect.element(screen.getByText(`${OTHER}/test`)).toBeInTheDocument()
  })
})
