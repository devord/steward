import type { Routine, Widget } from "@steward/schema"
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

  it("commits a draft routine from the Sync-to-commit button", async () => {
    let synced = false
    await renderCard(
      <WidgetCard
        widget={widget}
        routine={routine()}
        artifact={undefined}
        now={Date.now()}
        committed={false}
        onSync={() => {
          synced = true
        }}
      />,
    )
    const sync = document.querySelector<HTMLButtonElement>("button")
    expect(sync?.textContent).toContain("Sync to commit")
    sync?.click()
    await expect.poll(() => synced).toBe(true)
  })

  it("shows the trigger setup command when the trigger is missing", async () => {
    await renderCard(
      <WidgetCard
        widget={widget}
        routine={routine()}
        artifact={artifact({ hasTrigger: false })}
        now={Date.now()}
        dataRepo="o/r"
        committed
      />,
    )
    await expect
      .poll(() => hasText("npx @devord/steward sync --apply"))
      .toBe(true)
  })

  it("shows the run command for a local manual routine", async () => {
    await renderCard(
      <WidgetCard
        widget={widget}
        routine={routine({ host: "local" })}
        artifact={undefined}
        now={Date.now()}
        dataRepo="o/r"
        committed
      />,
    )
    await expect.poll(() => hasText("npx @devord/steward run r")).toBe(true)
  })

  it("opens the run-locally modal from a live local routine's update control", async () => {
    await renderCard(
      <WidgetCard
        widget={widget}
        routine={routine({ host: "local" })}
        artifact={artifact({ html: "<h1>live</h1>" })}
        now={Date.now()}
        dataRepo="o/r"
        committed
      />,
    )
    // A local routine can't be fired from the board — its update control opens
    // the how-to-run-it modal, which names both honest ways in (CLI + prompt).
    const button = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Run R locally"]',
    )
    expect(button).not.toBeNull()
    button?.click()
    await expect.poll(() => hasText("npx @devord/steward run r")).toBe(true)
    expect(hasText("follow the run-routine skill")).toBe(true)
  })

  it("offers the first run for a scheduled routine whose trigger exists", async () => {
    await renderCard(
      <WidgetCard
        widget={widget}
        routine={routine({ schedule: "0 */4 * * *" })}
        artifact={artifact({ hasTrigger: true })}
        now={Date.now()}
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
        dataRepo="o/r"
        committed
      />,
    )
    await expect.poll(() => hasText("Run now")).toBe(true)
    expect(document.querySelector('button[aria-label^="Update"]')).toBeNull()
  })

  it("fires /run with the board's repo and slug when the CTA is clicked", async () => {
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

    // The action must see the parsed object (repo + slug), and a successful
    // fire reaches the board via onFired — the full useFireRoutine round trip.
    await expect.poll(() => fired).toBe(true)
    expect(received).toEqual({ repo: "o/r", slug: "r" })
  })

  it("drops the update button while a run is in flight", async () => {
    await renderCard(
      <WidgetCard
        widget={widget}
        routine={routine()}
        artifact={artifact({ hasTrigger: true })}
        now={Date.now()}
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

  it("links the Running pill to the claude.ai routine page when the id is known", async () => {
    await renderCard(
      <WidgetCard
        widget={widget}
        routine={routine()}
        artifact={artifact({
          html: "<h1>live</h1>",
          hasTrigger: true,
          routineId: "abc-123",
        })}
        now={Date.now()}
        dataRepo="o/r"
        committed
        pendingFiredAt={Date.now()}
      />,
    )
    await expect.poll(() => hasText("Running")).toBe(true)
    const pill = document.querySelector(
      'a[href="https://claude.ai/code/routines/abc-123"]',
    )
    expect(pill?.textContent).toContain("Running")
    expect(pill?.getAttribute("target")).toBe("_blank")
  })

  it("keeps the Running pill a plain readout without a routine id", async () => {
    await renderCard(
      <WidgetCard
        widget={widget}
        routine={routine()}
        artifact={artifact({ html: "<h1>live</h1>", hasTrigger: true })}
        now={Date.now()}
        dataRepo="o/r"
        committed
        pendingFiredAt={Date.now()}
      />,
    )
    await expect.poll(() => hasText("Running")).toBe(true)
    expect(document.querySelector('a[href^="https://claude.ai"]')).toBeNull()
  })

  it("offers an Enable button on a disabled tile — not a dead end", async () => {
    let toggled = false
    await renderCard(
      <WidgetCard
        widget={widget}
        routine={routine({ enabled: false })}
        artifact={undefined}
        now={Date.now()}
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

  it("paints the artifact eagerly, veiled by skeleton lines until load", async () => {
    await renderCard(
      <WidgetCard
        widget={widget}
        routine={routine()}
        artifact={artifact({ html: "<h1>live</h1>" })}
        now={Date.now()}
      />,
    )
    const iframe = document.querySelector("iframe")
    expect(iframe).not.toBeNull()
    // Never lazy: Chromium defers an in-viewport lazy srcdoc iframe until a
    // scroll, so the board's drive-by glance saw titled, empty tiles.
    expect(iframe?.getAttribute("loading")).toBeNull()
    // The veil lifts (and the skeleton unmounts) once the document paints.
    await expect.poll(() => iframe?.classList.contains("opacity-0")).toBe(false)
    expect(document.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(0)
  })

  it("opens the routine editor from the view-mode title bar", async () => {
    let edited = false
    await renderCard(
      <WidgetCard
        widget={widget}
        routine={routine()}
        artifact={artifact({ html: "<h1>live</h1>" })}
        now={Date.now()}
        dataRepo="o/r"
        committed
        onEdit={() => {
          edited = true
        }}
      />,
    )
    // Editing a routine is a config edit, not a layout edit — the pencil must
    // not require entering dashboard edit mode.
    const btn = document.querySelector<HTMLButtonElement>(
      'button[aria-label^="Edit"]',
    )
    await expect.poll(() => btn != null).toBe(true)
    btn?.click()
    await expect.poll(() => edited).toBe(true)
  })

  it("toggles enabled from the edit-mode title bar", async () => {
    let toggled = false
    await renderCard(
      <WidgetCard
        widget={widget}
        routine={routine()}
        artifact={artifact({ html: "<h1>live</h1>" })}
        now={Date.now()}
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

describe("WidgetCard chat action", () => {
  const withContext = (body: string) =>
    `<h1>live</h1><script type="text/markdown" id="steward-context">${body}</script>`

  it("stays hidden when the artifact carries no briefing", async () => {
    // The convention is a SHOULD (ADR-0043) — a button that copies nothing
    // would be worse than no button, so legacy artifacts show none.
    await renderCard(
      <WidgetCard
        widget={widget}
        routine={routine()}
        artifact={artifact({ html: "<h1>live</h1>" })}
        now={Date.now()}
        committed
      />,
    )
    await expect
      .poll(() => document.querySelector('button[aria-label^="Copy R"]'))
      .toBe(null)
  })

  it("copies the briefing, headed by the name and freshness", async () => {
    let written: string | null = null
    // The browser withholds clipboard access without a user-permission
    // grant, so stub the write and assert on what we hand it.
    const clipboard = navigator.clipboard
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: (text: string) => {
          written = text
          return Promise.resolve()
        },
      },
    })
    const now = Date.parse("2026-07-21T14:00:00Z")
    try {
      await renderCard(
        <WidgetCard
          widget={widget}
          routine={routine({ name: "Ticket Gaps" })}
          artifact={artifact({
            html: withContext("## Gaps\n- CORZA-238 has no code"),
            lastRunAt: "2026-07-21T09:00:00Z",
          })}
          now={now}
          committed
        />,
      )
      const btn = document.querySelector<HTMLButtonElement>(
        'button[aria-label^="Copy Ticket Gaps"]',
      )
      await expect.poll(() => btn != null).toBe(true)
      btn?.click()
      await expect.poll(() => written).not.toBe(null)
      expect(written).toContain("# Ticket Gaps")
      expect(written).toContain("ran 5h ago")
      expect(written).toContain("- CORZA-238 has no code")
    } finally {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: clipboard,
      })
    }
  })
})
