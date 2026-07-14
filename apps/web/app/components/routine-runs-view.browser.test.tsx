import { createMemoryRouter, RouterProvider } from "react-router"
import { afterEach, describe, expect, it, vi } from "vitest"
import { render } from "vitest-browser-react"

import type { Routine } from "@steward/schema"

import "../app.css"
import type { ArtifactInfo, RoutineRuns } from "../lib/dashboard.server.ts"
import type { RunReceipt } from "../lib/runs.ts"
import { RoutineRunsView } from "./routine-runs-view.tsx"

const NOW = 1_770_000_000_000
const HOUR = 3_600_000

const HOME_REPO = "alice/steward-data"

// A scheduled cloud routine on a 4h cron, placed on `main`.
const pulse: Routine = {
  slug: "corza-pulse",
  name: "Corza Pulse",
  template: "custom",
  enabled: true,
  schedule: "0 */4 * * *",
}

function receipt(hoursAgo: number): RunReceipt {
  return {
    sha: `${hoursAgo}abc0000deadbeef`,
    htmlUrl: `https://github.com/${HOME_REPO}/commit/${hoursAgo}abc`,
    at: new Date(NOW - hoursAgo * HOUR).toISOString(),
    author: "Claude",
  }
}

// Newest-first: a healthy 4h gap, then a 16h hole (missed fires), then the
// first receipt we can see.
const newest = receipt(2)
const receipts = [newest, receipt(6), receipt(22)]

const artifact: ArtifactInfo = {
  html: "<p>ok</p>",
  sha: "a1",
  lastRunAt: newest.at,
  hasTrigger: true,
  routineId: "trig_pulse_123",
  claudeAccount: "alice@example.org",
}

async function renderView(over: {
  runs?: RoutineRuns
  artifact?: ArtifactInfo
  routine?: Routine
  boards?: string[]
}) {
  const routine = over.routine ?? pulse
  const view = (
    <RoutineRunsView
      repo={{ full: HOME_REPO, name: "steward-data", isShared: false }}
      homeRepo={HOME_REPO}
      sidebar={{ repos: [], complete: true, degraded: false }}
      login="alice"
      displayName="Alice"
      now={NOW}
      routine={routine}
      boards={over.boards ?? ["main"]}
      artifacts={Promise.resolve({ [routine.slug]: over.artifact ?? artifact })}
      runs={Promise.resolve(over.runs ?? { receipts, capped: false })}
    />
  )
  const router = createMemoryRouter([{ path: "/", element: view }])
  await render(<RouterProvider router={router} />)
}

/** The streamed payloads resolve after paint — wait for the table body. */
async function waitForText(text: string) {
  await vi.waitFor(() =>
    expect(document.body.textContent ?? "").toContain(text),
  )
}

/** Stub the version resource route so opening a run resolves an artifact body
    without a real request. Returns the mock to assert the fetched URL. */
function stubVersionFetch(html = "<p>version body</p>") {
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify({ html }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  )
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function byText(tag: string, text: string) {
  return [...document.querySelectorAll<HTMLElement>(tag)].find(
    (el) => el.textContent?.trim() === text,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe("RoutineRunsView", () => {
  it("shows the routine's facts: schedule, host, owner, account, boards", async () => {
    await renderView({})
    await waitForText("alice@example.org")
    const text = document.body.textContent ?? ""
    expect(text).toContain("Corza Pulse")
    expect(text).toContain("0 */4 * * *")
    expect(text).toContain("cloud")
    // The home repo's `main` board resolves to "/" — pick it by its label,
    // since the chrome's wordmark links there too.
    const boardLink = [...document.querySelectorAll("a")].find(
      (a) => a.textContent?.trim() === "main",
    )
    expect(boardLink?.getAttribute("href")).toBe("/")
  })

  it("lists each receipt with relative time, gap, author, and commit link", async () => {
    await renderView({})
    await waitForText("first run")
    const text = document.body.textContent ?? ""
    // Newest ran 2h ago after a healthy 4h gap; the 16h hole is called late.
    expect(text).toContain("2h ago")
    expect(text).toContain("4h")
    expect(text).toContain("16h")
    expect(text).toContain("late")
    expect(text).toContain("Claude")
    const commitLink = [...document.querySelectorAll("a")].find((a) =>
      a.getAttribute("href")?.includes("/commit/"),
    )
    expect(commitLink).toBeDefined()
  })

  it("links out to the routine on claude.ai when the trigger id is known", async () => {
    await renderView({})
    await vi.waitFor(() => {
      const link = [...document.querySelectorAll("a")].find(
        (a) =>
          a.getAttribute("href") ===
          "https://claude.ai/code/routines/trig_pulse_123",
      )
      expect(link).toBeDefined()
    })
  })

  it("omits every claude.ai affordance without a trigger id", async () => {
    await renderView({
      artifact: { html: "<p>ok</p>", sha: "a1", lastRunAt: newest.at },
      runs: { receipts, capped: false },
    })
    await waitForText("first run")
    const claude = [...document.querySelectorAll("a")].find((a) =>
      a.getAttribute("href")?.includes("claude.ai"),
    )
    expect(claude).toBeUndefined()
  })

  it("says so when nothing has ever published", async () => {
    await renderView({ runs: { receipts: [], capped: false } })
    await waitForText("No runs yet")
  })

  it("degrades to a retry line when the history read flaked", async () => {
    await renderView({
      runs: { receipts: [], capped: false, unreachable: true },
    })
    await waitForText("GitHub unreachable")
  })

  it("labels a capped listing as the last N runs", async () => {
    await renderView({ runs: { receipts, capped: true } })
    await waitForText("last 3 runs")
  })

  it("opens a run's published artifact in a full-size frame", async () => {
    const fetchMock = stubVersionFetch("<p>old render</p>")
    await renderView({})
    await waitForText("first run")

    // The newest run ran 2h ago — its row's time is the door to its render.
    const ranButton = [...document.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("2h ago"),
    )
    ranButton?.click()

    await vi.waitFor(() => {
      const frame = [...document.querySelectorAll("iframe")].find(
        (f) => f.getAttribute("title") === "Corza Pulse",
      )
      expect(frame).toBeDefined()
    })
    // Fetched from the resource route at that receipt's commit.
    expect(fetchMock).toHaveBeenCalledWith(
      "/r/alice/steward-data/routines/corza-pulse/at/2abc0000deadbeef",
      expect.anything(),
    )
  })

  it("compares two runs side by side with a GitHub text-diff link", async () => {
    stubVersionFetch()
    await renderView({})
    await waitForText("first run")

    byText("button", "Compare")?.click()

    await vi.waitFor(() => {
      const boxes = document.querySelectorAll(
        '[aria-label="Select this run to compare"]',
      )
      expect(boxes.length).toBe(3)
    })
    const boxes = [
      ...document.querySelectorAll<HTMLElement>(
        '[aria-label="Select this run to compare"]',
      ),
    ]
    boxes[0].click() // newest (2h, sha 2abc…)
    boxes[1].click() // older (6h, sha 6abc…)

    await vi.waitFor(() => {
      const open = byText("button", "Compare runs")
      expect(open?.hasAttribute("disabled")).toBe(false)
    })
    byText("button", "Compare runs")?.click()

    await vi.waitFor(() => {
      const diff = [...document.querySelectorAll("a")].find((a) =>
        a.getAttribute("href")?.includes("/compare/"),
      )
      expect(diff).toBeDefined()
    })
    // Older on the left → the compare range is older...newer.
    const diff = [...document.querySelectorAll("a")].find((a) =>
      a.getAttribute("href")?.includes("/compare/"),
    )
    expect(diff?.getAttribute("href")).toBe(
      "https://github.com/alice/steward-data/compare/6abc0000deadbeef...2abc0000deadbeef",
    )
    const text = document.body.textContent ?? ""
    expect(text).toContain("older")
    expect(text).toContain("newer")
  })
})
