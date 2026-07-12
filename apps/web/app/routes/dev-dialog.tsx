import { useState } from "react"

import type { Routine, WidgetSize } from "@bulletin/schema"

import { AddRoutineDialog } from "../components/add-routine-dialog.tsx"
import { Button } from "~/components/ui/button"
import type { DiscoveredTemplate } from "../lib/templates.ts"

// Dev-only harness: iterate on the add-routine wizard without a GitHub
// session or live template discovery behind it.
const templates: DiscoveredTemplate[] = [
  {
    id: "daily-plan",
    name: "daily-plan",
    description: "Today's plan: top 3 priorities, time blocks, and carry-overs",
    widget: {
      artifact: "Today's plan: top 3 priorities, time blocks, and carry-overs",
      sizes: { default: { cols: 2, rows: 2 }, min: { cols: 1, rows: 1 } },
      schedule: "0 8 * * *",
      params: [
        {
          key: "focus",
          label: "Focus",
          type: "select",
          required: false,
          options: ["deep work", "meetings", "mixed"],
          hint: "Colors how the plan weighs the calendar",
        },
      ],
      connectors: ["Google_Calendar"],
    },
    source: "builtin",
  },
  {
    id: "repo-pulse",
    name: "repo-pulse",
    description: "Open PRs awaiting review, new issues, and CI status per repo",
    widget: {
      artifact: "Open PRs awaiting review, new issues, and CI status per repo",
      sizes: { default: { cols: 2, rows: 1 }, min: { cols: 1, rows: 1 } },
      schedule: "0 */4 * * *",
      params: [
        {
          key: "repos",
          label: "Repositories to watch",
          type: "repos",
          required: true,
        },
      ],
      connectors: ["GitHub"],
    },
    source: "team",
  },
]

const editable: Routine = {
  slug: "repo-pulse",
  name: "Repo Pulse",
  template: "repo-pulse",
  schedule: "0 */4 * * *",
  instructions: "Only the Form-Factory org repos.",
  params: { repos: ["Form-Factory/bulletin", "Form-Factory/plugins"] },
  repos: ["Form-Factory/bulletin", "Form-Factory/plugins", "Form-Factory/kb"],
  connectors: ["GitHub"],
  enabled: true,
}

export default function DevDialog() {
  const [mode, setMode] = useState<"add" | "edit" | null>("add")
  return (
    <div className="grid min-h-svh place-content-center gap-3 bg-background p-8">
      <Button onClick={() => setMode("add")}>Open add</Button>
      <Button variant="outline" onClick={() => setMode("edit")}>
        Open edit
      </Button>
      <AddRoutineDialog
        open={mode != null}
        onOpenChange={(open) => setMode(open ? mode : null)}
        templates={templates}
        columns={4}
        existingSlugs={["daily-plan", "repo-pulse"]}
        onAdd={(_routine: Routine, _size: WidgetSize) => setMode(null)}
        editRoutine={mode === "edit" ? editable : null}
        onEdit={(_routine: Routine) => setMode(null)}
      />
    </div>
  )
}
