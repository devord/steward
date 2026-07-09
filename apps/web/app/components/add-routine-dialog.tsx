import { useMemo, useState } from "react"

import type {
  CatalogFile,
  CatalogSkill,
  Routine,
  WidgetSize,
} from "@bulletin/schema"
import { GRID_MAX_COLS, GRID_MAX_ROWS, slugSchema } from "@bulletin/schema"

import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { Textarea } from "~/components/ui/textarea"

const SCHEDULE_PRESETS = [
  { value: "0 * * * *", label: "hourly" },
  { value: "0 */4 * * *", label: "every 4 hours" },
  { value: "0 8 * * *", label: "daily at 8:00" },
  { value: "0 9 * * 1-5", label: "weekdays at 9:00" },
  { value: "0 9 * * 1", label: "weekly, Monday 9:00" },
]

function kebab(text: string): string {
  return text
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
}

/**
 * The add-routine wizard: pick a skill from the catalog, name it, size the
 * widget, pick a schedule. Produces a draft edit — nothing is written until
 * the Sync panel commits (ADR-0003).
 */
export function AddRoutineDialog({
  open,
  onOpenChange,
  catalog,
  existingSlugs,
  onAdd,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  catalog: CatalogFile
  existingSlugs: string[]
  onAdd: (routine: Routine, size: WidgetSize) => void
}) {
  const [skillId, setSkillId] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [slugEdited, setSlugEdited] = useState(false)
  const [slug, setSlug] = useState("")
  const [size, setSize] = useState<WidgetSize | null>(null)
  const [schedule, setSchedule] = useState<string | null>(null)
  const [customCron, setCustomCron] = useState("")
  const [instructions, setInstructions] = useState("")

  const skill = useMemo(
    () => catalog.skills.find((entry) => entry.id === skillId) ?? null,
    [catalog, skillId],
  )

  function reset() {
    setSkillId(null)
    setName("")
    setSlugEdited(false)
    setSlug("")
    setSize(null)
    setSchedule(null)
    setCustomCron("")
    setInstructions("")
  }

  function pickSkill(next: CatalogSkill) {
    setSkillId(next.id)
    setSize(next.widget.sizes.default)
    setSchedule(next.widget.schedule)
    if (!name) {
      setName(next.name)
      if (!slugEdited) setSlug(kebab(next.name))
    }
  }

  const effectiveSchedule = schedule === "custom" ? customCron : schedule
  const slugValid = slugSchema.safeParse(slug).success
  const slugTaken = existingSlugs.includes(slug)
  const canSubmit =
    skill != null &&
    name.trim().length > 0 &&
    slugValid &&
    !slugTaken &&
    size != null &&
    (effectiveSchedule?.trim().length ?? 0) > 0

  function submit() {
    if (!skill || !size || !effectiveSchedule) return
    onAdd(
      {
        slug,
        name: name.trim(),
        skill: skill.id,
        schedule: effectiveSchedule.trim(),
        enabled: true,
        ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
      },
      size,
    )
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a routine</DialogTitle>
          <DialogDescription>
            A skill from the catalog, run on a schedule, rendering one widget.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Skill</Label>
            {catalog.skills.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                The catalog is empty — no routine-capable skills published.
              </p>
            ) : (
              <div className="grid gap-1.5">
                {catalog.skills.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => pickSkill(entry)}
                    className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${
                      entry.id === skillId
                        ? "border-primary bg-muted"
                        : "border-border"
                    }`}
                  >
                    <span className="font-mono text-xs text-primary">
                      {entry.id}
                    </span>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {entry.widget.artifact}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {skill && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="routine-name">Name</Label>
                  <Input
                    id="routine-name"
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value)
                      if (!slugEdited) setSlug(kebab(event.target.value))
                    }}
                    placeholder="Daily Plan"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="routine-slug">Slug</Label>
                  <Input
                    id="routine-slug"
                    value={slug}
                    onChange={(event) => {
                      setSlugEdited(true)
                      setSlug(event.target.value)
                    }}
                    aria-invalid={slug.length > 0 && (!slugValid || slugTaken)}
                    className="font-mono"
                  />
                  {slugTaken && (
                    <p className="text-xs text-destructive">
                      already used by another routine
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Widget size</Label>
                  <div className="flex items-center gap-1.5">
                    <SizeSelect
                      label="columns"
                      max={GRID_MAX_COLS}
                      value={size?.cols ?? 1}
                      onChange={(cols) =>
                        setSize((current) => ({
                          cols,
                          rows: current?.rows ?? 1,
                        }))
                      }
                    />
                    <span className="text-xs text-ink-faint">×</span>
                    <SizeSelect
                      label="rows"
                      max={GRID_MAX_ROWS}
                      value={size?.rows ?? 1}
                      onChange={(rows) =>
                        setSize((current) => ({
                          cols: current?.cols ?? 1,
                          rows,
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Schedule</Label>
                  <Select
                    value={schedule ?? undefined}
                    onValueChange={(next) => {
                      if (typeof next === "string") setSchedule(next)
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={skill.widget.schedule}>
                        suggested — {skill.widget.schedule}
                      </SelectItem>
                      {SCHEDULE_PRESETS.filter(
                        (preset) => preset.value !== skill.widget.schedule,
                      ).map((preset) => (
                        <SelectItem key={preset.value} value={preset.value}>
                          {preset.label}
                        </SelectItem>
                      ))}
                      <SelectItem value="custom">custom cron…</SelectItem>
                    </SelectContent>
                  </Select>
                  {schedule === "custom" && (
                    <Input
                      value={customCron}
                      onChange={(event) => setCustomCron(event.target.value)}
                      placeholder="0 8 * * *"
                      className="font-mono"
                      aria-label="custom cron expression"
                    />
                  )}
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="routine-instructions">
                  Instructions{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional — passed to the skill on every run)
                  </span>
                </Label>
                <Textarea
                  id="routine-instructions"
                  value={instructions}
                  onChange={(event) => setInstructions(event.target.value)}
                  placeholder="Which projects matter, what to ignore, tone…"
                  rows={3}
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canSubmit} onClick={submit}>
            Add to draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SizeSelect({
  label,
  max,
  value,
  onChange,
}: {
  label: string
  max: number
  value: number
  onChange: (value: number) => void
}) {
  return (
    <Select
      value={String(value)}
      onValueChange={(next) => {
        const parsed = Number(next)
        if (Number.isInteger(parsed)) onChange(parsed)
      }}
    >
      <SelectTrigger aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Array.from({ length: max }, (_, index) => (
          <SelectItem key={index + 1} value={String(index + 1)}>
            {index + 1}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
