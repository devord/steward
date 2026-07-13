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
})
