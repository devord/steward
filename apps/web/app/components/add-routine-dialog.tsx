import { useEffect, useMemo, useState } from "react"

import type { Routine, RoutineHost, WidgetSize } from "@bulletin/schema"
import {
  GRID_MAX_ROWS,
  slugSchema,
  WIDGET_SIZE_PRESETS,
} from "@bulletin/schema"

import { cn } from "~/lib/utils"

import { Badge } from "~/components/ui/badge"
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
import { useT } from "../lib/i18n.tsx"
import type { DiscoveredSkill } from "../lib/skills.ts"

const SCHEDULE_PRESETS = [
  { value: "0 * * * *", label: "dialog.presetHourly" },
  { value: "0 */4 * * *", label: "dialog.presetEvery4h" },
  { value: "0 8 * * *", label: "dialog.presetDaily8" },
  { value: "0 9 * * 1-5", label: "dialog.presetWeekdays9" },
  { value: "0 9 * * 1", label: "dialog.presetWeeklyMon9" },
] as const

/** Wizard defaults for a prompt-only routine (ADR-0013). */
const DEFAULT_SCHEDULE = "0 8 * * *"
const DEFAULT_SIZE = { cols: 2, rows: 2 } as const

/** Select sentinels — never valid cron expressions. */
const MANUAL = "manual"
const CUSTOM = "custom"

export function kebab(text: string): string {
  return text
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
}

/**
 * The routine wizard, prompt-first (ADR-0013): describe what the widget
 * should show; picking a discovered skill (ADR-0015) is an optional
 * accelerator that pre-fills schedule/size from its `widget:` hints. Then
 * name it, size the widget, pick a schedule (or manual, ADR-0016) and a
 * host (ADR-0012). Produces a draft edit — nothing is written until the
 * Sync panel commits (ADR-0003).
 *
 * Two modes on one form. In **add** mode it authors a new routine and its
 * initial placement (size). In **edit** mode (`editRoutine` set) it changes
 * an existing routine's config: the slug is fixed (it keys widgets and the
 * published artifact path, so renaming would orphan both) and the size picker
 * is hidden — placement is a grid concern, adjusted by drag/resize.
 */
export function AddRoutineDialog({
  open,
  onOpenChange,
  skills,
  columns,
  existingSlugs,
  onAdd,
  editRoutine,
  onEdit,
  runner,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Routine-capable skills discovered across source repos (ADR-0015). */
  skills: DiscoveredSkill[]
  /** The board's column count — clamps presets and the column stepper so a
      widget can't be authored wider than the board. */
  columns: number
  existingSlugs: string[]
  onAdd: (routine: Routine, size: WidgetSize) => void
  /** When set, the form edits this routine in place instead of adding one. */
  editRoutine?: Routine | null
  /** Called on submit in edit mode with the updated routine (slug unchanged). */
  onEdit?: (routine: Routine) => void
  /** Set on team boards: the login whose Claude account owns the routine's
      cloud resource (ADR-0010/0016). Stamped on the routine and surfaced
      as a hint. */
  runner?: string
}) {
  const t = useT()
  const isEdit = editRoutine != null
  const [instructions, setInstructions] = useState("")
  const [skillId, setSkillId] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [nameEdited, setNameEdited] = useState(false)
  const [slugEdited, setSlugEdited] = useState(false)
  const [slug, setSlug] = useState("")
  const [size, setSize] = useState<WidgetSize>({
    cols: Math.min(DEFAULT_SIZE.cols, columns),
    rows: DEFAULT_SIZE.rows,
  })
  const [customSize, setCustomSize] = useState(false)
  const [schedule, setSchedule] = useState<string>(DEFAULT_SCHEDULE)
  const [customCron, setCustomCron] = useState("")
  const [host, setHost] = useState<RoutineHost>("cloud")

  const skill = useMemo(
    () => skills.find((entry) => entry.id === skillId) ?? null,
    [skills, skillId],
  )

  // A widget can never be wider than the board it's being added to: an
  // over-wide size reaches findFreeSlot, whose column scan is empty and
  // loops forever. Re-clamp if the board narrows while the dialog is open.
  useEffect(() => {
    setSize((current) =>
      current.cols > columns ? { ...current, cols: columns } : current,
    )
  }, [columns])

  // Opening in edit mode seeds the fields from the routine. Keyed on the slug
  // (stable for the life of an edit session) so it prefills once per open and
  // never clobbers in-progress edits. A cron off every preset shows as Custom;
  // a null schedule is Manual.
  useEffect(() => {
    if (!open || !editRoutine) return
    setInstructions(editRoutine.instructions ?? "")
    setSkillId(editRoutine.skill ?? null)
    setName(editRoutine.name)
    setSlug(editRoutine.slug)
    setSlugEdited(true)
    const cron = editRoutine.schedule
    if (cron == null) setSchedule(MANUAL)
    else if (SCHEDULE_PRESETS.some((p) => p.value === cron)) setSchedule(cron)
    else {
      setSchedule(CUSTOM)
      setCustomCron(cron)
    }
    setHost(editRoutine.host ?? "cloud")
  }, [open, editRoutine])

  function reset() {
    setInstructions("")
    setSkillId(null)
    setName("")
    setNameEdited(false)
    setSlugEdited(false)
    setSlug("")
    setSize({
      cols: Math.min(DEFAULT_SIZE.cols, columns),
      rows: DEFAULT_SIZE.rows,
    })
    setCustomSize(false)
    setSchedule(DEFAULT_SCHEDULE)
    setCustomCron("")
    setHost("cloud")
  }

  function pickSkill(next: DiscoveredSkill) {
    // The picker is an accelerator, not a gate — a second click deselects
    // back to a prompt-only routine, keeping whatever the user typed but
    // dropping any name/slug this skill auto-filled.
    if (next.id === skillId) {
      setSkillId(null)
      if (!nameEdited) {
        setName("")
        if (!slugEdited) setSlug("")
      }
      return
    }
    setSkillId(next.id)
    const defaultSize = next.widget.sizes?.default
    if (defaultSize) {
      // Clamp the skill's default to this board's width — a skill authored
      // for a 4-wide default must not seed a 4-wide widget onto a 2-column
      // board.
      setSize({
        cols: Math.min(defaultSize.cols, columns),
        rows: defaultSize.rows,
      })
      setCustomSize(false)
    }
    if (next.widget.schedule) setSchedule(next.widget.schedule)
    // Re-fill from the newly picked skill unless the user typed their own
    // name — otherwise switching skills leaves the first skill's name/slug.
    if (!nameEdited) {
      setName(next.name)
      if (!slugEdited) setSlug(kebab(next.name))
    }
  }

  const manual = schedule === MANUAL
  const effectiveSchedule = schedule === CUSTOM ? customCron : schedule
  const slugValid = slugSchema.safeParse(slug).success
  // In edit mode the slug is the routine's own and fixed — never "taken".
  const slugTaken = !isEdit && existingSlugs.includes(slug)
  // Source can be a picked skill or typed instructions; test skillId (not the
  // resolved `skill`) so an edited routine whose skill isn't currently
  // discoverable still counts as having a source.
  const canSubmit =
    (skillId != null || instructions.trim().length > 0) &&
    name.trim().length > 0 &&
    slugValid &&
    !slugTaken &&
    (manual || effectiveSchedule.trim().length > 0)

  function submit() {
    if (!canSubmit) return
    // Build the routine the same minimal way in both modes (cloud host and a
    // dropped schedule stay out of the YAML). In edit mode the slug is carried
    // through unchanged and fields the form doesn't own (runner, enabled) are
    // preserved from the original.
    const routine: Routine = {
      slug: isEdit ? editRoutine.slug : slug,
      name: name.trim(),
      ...(skillId ? { skill: skillId } : {}),
      ...(manual ? {} : { schedule: effectiveSchedule.trim() }),
      // Cloud is the default (ADR-0012) — leave it out of the YAML.
      ...(host === "local" ? { host } : {}),
      ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
      ...(isEdit
        ? editRoutine.runner
          ? { runner: editRoutine.runner }
          : {}
        : runner
          ? { runner }
          : {}),
      enabled: isEdit ? editRoutine.enabled : true,
    }
    if (isEdit) onEdit?.(routine)
    else onAdd(routine, size)
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
      {/* `sm:max-w-lg` (not `max-w-lg`) keeps the base mobile width cap;
          the height cap + scrollable middle keep the wizard usable on
          small phones with the keyboard open. */}
      <DialogContent className="flex max-h-[85svh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t(isEdit ? "dialog.editTitle" : "dialog.title")}
          </DialogTitle>
          <DialogDescription>
            {t(isEdit ? "dialog.editDescription" : "dialog.description")}
          </DialogDescription>
        </DialogHeader>

        {/* -m-1 p-1: the overflow-y-auto scroll box would otherwise clip the
            3px focus/invalid ring of any field flush with its edge; the
            negative-margin/padding pair reserves a 4px halo without shifting
            the content off the dialog's column. */}
        <div className="-m-1 grid min-h-0 flex-1 content-start gap-4 overflow-y-auto p-1">
          <div className="grid gap-2">
            <Label htmlFor="routine-prompt">{t("dialog.prompt")}</Label>
            <Textarea
              id="routine-prompt"
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder={t("dialog.promptPlaceholder")}
              rows={3}
            />
          </div>

          {skills.length > 0 && (
            <div className="grid gap-2">
              <Label>
                {t("dialog.skill")}{" "}
                <span className="font-normal text-muted-foreground">
                  {t("dialog.skillHint")}
                </span>
              </Label>
              <div className="grid gap-1.5">
                {skills.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    aria-pressed={entry.id === skillId}
                    onClick={() => pickSkill(entry)}
                    className={`cursor-pointer rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${
                      entry.id === skillId
                        ? "border-primary bg-muted"
                        : "border-border"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-xs text-primary">
                        {entry.id}
                      </span>
                      <Badge
                        variant="secondary"
                        className="h-[18px] px-1.5 font-mono text-xs text-ink-dim"
                      >
                        {t(
                          entry.source === "private"
                            ? "dialog.sourcePrivate"
                            : "dialog.sourceTeam",
                        )}
                      </Badge>
                    </span>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {entry.widget.artifact}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 sm:items-start">
            <div className="grid gap-2">
              <Label htmlFor="routine-name">{t("dialog.name")}</Label>
              <Input
                id="routine-name"
                value={name}
                onChange={(event) => {
                  setNameEdited(true)
                  setName(event.target.value)
                  if (!slugEdited) setSlug(kebab(event.target.value))
                }}
                placeholder={t("dialog.namePlaceholder")}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="routine-slug">{t("dialog.slug")}</Label>
              <Input
                id="routine-slug"
                value={slug}
                onChange={(event) => {
                  setSlugEdited(true)
                  setSlug(event.target.value)
                }}
                // The slug keys widgets and the artifact path — fixed once the
                // routine exists (delete + re-add to rename).
                disabled={isEdit}
                aria-invalid={slug.length > 0 && (!slugValid || slugTaken)}
                className="font-mono disabled:opacity-70"
              />
              {slugTaken && (
                <p className="text-xs text-destructive">
                  {t("dialog.slugTaken")}
                </p>
              )}
            </div>
          </div>

          {!isEdit && (
            <div className="grid gap-2">
              <Label>{t("dialog.size")}</Label>
              <div className="flex flex-wrap gap-1.5">
                {WIDGET_SIZE_PRESETS.map((preset) => {
                  const cols = Math.min(preset.cols, columns)
                  const active =
                    !customSize &&
                    size.cols === cols &&
                    size.rows === preset.rows
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setCustomSize(false)
                        setSize({ cols, rows: preset.rows })
                      }}
                      className={cn(
                        "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors hover:bg-muted",
                        active
                          ? "border-primary bg-muted"
                          : "border-border text-ink-dim",
                      )}
                    >
                      {t(`size.${preset.id}`)}
                      <span className="font-mono text-xs text-ink-faint tabular-nums">
                        {cols}×{preset.rows}
                      </span>
                    </button>
                  )
                })}
                <button
                  type="button"
                  aria-pressed={customSize}
                  onClick={() => setCustomSize(true)}
                  className={cn(
                    "rounded-lg border px-2.5 py-1 text-xs transition-colors hover:bg-muted",
                    customSize
                      ? "border-primary bg-muted"
                      : "border-border text-ink-dim",
                  )}
                >
                  {t("size.custom")}
                </button>
              </div>
              {customSize && (
                <div className="flex items-center gap-1.5">
                  <SizeSelect
                    label={t("widget.columns")}
                    max={columns}
                    value={size.cols}
                    onChange={(cols) =>
                      setSize((current) => ({ cols, rows: current.rows }))
                    }
                  />
                  <span className="text-xs text-ink-faint">×</span>
                  <SizeSelect
                    label={t("widget.rows")}
                    max={GRID_MAX_ROWS}
                    value={size.rows}
                    onChange={(rows) =>
                      setSize((current) => ({ cols: current.cols, rows }))
                    }
                  />
                </div>
              )}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 sm:items-start">
            <div className="grid gap-2">
              <Label>{t("dialog.schedule")}</Label>
              <Select
                value={schedule}
                onValueChange={(next) => {
                  if (typeof next === "string") setSchedule(next)
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {skill?.widget.schedule && (
                    <SelectItem value={skill.widget.schedule}>
                      {t("dialog.suggested", { cron: skill.widget.schedule })}
                    </SelectItem>
                  )}
                  {SCHEDULE_PRESETS.filter(
                    (preset) => preset.value !== skill?.widget.schedule,
                  ).map((preset) => (
                    <SelectItem key={preset.value} value={preset.value}>
                      {t(preset.label)}
                    </SelectItem>
                  ))}
                  <SelectItem value={MANUAL}>{t("dialog.manual")}</SelectItem>
                  <SelectItem value={CUSTOM}>
                    {t("dialog.customCron")}
                  </SelectItem>
                </SelectContent>
              </Select>
              {schedule === CUSTOM && (
                <Input
                  value={customCron}
                  onChange={(event) => setCustomCron(event.target.value)}
                  placeholder="0 8 * * *"
                  className="font-mono"
                  aria-label={t("dialog.customCronLabel")}
                />
              )}
            </div>
            <div className="grid gap-2">
              <Label>{t("dialog.host")}</Label>
              <Select
                value={host}
                onValueChange={(next) => {
                  if (next === "cloud" || next === "local") setHost(next)
                }}
              >
                <SelectTrigger className="w-full">
                  {/* Base UI renders the raw value in the trigger; map it to a
                      short proper-case label instead of the bare enum. */}
                  <SelectValue>
                    {(value) =>
                      value === "local"
                        ? t("dialog.hostLocalShort")
                        : t("dialog.hostCloudShort")
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cloud">{t("dialog.hostCloud")}</SelectItem>
                  <SelectItem value="local">{t("dialog.hostLocal")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {(host === "local" || manual) && (
            <p className="text-xs text-muted-foreground">
              {host === "local"
                ? t("dialog.hostLocalHint")
                : t("dialog.manualCloudHint")}
            </p>
          )}

          {runner && (
            <p className="text-xs text-muted-foreground">
              {t("dialog.runnerHint", { login: runner })}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              reset()
              onOpenChange(false)
            }}
          >
            {t("dialog.cancel")}
          </Button>
          <Button disabled={!canSubmit} onClick={submit}>
            {t(isEdit ? "dialog.save" : "dialog.add")}
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
