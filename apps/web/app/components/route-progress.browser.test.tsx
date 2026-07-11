import {
  createMemoryRouter,
  Outlet,
  RouterProvider,
  useNavigate,
  useRevalidator,
} from "react-router"
import { describe, expect, it } from "vitest"
import { render } from "vitest-browser-react"

import "../app.css"
import { RouteProgress } from "./route-progress.tsx"
import { SyncIndicator } from "./sync-indicator.tsx"

/**
 * A loader gate so a navigation or revalidation can be held in-flight long
 * enough to observe the chrome, then released. Null gate = pass straight
 * through (the initial load).
 */
let gate: { promise: Promise<void>; release: () => void } | null = null
function hold() {
  let release!: () => void
  const promise = new Promise<void>((r) => (release = r))
  gate = { promise, release }
}
function release() {
  gate?.release()
  gate = null
}
async function gatedLoader() {
  if (gate) await gate.promise
  return null
}

function Layout() {
  const revalidator = useRevalidator()
  const navigate = useNavigate()
  return (
    <>
      <RouteProgress />
      <SyncIndicator />
      <button type="button" onClick={() => void revalidator.revalidate()}>
        revalidate
      </button>
      <button type="button" onClick={() => void navigate("/other")}>
        navigate
      </button>
      <Outlet />
    </>
  )
}

const bar = () => document.querySelector("div.fixed.top-0.z-50")
const dotOpacity = () => {
  const dot = document.querySelector("span.rounded-full")
  return dot ? getComputedStyle(dot).opacity : null
}

async function setup() {
  gate = null
  const router = createMemoryRouter([
    {
      path: "/",
      Component: Layout,
      children: [
        { index: true, loader: gatedLoader, Component: () => null },
        { path: "other", loader: gatedLoader, Component: () => null },
      ],
    },
  ])
  await render(<RouterProvider router={router} />)
}

describe("RouteProgress vs SyncIndicator", () => {
  it("is quiet at rest — no top bar, dot faded out", async () => {
    await setup()
    await expect
      .poll(() => document.querySelector("button")?.textContent)
      .toBeTruthy()
    expect(bar()).toBeNull()
    expect(dotOpacity()).toBe("0")
  })

  it("a background revalidation lights the dot, never the top bar", async () => {
    await setup()
    await expect.poll(() => dotOpacity()).toBe("0")

    hold()
    document.querySelectorAll("button")[0]?.click() // revalidate

    // Dot fades in; the viewport-wide bar stays absent throughout.
    await expect.poll(() => dotOpacity()).toBe("1")
    expect(bar()).toBeNull()

    release()
    // Settles back to invisible after the linger + fade.
    await expect.poll(() => dotOpacity(), { timeout: 2000 }).toBe("0")
  })

  it("a navigation shows the top bar, never the dot", async () => {
    await setup()
    await expect.poll(() => dotOpacity()).toBe("0")

    hold()
    document.querySelectorAll("button")[1]?.click() // navigate

    // The page is held inert → the top bar appears; the background-only dot
    // stays dark (revalidator idle during a navigation).
    await expect.poll(() => bar()).not.toBeNull()
    expect(dotOpacity()).toBe("0")

    release()
    // Bar fills and fades once the loader lands.
    await expect.poll(() => bar(), { timeout: 2000 }).toBeNull()
  })
})
