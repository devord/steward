import { createMemoryRouter, RouterProvider } from "react-router"
import { describe, expect, it } from "vitest"
import { render } from "vitest-browser-react"

import "../app.css"
import { NewDashboardDialog } from "./new-dashboard-dialog.tsx"

const REPO = "alice/steward-data-alice"

async function renderDialog() {
  const router = createMemoryRouter([
    {
      path: "/",
      element: (
        <NewDashboardDialog
          open
          onOpenChange={() => {}}
          repos={[REPO]}
          defaultRepo={REPO}
          homeRepo={REPO}
          takenSlugs={{ [REPO]: ["main"] }}
          sections={{ [REPO]: ["Clients", "Projects"] }}
        />
      ),
    },
  ])
  return render(<RouterProvider router={router} />)
}

describe("NewDashboardDialog", () => {
  it("focuses the slug field on open", async () => {
    await renderDialog()
    await expect.poll(() => document.activeElement?.id).toBe("dashboard-slug")
  })

  it("offers an optional section field with the repo's sections", async () => {
    await renderDialog()
    const input = document.querySelector<HTMLInputElement>("#dashboard-section")
    expect(input).not.toBeNull()
    // The repo's known sections are offered via a native datalist.
    const options = [
      ...(document.querySelectorAll<HTMLOptionElement>("datalist option") ??
        []),
    ].map((option) => option.value)
    expect(options).toEqual(["Clients", "Projects"])
  })
})
