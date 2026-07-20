import { createMemoryRouter, RouterProvider } from "react-router"
import { describe, expect, it } from "vitest"
import { render } from "vitest-browser-react"

import "../app.css"
import { AddDataRepoDialog } from "./add-data-repo-dialog.tsx"
import type { DataRepoResult } from "../routes/data-repos.ts"

const KNOWN = ["alice/steward-data-alice"]

// The loader hands the browser this app's OAuth authorization page (ADR-0004);
// the dialog links to it when a register is denied or the repo reads missing.
const OAUTH_APP_URL =
  "https://github.com/settings/connections/applications/Iv1.testclientid"

async function renderDialog(actionResult?: DataRepoResult) {
  const router = createMemoryRouter([
    {
      path: "/",
      element: <AddDataRepoDialog open onOpenChange={() => {}} known={KNOWN} />,
    },
    {
      path: "/data-repos",
      loader: () => ({
        login: "alice",
        orgs: ["acme"],
        prefix: "steward-data-",
        oauthAppUrl: OAUTH_APP_URL,
      }),
      action: () => actionResult ?? null,
    },
  ])
  return render(<RouterProvider router={router} />)
}

const input = (id: string): HTMLInputElement | null =>
  document.querySelector<HTMLInputElement>(`#${id}`)

const submitButton = (label: string): HTMLButtonElement | null =>
  [...document.querySelectorAll("button")].find(
    (el) => el.textContent?.trim() === label,
  ) ?? null

const manageLink = (): HTMLAnchorElement | null =>
  [...document.querySelectorAll("a")].find((el) =>
    el.textContent?.includes("Manage organization access on GitHub"),
  ) ?? null

describe("AddDataRepoDialog", () => {
  it("prefills the conventional repo name from the picked owner", async () => {
    await renderDialog()
    // The owners loader answers async; the name derives from login + prefix.
    await expect
      .poll(() => input("data-repo-name")?.value)
      .toBe("steward-data-alice")
  })

  it("register mode requires a plausible owner/repo and rejects known ones", async () => {
    const screen = await renderDialog()
    await screen.getByRole("radio", { name: /register/i }).click()

    expect(input("data-repo-existing")).not.toBeNull()

    // The field takes focus as it mounts — pick register, type the repo.
    await expect
      .poll(() => document.activeElement?.id)
      .toBe("data-repo-existing")

    // Free text that isn't owner/repo — submit stays disabled.
    await screen.getByLabelText("Repository").fill("not a repo")
    expect(submitButton("Register")?.disabled).toBe(true)

    // A repo already in the rail is called out and blocked.
    await screen.getByLabelText("Repository").fill(KNOWN[0])
    await expect
      .poll(() =>
        [...document.querySelectorAll("p")].some(
          (el) => el.textContent === "Already in your rail",
        ),
      )
      .toBe(true)
    expect(submitButton("Register")?.disabled).toBe(true)

    // A fresh owner/repo arms the submit.
    await screen.getByLabelText("Repository").fill("acme/steward-data-acme")
    await expect.poll(() => submitButton("Register")?.disabled).toBe(false)
  })

  // A denied/missing register is usually the org not having approved the
  // classic OAuth app — offer the jump to GitHub where that's granted.
  it.each(["denied", "missing"] as const)(
    "offers the Manage access link, pointed at the OAuth app, when register fails with %s",
    async (error) => {
      const screen = await renderDialog({ ok: false, error })
      await screen.getByRole("radio", { name: /register/i }).click()

      // Arm and submit a fresh owner/repo — the action answers with the error.
      await screen.getByLabelText("Repository").fill("acme/steward-data-acme")
      await expect.poll(() => submitButton("Register")?.disabled).toBe(false)
      submitButton("Register")?.click()

      // The link surfaces below the error, opening this app's authorization
      // page in a new tab.
      await expect
        .poll(() => manageLink()?.getAttribute("href"))
        .toBe(OAUTH_APP_URL)
      const link = manageLink()
      expect(link?.target).toBe("_blank")
      expect(link?.rel).toBe("noopener noreferrer")
    },
  )

  it("shows no Manage access link for an unrelated register error", async () => {
    const screen = await renderDialog({ ok: false, error: "not-data-repo" })
    await screen.getByRole("radio", { name: /register/i }).click()

    await screen.getByLabelText("Repository").fill("acme/steward-data-acme")
    await expect.poll(() => submitButton("Register")?.disabled).toBe(false)
    submitButton("Register")?.click()

    // The error copy lands, but this failure isn't an access problem.
    await expect
      .poll(() =>
        [...document.querySelectorAll("p")].some((el) =>
          el.textContent?.includes("data/routines.yaml"),
        ),
      )
      .toBe(true)
    expect(manageLink()).toBeNull()
  })
})
