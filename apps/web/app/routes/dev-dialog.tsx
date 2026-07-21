import { useState } from "react"

import type { Routine, WidgetSize } from "@steward/schema"

import { AddRoutineDialog } from "../components/add-routine-dialog.tsx"
import { Button } from "~/components/ui/button"
import type { DiscoveredTemplate } from "../lib/templates.ts"

// The real built-in archetype, so the harness previews the picker's sample
// render exactly as discovery serves it (ADR-0037).
import dailyPlanSample from "../../../../docs/samples/daily-plan.html?raw"

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
    sample: dailyPlanSample,
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
    source: "repo",
  },
  // The scale case the picker has to survive: a data repo that has grown a
  // shelf of its own templates (ADR-0015/0021). Descriptions are the real
  // long ones — the picker must not decide the pick by truncating them.
  ...(
    [
      [
        "corza-progress",
        "Corza build progress — next-milestone readiness, stage, and per-team burndown",
        "repo",
      ],
      [
        "repo-intel",
        "Weekly strategic briefing — headlines, deep dives, and what to watch next week",
        "repo",
      ],
      [
        "repo-stats",
        "PRs per person over time — merged + open, scrubbable day by day",
        "repo",
      ],
      [
        "ticket-gaps",
        "Tickets to create where the shipped code lags the knowledge-base spec",
        "repo",
      ],
      [
        "release-notes",
        "What shipped since the last tag, grouped by surface and written for humans",
        "repo",
      ],
      [
        "oncall-digest",
        "Overnight alerts, their blast radius, and which are still unacknowledged",
        "repo",
      ],
      [
        "inbox-triage",
        "Unanswered threads older than a day, by sender",
        "builtin",
      ],
      [
        "cal-week",
        "The week ahead: meetings, focus blocks, and the gaps",
        "builtin",
      ],
      [
        "spend-watch",
        "Cloud spend against budget, by service and trend",
        "builtin",
      ],
      [
        "reading-queue",
        "Saved links you haven't opened, oldest first",
        "builtin",
      ],
    ] as const
  ).map(([id, artifact, source]) => ({
    id,
    name: id,
    description: artifact,
    widget: {
      artifact,
      sizes: { default: { cols: 2, rows: 2 }, min: { cols: 1, rows: 1 } },
      schedule: "0 8 * * *",
    },
    source,
  })),
]

const editable: Routine = {
  slug: "repo-pulse",
  name: "Repo Pulse",
  template: "repo-pulse",
  schedule: "0 */4 * * *",
  instructions: "Only the devord org repos.",
  params: { repos: ["devord/steward", "devord/plugins"] },
  repos: ["devord/steward", "devord/plugins", "devord/kb"],
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
