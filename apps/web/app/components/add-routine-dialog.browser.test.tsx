import type { Routine, WidgetSize } from "@bulletin/schema"
import { describe, expect, it, vi } from "vitest"
import { render } from "vitest-browser-react"

import "../app.css"
import { AddRoutineDialog } from "./add-routine-dialog.tsx"

const editable: Routine = {
  slug: "repo-pulse",
  name: "Repo Pulse",
  skill: "repo-pulse",
  schedule: "0 */4 * * *",
  instructions: "Only the Form-Factory org repos.",
  runner: "alice",
  enabled: true,
}

const hasText = (text: string) =>
  document.body.textContent?.includes(text) ?? false

const button = (label: string): HTMLButtonElement => {
  const found = [...document.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label,
  )
  if (!found) throw new Error(`no button "${label}"`)
  return found
}

const input = (id: string): HTMLInputElement => {
  const el = document.querySelector<HTMLInputElement>(`#${id}`)
  if (!el) throw new Error(`no input #${id}`)
  return el
}

/** Set a controlled input's value the way a real keystroke would, so React's
    onChange fires. */
function typeInto(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set
  setter?.call(el, value)
  el.dispatchEvent(new Event("input", { bubbles: true }))
}

async function renderDialog(
  over: Partial<Parameters<typeof AddRoutineDialog>[0]> = {},
) {
  const onAdd = vi.fn<(r: Routine, s: WidgetSize) => void>()
  const onEdit = vi.fn<(r: Routine) => void>()
  await render(
    <AddRoutineDialog
      open
      onOpenChange={() => {}}
      skills={[]}
      columns={4}
      existingSlugs={["daily-plan", "repo-pulse"]}
      onAdd={onAdd}
      onEdit={onEdit}
      {...over}
    />,
  )
  // The Base UI dialog portals its content and the edit prefill runs in an
  // effect, both a tick after render resolves — wait for the content.
  await vi.waitFor(() =>
    expect(document.querySelector("#routine-name")).not.toBeNull(),
  )
  return { onAdd, onEdit }
}

describe("AddRoutineDialog edit mode", () => {
  it("prefills the routine, locks the slug, and hides the size picker", async () => {
    await renderDialog({ editRoutine: editable })
    await vi.waitFor(() =>
      expect(input("routine-name").value).toBe("Repo Pulse"),
    )

    expect(hasText("Edit routine")).toBe(true)

    const slug = input("routine-slug")
    expect(slug.value).toBe("repo-pulse")
    expect(slug.disabled).toBe(true)

    // Placement/size is a grid concern, not a routine field.
    expect(hasText("Widget size")).toBe(false)
    // The submit is a save, not an add.
    expect(hasText("Save changes")).toBe(true)
  })

  it("saves the merged routine, keeping slug and fields the form doesn't own", async () => {
    // skills is empty, so the routine's skill isn't discoverable — it must
    // still be retained and still count as a valid source.
    const { onEdit } = await renderDialog({ editRoutine: editable })
    await vi.waitFor(() =>
      expect(input("routine-name").value).toBe("Repo Pulse"),
    )

    button("Save changes").click()

    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onEdit).toHaveBeenCalledWith({
      slug: "repo-pulse",
      name: "Repo Pulse",
      skill: "repo-pulse",
      schedule: "0 */4 * * *",
      instructions: "Only the Form-Factory org repos.",
      runner: "alice",
      enabled: true,
    })
  })

  it("applies an edited field on save", async () => {
    const { onEdit } = await renderDialog({ editRoutine: editable })
    await vi.waitFor(() =>
      expect(input("routine-name").value).toBe("Repo Pulse"),
    )

    typeInto(input("routine-name"), "Repo Pulse (org)")
    button("Save changes").click()

    expect(onEdit).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "repo-pulse", name: "Repo Pulse (org)" }),
    )
  })

  it("shows the size picker when adding", async () => {
    const { onAdd, onEdit } = await renderDialog({ editRoutine: null })

    expect(hasText("Add a routine")).toBe(true)
    expect(hasText("Widget size")).toBe(true)
    expect(onAdd).not.toHaveBeenCalled()
    expect(onEdit).not.toHaveBeenCalled()
  })
})
