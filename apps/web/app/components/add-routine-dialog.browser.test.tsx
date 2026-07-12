import type { Routine, WidgetSize } from "@bulletin/schema"
import { describe, expect, it, vi } from "vitest"
import { render } from "vitest-browser-react"

import "../app.css"
import type { DiscoveredTemplate } from "../lib/templates.ts"
import { AddRoutineDialog } from "./add-routine-dialog.tsx"

// `repos` deliberately misses a param-watched repo (plugins): saving under
// the discovered template must union it back in — the ADR-0020 mirror.
const editable: Routine = {
  slug: "repo-pulse",
  name: "Repo Pulse",
  template: "repo-pulse",
  schedule: "0 */4 * * *",
  instructions: "Only the Form-Factory org repos.",
  params: { repos: ["Form-Factory/bulletin", "Form-Factory/plugins"] },
  repos: ["Form-Factory/bulletin", "Form-Factory/kb"],
  connectors: ["GitHub"],
  runner: "alice",
  enabled: true,
}

/** repo-pulse as discovery would surface it, declaring its repos param
    (ADR-0020) — the fixture for param-aware paths. */
const repoPulseTemplate: DiscoveredTemplate = {
  id: "repo-pulse",
  name: "repo-pulse",
  description: "Open PRs awaiting review, new issues, and CI status per repo",
  widget: {
    artifact: "Open PRs awaiting review, new issues, and CI status per repo",
    sizes: { default: { cols: 2, rows: 1 } },
    schedule: "0 */4 * * *",
    params: [
      {
        key: "repos",
        label: "Repositories to watch",
        type: "repos",
        required: true,
      },
    ],
  },
  source: "team",
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

/** A button whose text merely contains `text` — template cards carry id,
    badge, and metadata in one label. */
const buttonContaining = (text: string): HTMLButtonElement => {
  const found = [...document.querySelectorAll("button")].find((b) =>
    b.textContent?.includes(text),
  )
  if (!found) throw new Error(`no button containing "${text}"`)
  return found
}

const input = (id: string): HTMLInputElement => {
  const el = document.querySelector<HTMLInputElement>(`#${id}`)
  if (!el) throw new Error(`no input #${id}`)
  return el
}

/** Set a controlled field's value the way a real keystroke would, so
    React's onChange fires. */
function typeInto(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set
  setter?.call(el, value)
  el.dispatchEvent(new Event("input", { bubbles: true }))
}

const textarea = (id: string): HTMLTextAreaElement => {
  const el = document.querySelector<HTMLTextAreaElement>(`#${id}`)
  if (!el) throw new Error(`no textarea #${id}`)
  return el
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
      templates={[]}
      columns={4}
      existingSlugs={["daily-plan", "repo-pulse"]}
      onAdd={onAdd}
      onEdit={onEdit}
      {...over}
    />,
  )
  // The Base UI dialog portals its content a tick after render resolves —
  // wait for something from either step (edit mode opens on configure).
  await vi.waitFor(() =>
    expect(
      document.querySelector("#routine-prompt") ??
        document.querySelector("#routine-name"),
    ).not.toBeNull(),
  )
  return { onAdd, onEdit }
}

describe("AddRoutineDialog add mode", () => {
  it("walks intent → configure, with the size picker on the second step", async () => {
    const { onAdd } = await renderDialog()

    expect(hasText("Add a routine")).toBe(true)
    // Nothing typed yet — the wizard can't advance without a source.
    expect(button("Next").disabled).toBe(true)

    typeInto(
      textarea("routine-prompt"),
      "Open PRs across our repos, grouped by reviewer.",
    )
    button("Next").click()
    await vi.waitFor(() =>
      expect(document.querySelector("#routine-name")).not.toBeNull(),
    )

    typeInto(input("routine-name"), "PR Radar")
    button("Add to draft").click()

    expect(onAdd).toHaveBeenCalledTimes(1)
    // A freeform routine names the custom built-in (ADR-0022).
    expect(onAdd).toHaveBeenCalledWith(
      {
        slug: "pr-radar",
        name: "PR Radar",
        template: "custom",
        schedule: "0 8 * * *",
        instructions: "Open PRs across our repos, grouped by reviewer.",
        enabled: true,
      },
      { cols: 2, rows: 2 },
    )
  })

  it("blocks submit while a required template param is empty (ADR-0020)", async () => {
    const { onAdd } = await renderDialog({ templates: [repoPulseTemplate] })

    buttonContaining("repo-pulse").click()
    await vi.waitFor(() => expect(button("Next").disabled).toBe(false))
    button("Next").click()
    await vi.waitFor(() =>
      expect(document.querySelector("#routine-param-repos")).not.toBeNull(),
    )

    // Name/slug/schedule are pre-filled by the template; the slug
    // auto-uniques past the existing repo-pulse routine instead of
    // erroring. Only the required repos param is missing.
    expect(input("routine-name").value).toBe("repo-pulse")
    expect(input("routine-slug").value).toBe("repo-pulse-2")
    expect(hasText("Already used by another routine")).toBe(false)
    expect(hasText("Repositories to watch")).toBe(true)
    expect(button("Add to draft").disabled).toBe(true)
    expect(onAdd).not.toHaveBeenCalled()
  })
})

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
    // templates is empty, so the routine's template isn't discoverable — it must
    // still be retained, still count as a valid source, and its params must
    // round-trip untouched (ADR-0020).
    const { onEdit } = await renderDialog({ editRoutine: editable })
    await vi.waitFor(() =>
      expect(input("routine-name").value).toBe("Repo Pulse"),
    )

    button("Save changes").click()

    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onEdit).toHaveBeenCalledWith(editable)
  })

  it("renders declared params as fields and unions watched repos into repos", async () => {
    const { onEdit } = await renderDialog({
      editRoutine: editable,
      templates: [repoPulseTemplate],
    })
    await vi.waitFor(() =>
      expect(input("routine-name").value).toBe("Repo Pulse"),
    )

    // The repos param renders its answers as chips; the leftover repo shows
    // under Advanced, which auto-opens because it has content.
    expect(hasText("Repositories to watch")).toBe(true)
    expect(hasText("Form-Factory/bulletin")).toBe(true)
    expect(hasText("Form-Factory/kb")).toBe(true)

    button("Save changes").click()
    // The param-watched plugins repo, absent from the stored repos:, is
    // unioned in on save (param answers first, Advanced extras after).
    expect(onEdit).toHaveBeenCalledWith({
      ...editable,
      repos: [
        "Form-Factory/bulletin",
        "Form-Factory/plugins",
        "Form-Factory/kb",
      ],
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
})
