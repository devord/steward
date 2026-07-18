import { describe, expect, it, vi } from "vitest"
import {
  createMemoryRouter,
  data,
  RouterProvider,
  useRouteError,
} from "react-router"
import { render } from "vitest-browser-react"

import "../app.css"
import { describeSetupError, ErrorScreen } from "./error-screen.tsx"
import { I18nProvider, useT } from "../lib/i18n.tsx"

/** Mirror of setup.tsx's ErrorBoundary — the composition under test. */
function SetupBoundary() {
  const error = useRouteError()
  const t = useT()
  return <ErrorScreen {...describeSetupError(error, t)} />
}

/**
 * Drive a loader failure through a real router so `useRouteError` sees an
 * actual ErrorResponse (the value only the framework can synthesize), not a
 * hand-built stand-in.
 */
async function renderThrowing(thrown: unknown) {
  const router = createMemoryRouter([
    {
      path: "/",
      loader: () => {
        throw thrown
      },
      Component: () => <div>ok</div>,
      ErrorBoundary: SetupBoundary,
    },
  ])
  await render(
    <I18nProvider locale="en">
      <RouterProvider router={router} />
    </I18nProvider>,
  )
}

const hasText = (text: string) =>
  document.body.textContent?.includes(text) ?? false

const TEMPLATE_MESSAGE =
  "The data-repo template (devord/steward-data-template) can't be reached, so no repo could be created from it."

describe("setup ErrorBoundary", () => {
  it("surfaces a thrown 404 message instead of the generic not-found copy", async () => {
    // The unreachable-template 404 (createDataRepoOr503) is the case the root
    // boundary buries under "the page could not be found." Setup must show the
    // actionable message the create path threw.
    await renderThrowing(data(TEMPLATE_MESSAGE, { status: 404 }))

    await vi.waitFor(() => expect(hasText(TEMPLATE_MESSAGE)).toBe(true))
    expect(hasText("The requested page could not be found.")).toBe(false)
  })

  it("surfaces a thrown 503 outage message", async () => {
    const outage = "GitHub couldn't create your data repo just now."
    await renderThrowing(data(outage, { status: 503 }))

    await vi.waitFor(() => expect(hasText(outage)).toBe(true))
  })

  it("falls back to the generic message for a non-Response error", async () => {
    await renderThrowing(new Error("boom"))

    await vi.waitFor(() =>
      expect(hasText("The request failed — try again.")).toBe(true),
    )
    // A raw Error's message must never leak to the user in this boundary.
    expect(hasText("boom")).toBe(false)
  })
})
