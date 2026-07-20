import { createMemoryRouter, RouterProvider } from "react-router"
import { afterEach, describe, expect, it, vi } from "vitest"
import { render } from "vitest-browser-react"

import "../app.css"
import { AccountMenu } from "./account-menu.tsx"
import { APPEARANCE_STORAGE_KEY } from "../lib/theme.ts"

const modeTile = (label: string): HTMLElement | null =>
  [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')].find(
    (el) => el.getAttribute("aria-label") === label,
  ) ?? null

const requireModeTile = (label: string): HTMLElement => {
  const tile = modeTile(label)
  if (!tile) throw new Error(`no mode tile "${label}"`)
  return tile
}

async function openMenu() {
  const router = createMemoryRouter([
    {
      path: "/",
      element: <AccountMenu login="alice" displayName="Alice" block />,
    },
  ])
  await render(<RouterProvider router={router} />)
  document
    .querySelector<HTMLButtonElement>('button[aria-label="Account"]')
    ?.click()
  await vi.waitFor(() => expect(modeTile("Dark")).not.toBeNull())
}

describe("AccountMenu docs item", () => {
  it("links to the docs in a new tab", async () => {
    await openMenu()

    const docs = [
      ...document.querySelectorAll<HTMLAnchorElement>('[role="menu"] a'),
    ].find((el) => el.textContent === "Docs")
    if (!docs) throw new Error("no Docs menu item")
    expect(docs.getAttribute("href")).toBe("/docs")
    // A new tab — the reader keeps the board open beside the docs.
    expect(docs.getAttribute("target")).toBe("_blank")
    expect(docs.getAttribute("rel")).toBe("noreferrer")
  })
})

describe("AccountMenu mode row", () => {
  afterEach(() => {
    // updateAppearance persists + stamps the document; undo both so the
    // preference can't leak into other tests in this worker.
    window.localStorage.removeItem(APPEARANCE_STORAGE_KEY)
    document.documentElement.setAttribute("data-theme", "gruvbox-dark")
    document.documentElement.classList.add("dark")
  })

  it("offers the three modes as radio items, current one checked", async () => {
    await openMenu()

    for (const label of ["Auto", "Light", "Dark"]) {
      expect(modeTile(label)).not.toBeNull()
    }
    // The default preference is auto.
    expect(requireModeTile("Auto").getAttribute("aria-checked")).toBe("true")
  })

  it("re-themes in place and keeps the menu open", async () => {
    await openMenu()

    requireModeTile("Light").click()

    // The document restamps immediately (the same path the settings page
    // takes) — a light theme lands and the dark class drops.
    await vi.waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(false)
    })
    // Live preview: selecting a mode must not dismiss the menu.
    expect(modeTile("Light")).not.toBeNull()
    expect(requireModeTile("Light").getAttribute("aria-checked")).toBe("true")

    requireModeTile("Dark").click()
    await vi.waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true)
    })
    expect(requireModeTile("Dark").getAttribute("aria-checked")).toBe("true")
  })
})
