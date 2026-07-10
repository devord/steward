import { useState } from "react"

import type { Routine, WidgetSize } from "@bulletin/schema"

import { AddRoutineDialog } from "../components/add-routine-dialog.tsx"
import { Button } from "~/components/ui/button"
import type { DiscoveredSkill } from "../lib/skills.ts"

// Dev-only harness: iterate on the add-routine wizard without a GitHub
// session or live skill discovery behind it.
const skills: DiscoveredSkill[] = [
  {
    id: "daily-plan",
    name: "daily-plan",
    description: "Today's plan: top 3 priorities, time blocks, and carry-overs",
    widget: {
      artifact: "Today's plan: top 3 priorities, time blocks, and carry-overs",
      sizes: { default: { cols: 2, rows: 2 }, min: { cols: 1, rows: 1 } },
      schedule: "0 8 * * *",
    },
    source: "private",
  },
  {
    id: "repo-pulse",
    name: "repo-pulse",
    description: "Open PRs awaiting review, new issues, and CI status per repo",
    widget: {
      artifact: "Open PRs awaiting review, new issues, and CI status per repo",
      sizes: { default: { cols: 2, rows: 1 }, min: { cols: 1, rows: 1 } },
      schedule: "0 */4 * * *",
    },
    source: "team",
  },
]

export default function DevDialog() {
  const [open, setOpen] = useState(true)
  return (
    <div className="grid min-h-svh place-items-center bg-background p-8">
      <Button onClick={() => setOpen(true)}>Open</Button>
      <AddRoutineDialog
        open={open}
        onOpenChange={setOpen}
        skills={skills}
        columns={4}
        existingSlugs={["daily-plan"]}
        onAdd={(_routine: Routine, _size: WidgetSize) => setOpen(false)}
      />
    </div>
  )
}
