import { useEffect, useMemo, useState } from "react"

import type {
  CatalogFile,
  CatalogSkill,
  Routine,
  WidgetSize,
} from "@bulletin/schema"
import {
  GRID_MAX_ROWS,
  slugSchema,
  WIDGET_SIZE_PRESETS,
} from "@bulletin/schema"

import { cn } from "~/lib/utils"

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

const SCHEDULE_PRESETS = [
  { value: "0 * * * *", label: "dialog.presetHourly" },
  { value: "0 */4 * * *", label: "dialog.presetEvery4h" },
  { value: "0 8 * * *", label: "dialog.presetDaily8" },
  { value: "0 9 * * 1-5", label: "dialog.presetWeekdays9" },
  { value: "0 9 * * 1", label: "dialog.presetWeeklyMon9" },
] as const

export function kebab(text: string): string {
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
  columns,
  existingSlugs,
  onAdd,
  runner,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  catalog: CatalogFile
  /** The board's column count — clamps presets and the column stepper so a
      widget can't be authored wider than the board. */
  columns: number
  existingSlugs: string[]
  onAdd: (routine: Routine, size: WidgetSize) => void
  /** Set on team boards: the login whose Claude account owns the schedule
      (ADR-0010). Stamped on the routine and surfaced as a hint. */
  runner?: string
}) {
  const t = useT()
  const [skillId, setSkillId] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [slugEdited, setSlugEdited] = useState(false)
  const [slug, setSlug] = useState("")
  const [size, setSize] = useState<WidgetSize | null>(null)
  const [customSize, setCustomSize] = useState(false)
  const [schedule, setSchedule] = useState<string | null>(null)
  const [customCron, setCustomCron] = useState("")
  const [instructions, setInstructions] = useState("")

  const skill = useMemo(
    () => catalog.skills.find((entry) => entry.id === skillId) ?? null,
    [catalog, skillId],
  )

  // A widget can never be wider than the board it's being added to: an
  // over-wide size reaches findFreeSlot, whose column scan is empty and
  // loops forever. Re-clamp if the board narrows while the dialog is open.
  useEffect(() => {
    setSize((current) =>
      current && current.cols > columns
        ? { ...current, cols: columns }
        : current,
    )
  }, [columns])

  function reset() {
    setSkillId(null)
    setName("")
    setSlugEdited(false)
    setSlug("")
    setSize(null)
    setCustomSize(false)
    setSchedule(null)
    setCustomCron("")
    setInstructions("")
  }

  function pickSkill(next: CatalogSkill) {
    const { cols, rows } = next.widget.sizes.default
    setSkillId(next.id)
    // Clamp the catalog default to this board's width — a skill authored for
    // a 4-wide default must not seed a 4-wide widget onto a 2-column board.
    setSize({ cols: Math.min(cols, columns), rows })
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
        ...(runner ? { runner } : {}),
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
      {/* `sm:max-w-lg` (not `max-w-lg`) keeps the base mobile width cap;
          the height cap + scrollable middle keep the wizard usable on
          small phones with the keyboard open. */}
      <DialogContent className="flex max-h-[85svh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("dialog.title")}</DialogTitle>
          <DialogDescription>{t("dialog.description")}</DialogDescription>
        </DialogHeader>

        {/* -m-1 p-1: the overflow-y-auto scroll box would otherwise clip the
            3px focus/invalid ring of any field flush with its edge; the
            negative-margin/padding pair reserves a 4px halo without shifting
            the content off the dialog's column. */}
        <div className="-m-1 grid min-h-0 flex-1 content-start gap-4 overflow-y-auto p-1">
          <div className="grid gap-2">
            <Label>{t("dialog.skill")}</Label>
            {catalog.skills.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("dialog.catalogEmpty1")}{" "}
                <code className="font-mono text-xs">widget:</code>{" "}
                {t("dialog.catalogEmpty2")}{" "}
                <code className="font-mono text-xs">pnpm gen:catalog</code>.
              </p>
            ) : (
              <div className="grid gap-1.5">
                {catalog.skills.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => pickSkill(entry)}
                    className={`cursor-pointer rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${
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
              <div className="grid gap-3 sm:grid-cols-2 sm:items-start">
                <div className="grid gap-2">
                  <Label htmlFor="routine-name">{t("dialog.name")}</Label>
                  <Input
                    id="routine-name"
                    value={name}
                    onChange={(event) => {
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
                    aria-invalid={slug.length > 0 && (!slugValid || slugTaken)}
                    className="font-mono"
                  />
                  {slugTaken && (
                    <p className="text-xs text-destructive">
                      {t("dialog.slugTaken")}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid gap-2">
                <Label>{t("dialog.size")}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {WIDGET_SIZE_PRESETS.map((preset) => {
                    const cols = Math.min(preset.cols, columns)
                    const active =
                      !customSize &&
                      size?.cols === cols &&
                      size?.rows === preset.rows
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
                        <span className="font-mono text-[10px] text-ink-faint tabular-nums">
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
                      label={t("widget.rows")}
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
                )}
              </div>

              <div className="grid gap-2">
                <Label>{t("dialog.schedule")}</Label>
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
                      {t("dialog.suggested", { cron: skill.widget.schedule })}
                    </SelectItem>
                    {SCHEDULE_PRESETS.filter(
                      (preset) => preset.value !== skill.widget.schedule,
                    ).map((preset) => (
                      <SelectItem key={preset.value} value={preset.value}>
                        {t(preset.label)}
                      </SelectItem>
                    ))}
                    <SelectItem value="custom">
                      {t("dialog.customCron")}
                    </SelectItem>
                  </SelectContent>
                </Select>
                {schedule === "custom" && (
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
                <Label htmlFor="routine-instructions">
                  {t("dialog.instructions")}{" "}
                  <span className="font-normal text-muted-foreground">
                    {t("dialog.instructionsHint")}
                  </span>
                </Label>
                <Textarea
                  id="routine-instructions"
                  value={instructions}
                  onChange={(event) => setInstructions(event.target.value)}
                  placeholder={t("dialog.instructionsPlaceholder")}
                  rows={3}
                />
              </div>

              {runner && (
                <p className="text-xs text-muted-foreground">
                  {t("dialog.runnerHint", { login: runner })}
                </p>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("dialog.cancel")}
          </Button>
          <Button disabled={!canSubmit} onClick={submit}>
            {t("dialog.add")}
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
