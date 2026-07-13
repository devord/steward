import { createMemoryRouter, RouterProvider } from "react-router"
import { describe, expect, it } from "vitest"
import { render } from "vitest-browser-react"

import "../app.css"
import { AddDataRepoDialog } from "./add-data-repo-dialog.tsx"

const KNOWN = ["alice/steward-data-alice"]

async function renderDialog() {
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
      }),
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
})
