import { userEvent } from "vitest/browser"
import type { Routine, WidgetSize } from "@steward/schema"
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
  instructions: "Only the devord org repos.",
  params: { repos: ["devord/steward", "devord/plugins"] },
  repos: ["devord/steward", "devord/kb"],
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
    // Instances slug themselves <first-repo>-pulse (ADR-0040).
    subjectParam: "repos",
    params: [
      {
        key: "repos",
        label: "Repositories to watch",
        type: "repos",
        required: true,
      },
    ],
  },
  source: "repo",
}

/** A built-in shipping a sample render — the fixture for the picker preview
    (ADR-0037). The HTML is a minimal artifact; the preview only needs to frame
    and mount it. */
const dailyPlanTemplate: DiscoveredTemplate = {
  id: "daily-plan",
  name: "Daily plan",
  description: "Today's plan: top 3 priorities, time blocks, and carry-overs",
  widget: {
    artifact: "Today's plan: top 3 priorities, time blocks, and carry-overs",
    sizes: { default: { cols: 2, rows: 2 } },
    schedule: "0 8 * * *",
  },
  source: "builtin",
  sample: "<main><h1>Daily plan</h1><p>Ship the picker preview.</p></main>",
}

const hasText = (text: string) =>
  document.body.textContent?.includes(text) ?? false

const previewFrame = (): HTMLIFrameElement | null =>
  document.querySelector<HTMLIFrameElement>('iframe[title$="sample render"]')

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

/** Commit a repo token into the repos combobox the way a user does: type
    it (real browser events so Base UI reacts), then Enter to accept the
    auto-highlighted "Add …" candidate. */
async function addRepo(repo: string) {
  const el = input("routine-param-repos")
  await userEvent.click(el)
  await userEvent.type(el, repo)
  await userEvent.keyboard("{Enter}")
  await vi.waitFor(() => expect(hasText(repo)).toBe(true))
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
  // wait for a field from either step (edit mode opens on configure; a
  // seeded template deselects the custom card and its nested prompt).
  await vi.waitFor(() =>
    expect(
      document.querySelector("#routine-prompt") ??
        document.querySelector("#routine-name") ??
        document.querySelector('button[aria-pressed="true"]'),
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

  it("speaks the preset phrase in the schedule trigger, never raw cron", async () => {
    // Base UI renders the raw value by default — the trigger must map it
    // through the shared cron vocabulary (lib/schedules.ts) the way the
    // open menu already does.
    await renderDialog()
    typeInto(textarea("routine-prompt"), "Anything.")
    button("Next").click()
    await vi.waitFor(() =>
      expect(document.querySelector("#routine-name")).not.toBeNull(),
    )

    const trigger = document.querySelector("#routine-schedule")
    expect(trigger?.textContent).toContain("Daily at 8:00")
    expect(trigger?.textContent).not.toContain("0 8 * * *")
  })

  it("retracts auto-seeded connectors when their template is unpicked", async () => {
    // A pick's suggested connectors must follow the pick (ADR-0018 is an
    // allowlist — deselecting the template takes its grant away instead of
    // silently widening what the run may use), and seeding opens Advanced
    // so the grant is visible on the configure step.
    const calTemplate: DiscoveredTemplate = {
      ...dailyPlanTemplate,
      id: "cal-digest",
      name: "Cal digest",
      sample: undefined,
      widget: {
        ...dailyPlanTemplate.widget,
        connectors: ["Google_Calendar"],
      },
    }
    await renderDialog({ templates: [calTemplate] })

    buttonContaining("cal-digest").click()
    await vi.waitFor(() =>
      expect(buttonContaining("cal-digest").getAttribute("aria-pressed")).toBe(
        "true",
      ),
    )
    button("Next").click()
    // Advanced auto-opened by the seeding — the chip is already visible.
    const chip = await vi.waitFor(() => button("Google Calendar"))
    expect(chip.getAttribute("aria-pressed")).toBe("true")

    // Back to intent, deselect the card — the seeded grant leaves with it.
    // The nested prompt only mounts once the custom card is selected again.
    button("Back").click()
    await vi.waitFor(() =>
      expect(buttonContaining("cal-digest").getAttribute("aria-pressed")).toBe(
        "true",
      ),
    )
    buttonContaining("cal-digest").click()
    await vi.waitFor(() =>
      expect(document.querySelector("#routine-prompt")).not.toBeNull(),
    )
    typeInto(textarea("routine-prompt"), "Freeform instead.")
    button("Next").click()
    await vi.waitFor(() =>
      expect(document.querySelector("#routine-name")).not.toBeNull(),
    )
    button("Advanced").click()
    const after = await vi.waitFor(() => button("Google Calendar"))
    expect(after.getAttribute("aria-pressed")).toBe("false")
  })

  it("keeps a typed draft on Escape, resets on explicit Cancel", async () => {
    // Escape/backdrop are accident-prone — they close but must not destroy
    // a typed brief. Cancel is the explicit discard.
    await renderDialog()
    typeInto(textarea("routine-prompt"), "A brief worth keeping.")
    await userEvent.keyboard("{Escape}")
    // The harness holds `open`, so the panel stays mounted — reset would
    // have cleared the prompt.
    expect(textarea("routine-prompt").value).toBe("A brief worth keeping.")

    button("Cancel").click()
    await vi.waitFor(() => expect(textarea("routine-prompt").value).toBe(""))
  })

  it("seeds the picker from initialTemplate — new routine from template (ADR-0029)", async () => {
    await renderDialog({
      templates: [repoPulseTemplate],
      initialTemplate: "repo-pulse",
    })

    // Pre-picked exactly as a card click: card selected, Next unlocked
    // without typing a prompt…
    await vi.waitFor(() => expect(button("Next").disabled).toBe(false))
    expect(buttonContaining("repo-pulse").getAttribute("aria-pressed")).toBe(
      "true",
    )
    button("Next").click()
    await vi.waitFor(() =>
      expect(document.querySelector("#routine-name")).not.toBeNull(),
    )

    // repo-pulse slugs its instance after the subject (ADR-0040), so name
    // and slug stay empty until a repo is entered — no template-name seed,
    // no counter. The slug shows as a read-only chip, not a text field.
    expect(input("routine-name").value).toBe("")
    expect(document.querySelector("#routine-slug")).toBeNull()
    expect(hasText("Set from the subject above")).toBe(true)
  })

  it("previews the selected template's sample render, only while picked (ADR-0037)", async () => {
    await renderDialog({ templates: [dailyPlanTemplate] })

    // Custom is selected on open — no template card is picked, so no preview.
    expect(previewFrame()).toBeNull()

    buttonContaining("daily-plan").click()
    await vi.waitFor(() =>
      expect(buttonContaining("daily-plan").getAttribute("aria-pressed")).toBe(
        "true",
      ),
    )
    // The sample render mounts in a sandboxed frame, captioned as an example.
    const frame = await vi.waitFor(() => {
      const f = previewFrame()
      if (!f) throw new Error("no preview frame")
      return f
    })
    expect(frame.getAttribute("sandbox")).toContain("allow-scripts")
    expect(hasText("Sample render")).toBe(true)

    // Clicking the picked card again deselects it — the preview goes with it.
    buttonContaining("daily-plan").click()
    await vi.waitFor(() => expect(previewFrame()).toBeNull())
  })

  it("shows no preview for a template that ships no sample", async () => {
    await renderDialog({ templates: [repoPulseTemplate] })

    buttonContaining("repo-pulse").click()
    await vi.waitFor(() => expect(button("Next").disabled).toBe(false))
    expect(previewFrame()).toBeNull()
  })

  it("blocks submit while a required template param is empty (ADR-0020)", async () => {
    const { onAdd } = await renderDialog({ templates: [repoPulseTemplate] })

    buttonContaining("repo-pulse").click()
    await vi.waitFor(() => expect(button("Next").disabled).toBe(false))
    button("Next").click()
    await vi.waitFor(() =>
      expect(document.querySelector("#routine-param-repos")).not.toBeNull(),
    )

    // Name/slug derive from the subject (ADR-0040), so both stay empty until
    // a repo is entered — the required repos param is missing, and there's
    // no collision to warn about.
    expect(input("routine-name").value).toBe("")
    expect(hasText("Set from the subject above")).toBe(true)
    expect(hasText("Already used by another routine")).toBe(false)
    expect(hasText("Repositories to watch")).toBe(true)
    expect(button("Add to draft").disabled).toBe(true)
    expect(onAdd).not.toHaveBeenCalled()
  })

  it("slugs a subject template <subject>-<kind> from its first repo (ADR-0040)", async () => {
    const { onAdd } = await renderDialog({ templates: [repoPulseTemplate] })

    buttonContaining("repo-pulse").click()
    await vi.waitFor(() => expect(button("Next").disabled).toBe(false))
    button("Next").click()
    await vi.waitFor(() =>
      expect(document.querySelector("#routine-param-repos")).not.toBeNull(),
    )

    await addRepo("Form-Factory/corza")

    // The subject is the repo name without its owner; slug = corza-pulse
    // (kind defaults to the template id's last segment), name = Corza. No
    // counter, no hand-typing.
    await vi.waitFor(() => expect(input("routine-name").value).toBe("Corza"))
    expect(hasText("corza-pulse")).toBe(true)

    button("Add to draft").click()
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "corza-pulse", name: "Corza" }),
      expect.anything(),
    )
  })

  it("reveals an editable slug via Customize on a subject template (ADR-0040)", async () => {
    await renderDialog({ templates: [repoPulseTemplate] })

    buttonContaining("repo-pulse").click()
    await vi.waitFor(() => expect(button("Next").disabled).toBe(false))
    button("Next").click()
    await vi.waitFor(() =>
      expect(document.querySelector("#routine-param-repos")).not.toBeNull(),
    )
    await addRepo("Form-Factory/corza")
    await vi.waitFor(() => expect(hasText("corza-pulse")).toBe(true))

    // No slug field until the user opts into editing.
    expect(document.querySelector("#routine-slug")).toBeNull()
    button("Customize").click()

    const field = await vi.waitFor(() => input("routine-slug"))
    // The revealed field carries the derived slug forward to tweak.
    expect(field.value).toBe("corza-pulse")
    // Once customized, the derivation no longer touches the slug — a later
    // params change leaves the hand-typed value intact.
    typeInto(field, "corza-pulse-staging")
    await addRepo("Form-Factory/acme")
    expect(input("routine-slug").value).toBe("corza-pulse-staging")
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

  it("surfaces the owning Claude account from the trigger receipt (ADR-0029)", async () => {
    await renderDialog({ editRoutine: editable, account: "work@example.org" })
    await vi.waitFor(() =>
      expect(input("routine-name").value).toBe("Repo Pulse"),
    )

    // The real account, verbatim — not the runner login ("alice") dressed up
    // as an account.
    expect(hasText("work@example.org")).toBe(true)
    expect(hasText("alice's Claude account")).toBe(false)
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
    expect(hasText("devord/steward")).toBe(true)
    expect(hasText("devord/kb")).toBe(true)

    button("Save changes").click()
    // The param-watched plugins repo, absent from the stored repos:, is
    // unioned in on save (param answers first, Advanced extras after).
    expect(onEdit).toHaveBeenCalledWith({
      ...editable,
      repos: ["devord/steward", "devord/plugins", "devord/kb"],
    })
  })

  it("toggles a connector from the catalog and saves the updated allowlist", async () => {
    // editable already allows GitHub; the Advanced section auto-opens because
    // it has content. Toggling Gmail on adds it to the allowlist.
    const { onEdit } = await renderDialog({ editRoutine: editable })
    await vi.waitFor(() =>
      expect(input("routine-name").value).toBe("Repo Pulse"),
    )

    // The catalog renders as toggles; GitHub is pre-selected.
    expect(button("GitHub").getAttribute("aria-pressed")).toBe("true")
    expect(button("Gmail").getAttribute("aria-pressed")).toBe("false")

    button("Gmail").click()
    await vi.waitFor(() =>
      expect(button("Gmail").getAttribute("aria-pressed")).toBe("true"),
    )
    button("Save changes").click()

    expect(onEdit).toHaveBeenCalledWith(
      expect.objectContaining({ connectors: ["GitHub", "Gmail"] }),
    )
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
