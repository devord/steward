import type { Routine, Widget } from "@bulletin/schema"
import { describe, expect, it } from "vitest"
import { createMemoryRouter, RouterProvider } from "react-router"
import { render } from "vitest-browser-react"

import "../app.css"
import type { ArtifactInfo } from "../lib/dashboard.server.ts"
import { WidgetCard } from "./widget-card.tsx"

const widget: Widget = {
  routine: "r",
  position: { col: 1, row: 1 },
  size: { cols: 2, rows: 2 },
}

function routine(over: Partial<Routine> = {}): Routine {
  return {
    slug: "r",
    name: "R",
    template: "custom",
    enabled: true,
    instructions: "x",
    ...over,
  }
}

/** UpdateAction calls useFetcher, which needs a data router in context. */
async function renderCard(ui: React.ReactElement) {
  const router = createMemoryRouter([{ path: "/", element: ui }])
  await render(<RouterProvider router={router} />)
}

const hasText = (text: string) =>
  document.body.textContent?.includes(text) ?? false

const artifact = (over: Partial<ArtifactInfo> = {}): ArtifactInfo => ({
  html: null,
  sha: null,
  lastRunAt: null,
  ...over,
})

describe("WidgetCard empty states", () => {
  it("shows the draft hint for an uncommitted routine", async () => {
    await renderCard(
      <WidgetCard
        widget={widget}
        routine={routine()}
        artifact={undefined}
        now={Date.now()}
        committed={false}
      />,
    )
    await expect.poll(() => hasText("In your draft")).toBe(true)
  })

  it("shows the trigger setup command when the trigger is missing", async () => {
    await renderCard(
      <WidgetCard
        widget={widget}
        routine={routine()}
        artifact={artifact({ hasTrigger: false })}
        now={Date.now()}
        scope="personal"
        dataRepo="o/r"
        committed
      />,
    )
    await expect.poll(() => hasText("pnpm routines:sync --apply")).toBe(true)
  })

  it("shows the run command for a local manual routine", async () => {
    await renderCard(
      <WidgetCard
        widget={widget}
        routine={routine({ host: "local" })}
        artifact={undefined}
        now={Date.now()}
        scope="personal"
        dataRepo="o/r"
        committed
      />,
    )
    await expect.poll(() => hasText("pnpm routine r")).toBe(true)
  })

  it("offers the first run for a scheduled routine whose trigger exists", async () => {
    await renderCard(
      <WidgetCard
        widget={widget}
        routine={routine({ schedule: "0 */4 * * *" })}
        artifact={artifact({ hasTrigger: true })}
        now={Date.now()}
        scope="personal"
        dataRepo="o/r"
        committed
      />,
    )
    // A real button in the body owns the action — the title-bar refresh icon
    // steps aside (one affordance per action) — and the cron stays visible
    // as the no-cost fallback.
    await expect.poll(() => hasText("Run first update")).toBe(true)
    expect(hasText("or wait for its schedule (0 */4 * * *)")).toBe(true)
    expect(document.querySelector('button[aria-label^="Update"]')).toBeNull()
  })

  it("offers run-now for a manual routine whose trigger exists", async () => {
    await renderCard(
      <WidgetCard
        widget={widget}
        routine={routine()}
        artifact={artifact({ hasTrigger: true })}
        now={Date.now()}
        scope="personal"
        dataRepo="o/r"
        committed
      />,
    )
    await expect.poll(() => hasText("Run now")).toBe(true)
    expect(document.querySelector('button[aria-label^="Update"]')).toBeNull()
  })

  it("fires /run with the board scope and slug when the CTA is clicked", async () => {
    let received: unknown
    let fired = false
    const router = createMemoryRouter([
      {
        path: "/",
        element: (
          <WidgetCard
            widget={widget}
            routine={routine({ schedule: "0 */4 * * *" })}
            artifact={artifact({ hasTrigger: true })}
            now={Date.now()}
            scope="personal"
            dataRepo="o/r"
            committed
            onFired={() => {
              fired = true
            }}
          />
        ),
      },
      {
        path: "/run",
        action: async ({ request }) => {
          received = await request.json()
          return { ok: true }
        },
      },
    ])
    const screen = await render(<RouterProvider router={router} />)

    await screen.getByRole("button", { name: "Run first update" }).click()

    // The action must see the parsed object (scope + slug), and a successful
    // fire reaches the board via onFired — the full useFireRoutine round trip.
    await expect.poll(() => fired).toBe(true)
    expect(received).toEqual({ scope: "personal", slug: "r" })
  })

  it("drops the update button while a run is in flight", async () => {
    await renderCard(
      <WidgetCard
        widget={widget}
        routine={routine()}
        artifact={artifact({ hasTrigger: true })}
        now={Date.now()}
        scope="personal"
        dataRepo="o/r"
        committed
        pendingFiredAt={Date.now()}
      />,
    )
    // A run in flight can't be re-fired, and the "Running" readout already owns
    // the state — the re-run control steps aside rather than sit there disabled.
    await expect.poll(() => hasText("Running")).toBe(true)
    expect(document.querySelector('button[aria-label^="Update"]')).toBeNull()
  })

  it("shows one calm run indicator while running — a pulse dot, no spinner", async () => {
    await renderCard(
      <WidgetCard
        widget={widget}
        routine={routine()}
        artifact={artifact({ html: "<h1>live</h1>", hasTrigger: true })}
        now={Date.now()}
        scope="personal"
        dataRepo="o/r"
        committed
        pendingFiredAt={Date.now()}
      />,
    )
    // The run status is a single breathing dot, not a spinner, and the refresh
    // arrow (the re-run action) is gone — the card never shows two run glyphs.
    await expect.poll(() => hasText("Running")).toBe(true)
    expect(document.querySelectorAll(".run-pulse")).toHaveLength(1)
    expect(document.querySelectorAll(".animate-spin")).toHaveLength(0)
    expect(document.querySelector('button[aria-label^="Update"]')).toBeNull()
  })

  it("offers an Enable button on a disabled tile — not a dead end", async () => {
    let toggled = false
    await renderCard(
      <WidgetCard
        widget={widget}
        routine={routine({ enabled: false })}
        artifact={undefined}
        now={Date.now()}
        scope="personal"
        dataRepo="o/r"
        committed
        onToggleEnabled={() => {
          toggled = true
        }}
      />,
    )
    await expect.poll(() => hasText("Routine disabled")).toBe(true)
    const enable = document.querySelector<HTMLButtonElement>("button")
    expect(enable?.textContent).toContain("Enable")
    enable?.click()
    await expect.poll(() => toggled).toBe(true)
  })

  it("toggles enabled from the edit-mode title bar", async () => {
    let toggled = false
    await renderCard(
      <WidgetCard
        widget={widget}
        routine={routine()}
        artifact={artifact({ html: "<h1>live</h1>" })}
        now={Date.now()}
        scope="personal"
        dataRepo="o/r"
        committed
        editing
        onToggleEnabled={() => {
          toggled = true
        }}
      />,
    )
    // Enabled routine → the control offers to turn it off.
    const btn = document.querySelector<HTMLButtonElement>(
      'button[aria-label^="Disable"]',
    )
    await expect.poll(() => btn != null).toBe(true)
    btn?.click()
    await expect.poll(() => toggled).toBe(true)
  })
})
