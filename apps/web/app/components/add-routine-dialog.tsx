import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"

import type {
  Routine,
  RoutineHost,
  WidgetParam,
  WidgetSize,
} from "@steward/schema"
import { repoRefSchema, slugSchema } from "@steward/schema"
import {
  Activity,
  CheckIcon,
  ChevronRightIcon,
  LayoutGrid,
  ListChecks,
  PenLine,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

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
import { useT } from "../lib/i18n.tsx"
import type { DiscoveredTemplate } from "../lib/templates.ts"
import type { RepoSearchResult } from "../routes/repos.ts"
import { TokenCombobox } from "./token-combobox.tsx"
import { CopyableCommand } from "./widget-card.tsx"

const SCHEDULE_PRESETS = [
  { value: "0 * * * *", label: "dialog.presetHourly" },
  { value: "0 */4 * * *", label: "dialog.presetEvery4h" },
  { value: "0 8 * * *", label: "dialog.presetDaily8" },
  { value: "0 9 * * 1-5", label: "dialog.presetWeekdays9" },
  { value: "0 9 * * 1", label: "dialog.presetWeeklyMon9" },
] as const

/** Wizard defaults when the template declares no hint (ADR-0013/0022). */
const DEFAULT_SCHEDULE = "0 8 * * *"
const DEFAULT_SIZE = { cols: 2, rows: 2 } as const

/** Select sentinels — never valid cron expressions. */
const MANUAL = "manual"
const CUSTOM = "custom"

/** The freeform built-in (ADR-0022): what the wizard writes when no
    template card is picked. Not a card itself — it ships without a
    `widget:` block, so discovery never offers it. */
const CUSTOM_TEMPLATE = "custom"

/** Per-template glyphs for the picker's leading anchor. Known built-ins get
    a specific mark; a discovered (repo/team) template falls back to the
    generic widget glyph. The icon is decoration for the id, never the pick
    target — chrome stays quiet, accent only when selected. */
const TEMPLATE_ICONS: Record<string, LucideIcon> = {
  custom: PenLine,
  "daily-plan": ListChecks,
  "repo-pulse": Activity,
}
const templateIcon = (id: string): LucideIcon =>
  TEMPLATE_ICONS[id] ?? LayoutGrid

type Step = "intent" | "config"

/** A param's answer as the form holds it (string or repo list). */
type ParamValue = string | string[]

export function kebab(text: string): string {
  return text
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
}

/**
 * First free slug for `base`: the base itself, else `base-2`, `base-3`, …
 * Auto-derived slugs must never collide — a second routine from the same
 * template shouldn't make the user invent the differentiator. The taken
 * error stays for hand-typed slugs only.
 */
export function uniqueSlug(base: string, taken: readonly string[]): string {
  if (base.length === 0 || !taken.includes(base)) return base
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`
    if (!taken.includes(candidate)) return candidate
  }
}

/** Normalize a param answer to a list (repos params; tolerates a
    hand-authored single string in the YAML). */
function paramList(value: ParamValue | undefined): string[] {
  if (value == null) return []
  return Array.isArray(value) ? value : [value]
}

function paramText(value: ParamValue | undefined): string {
  return typeof value === "string" ? value : ""
}

function isRepoRef(token: string): boolean {
  return repoRefSchema.safeParse(token).success
}

/** Connector account names are single tokens (`GitHub`, `Google_Calendar`). */
function isConnectorName(token: string): boolean {
  return /^\S+$/.test(token)
}

/**
 * The routine wizard, prompt-first (ADR-0013), in two steps. **Intent**:
 * describe what the widget should show; picking a discovered template
 * (ADR-0015) is an optional accelerator. **Configure**: the template's own
 * declared params first (ADR-0020), then name, schedule (or manual,
 * ADR-0016), host (ADR-0012), and a collapsed Advanced section for the
 * cloud run's extra repos and connector allowlist (ADR-0018). Produces a
 * draft edit — nothing is written until the Sync panel commits (ADR-0003).
 * The widget's initial size is the template's default — sizing is a grid
 * affordance (drag/resize), never a wizard question.
 *
 * In **edit** mode (`editRoutine` set) it opens on the configure step with
 * Back available: the slug is fixed (it keys widgets and the published
 * artifact path, so renaming would orphan both).
 */
export function AddRoutineDialog({
  open,
  onOpenChange,
  templates,
  columns,
  existingSlugs,
  onAdd,
  editRoutine,
  onEdit,
  runner,
  initialTemplate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Routine-capable templates discovered across source repos (ADR-0015). */
  templates: DiscoveredTemplate[]
  /** The board's column count — clamps the template's default size so a
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
  /** Add mode only: pre-select this template on open — the "new routine
      from template" entry point (templates ledger, ADR-0029). Ignored in
      edit mode; the picker stays fully editable after seeding. */
  initialTemplate?: string | null
}) {
  const t = useT()
  const isEdit = editRoutine != null
  const [step, setStep] = useState<Step>("intent")
  const [instructions, setInstructions] = useState("")
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [nameEdited, setNameEdited] = useState(false)
  const [slugEdited, setSlugEdited] = useState(false)
  const [slug, setSlug] = useState("")
  const [schedule, setSchedule] = useState<string>(DEFAULT_SCHEDULE)
  const [scheduleEdited, setScheduleEdited] = useState(false)
  const [customCron, setCustomCron] = useState("")
  const [host, setHost] = useState<RoutineHost>("cloud")
  const [params, setParams] = useState<Record<string, ParamValue>>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [extraRepos, setExtraRepos] = useState<string[]>([])
  const [connectors, setConnectors] = useState<string[]>([])
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const template = useMemo(
    () => templates.find((entry) => entry.id === templateId) ?? null,
    [templates, templateId],
  )
  /** The picked template's declared inputs (ADR-0020); [] when prompt-only or
      the template isn't currently discoverable. */
  const declaredParams = template?.widget.params ?? []

  // Typeahead pool for repo pickers: the viewer's own repos via /repos.
  // Failures resolve to [] — the pickers accept typed owner/repo anyway.
  const suggestRepos = useCallback(
    async (query: string, signal: AbortSignal) => {
      const res = await fetch(`/repos?q=${encodeURIComponent(query)}`, {
        signal,
      })
      if (!res.ok) return []
      const body: RepoSearchResult = await res.json()
      return body.repos
    },
    [],
  )

  // The seeding effect reads the template list without depending on it: a
  // background revalidation swapping the array's identity mid-edit must not
  // re-run the prefill over in-progress edits.
  const templatesRef = useRef(templates)
  templatesRef.current = templates
  const existingSlugsRef = useRef(existingSlugs)
  existingSlugsRef.current = existingSlugs

  // Opening in add mode from a "new routine from template" entry point seeds
  // the picker exactly as a click on its card would (name, slug, suggested
  // schedule, connectors) — via refs and stable deps so it seeds once per
  // open and never clobbers in-progress edits, same as the edit seed below.
  useEffect(() => {
    if (!open || editRoutine || initialTemplate == null) return
    const entry = templatesRef.current.find((e) => e.id === initialTemplate)
    if (!entry) return
    setTemplateId(entry.id)
    if (entry.widget.schedule) setSchedule(entry.widget.schedule)
    const suggested = entry.widget.connectors ?? []
    if (suggested.length > 0) {
      setConnectors((current) => [...new Set([...current, ...suggested])])
    }
    setName(entry.name)
    setSlug(uniqueSlug(kebab(entry.name), existingSlugsRef.current))
  }, [open, editRoutine, initialTemplate])

  // Opening in edit mode seeds the fields from the routine and jumps to the
  // configure step. Keyed on the routine (stable for the life of an edit
  // session) so it prefills once per open and never clobbers in-progress
  // edits. A cron off every preset shows as Custom; a null schedule is
  // Manual. `repos` splits into the template's watched repos (owned by the
  // repos-type params) and the leftover Advanced extras.
  useEffect(() => {
    if (!open || !editRoutine) return
    setStep("config")
    setInstructions(editRoutine.instructions ?? "")
    setTemplateId(editRoutine.template ?? null)
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
    // The routine's own schedule is a choice already made — re-picking a
    // template on the way back must not clobber it with a suggestion.
    setScheduleEdited(true)
    setHost(editRoutine.host ?? "cloud")
    setParams(editRoutine.params ?? {})
    const declared =
      templatesRef.current.find((entry) => entry.id === editRoutine.template)
        ?.widget.params ?? []
    const paramRepos = new Set(
      declared
        .filter((param) => param.type === "repos")
        .flatMap((param) => paramList(editRoutine.params?.[param.key])),
    )
    const extras = (editRoutine.repos ?? []).filter(
      (repo) => !paramRepos.has(repo),
    )
    setExtraRepos(extras)
    setConnectors(editRoutine.connectors ?? [])
    setAdvancedOpen(
      extras.length > 0 || (editRoutine.connectors ?? []).length > 0,
    )
  }, [open, editRoutine])

  function reset() {
    setStep("intent")
    setInstructions("")
    setTemplateId(null)
    setName("")
    setNameEdited(false)
    setSlugEdited(false)
    setSlug("")
    setSchedule(DEFAULT_SCHEDULE)
    setScheduleEdited(false)
    setCustomCron("")
    setHost("cloud")
    setParams({})
    setTouched({})
    setExtraRepos([])
    setConnectors([])
    setAdvancedOpen(false)
  }

  function pickTemplate(next: DiscoveredTemplate) {
    // The picker is an accelerator, not a gate — a second click deselects
    // back to a prompt-only routine, keeping whatever the user typed but
    // dropping any name/slug this template auto-filled.
    if (next.id === templateId) {
      setTemplateId(null)
      if (!nameEdited) {
        setName("")
        if (!slugEdited) setSlug("")
      }
      return
    }
    setTemplateId(next.id)
    // Suggested cron seeds the schedule only until the user picks their
    // own — same guard as name/slug below.
    if (!scheduleEdited && next.widget.schedule) {
      setSchedule(next.widget.schedule)
    }
    // The template's suggested connectors join the allowlist (ADR-0020) —
    // union, not replace, so a hand-added connector survives a re-pick.
    const suggested = next.widget.connectors ?? []
    if (suggested.length > 0) {
      setConnectors((current) => [...new Set([...current, ...suggested])])
    }
    // Re-fill from the newly picked template unless the user typed their own
    // name — otherwise switching templates leaves the first template's name/slug.
    if (!nameEdited) {
      setName(next.name)
      if (!slugEdited) setSlug(uniqueSlug(kebab(next.name), existingSlugs))
    }
  }

  function setParam(key: string, value: ParamValue) {
    setParams((current) => ({ ...current, [key]: value }))
  }

  function paramMissing(param: WidgetParam): boolean {
    if (!param.required) return false
    const value = params[param.key]
    return param.type === "repos"
      ? paramList(value).length === 0
      : paramText(value).trim().length === 0
  }

  const manual = schedule === MANUAL
  const effectiveSchedule = schedule === CUSTOM ? customCron : schedule
  const slugValid = slugSchema.safeParse(slug).success
  // In edit mode the slug is the routine's own and fixed — never "taken".
  const slugTaken = !isEdit && existingSlugs.includes(slug)
  // No card picked (or the routine is explicitly `custom`) means the
  // freeform template — its whole brief is the prompt, so the prompt is
  // required. A picked template is a source by itself; test templateId
  // (not the resolved `template`) so an edited routine whose template
  // isn't currently discoverable still counts.
  const isCustom = templateId == null || templateId === CUSTOM_TEMPLATE
  const hasSource = !isCustom || instructions.trim().length > 0
  const paramsComplete = declaredParams.every((param) => !paramMissing(param))
  const canSubmit =
    hasSource &&
    paramsComplete &&
    name.trim().length > 0 &&
    slugValid &&
    !slugTaken &&
    (manual || effectiveSchedule.trim().length > 0)

  function submit() {
    if (!canSubmit) return
    // Collect the declared params' answers, dropping empties (the schema
    // treats absent as the honest "no answer"). Keys the current template
    // doesn't declare — an edit under a renamed param, or a template that
    // isn't discoverable right now — round-trip untouched (ADR-0020).
    const declaredKeys = new Set(declaredParams.map((param) => param.key))
    const collected: Record<string, ParamValue> = {}
    for (const param of declaredParams) {
      if (param.type === "repos") {
        const list = paramList(params[param.key])
        if (list.length > 0) collected[param.key] = list
      } else {
        const text = paramText(params[param.key]).trim()
        if (text.length > 0) collected[param.key] = text
      }
    }
    // Unknown keys round-trip only while the template itself is unchanged
    // (that's the renamed-param / undiscoverable-template tolerance).
    // Switching templates makes the old answers stale — drop them rather
    // than strand params no template declares.
    const sameTemplate =
      isEdit && (templateId ?? CUSTOM_TEMPLATE) === editRoutine.template
    const preserved = Object.fromEntries(
      Object.entries(sameTemplate ? (editRoutine.params ?? {}) : {}).filter(
        ([key]) => !declaredKeys.has(key),
      ),
    )
    const mergedParams = { ...preserved, ...collected }
    // Watched repos become source repos (ADR-0020): union the repos-type
    // answers with the Advanced extras so the cloud run can read what the
    // template queries (ADR-0018).
    const paramRepos = declaredParams
      .filter((param) => param.type === "repos")
      .flatMap((param) => paramList(params[param.key]))
    const repos = [...new Set([...paramRepos, ...extraRepos])]

    // Build the routine the same minimal way in both modes (cloud host, a
    // dropped schedule, and empty lists stay out of the YAML). In edit mode
    // the slug is carried through unchanged and fields the form doesn't own
    // (runner, enabled) are preserved from the original.
    const routine: Routine = {
      slug: isEdit ? editRoutine.slug : slug,
      name: name.trim(),
      // Freeform routines name the custom built-in — every routine has a
      // template (ADR-0022).
      template: templateId ?? CUSTOM_TEMPLATE,
      ...(manual ? {} : { schedule: effectiveSchedule.trim() }),
      // Cloud is the default (ADR-0012) — leave it out of the YAML.
      ...(host === "local" ? { host } : {}),
      ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
      ...(Object.keys(mergedParams).length > 0 ? { params: mergedParams } : {}),
      ...(repos.length > 0 ? { repos } : {}),
      ...(connectors.length > 0 ? { connectors } : {}),
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
    else {
      // Initial size is the template's default (wizard default for custom),
      // clamped to this board's width — an over-wide size reaches
      // findFreeSlot, whose column scan is empty and loops forever.
      // Resizing afterwards is a grid affordance, not a wizard question.
      const hint = template?.widget.sizes?.default ?? DEFAULT_SIZE
      onAdd(routine, {
        cols: Math.min(hint.cols, columns),
        rows: hint.rows,
      })
    }
    reset()
    onOpenChange(false)
  }

  // Moving between steps swaps the buttons under the pointer — put focus on
  // the incoming panel so keyboard flow resumes from its top.
  const panelRef = useRef<HTMLDivElement>(null)
  const prevStep = useRef(step)
  useEffect(() => {
    if (prevStep.current !== step) {
      panelRef.current?.focus({ preventScroll: true })
    }
    prevStep.current = step
  }, [step])

  const stepIndex = step === "intent" ? 1 : 2

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
            {step === "intent" ? (
              t("dialog.description")
            ) : isEdit ? (
              t("dialog.editDescription")
            ) : template ? (
              <>
                <span className="font-mono text-primary">{template.id}</span>
                {" — "}
                {template.widget.artifact}
              </>
            ) : (
              // No resolved card: the freeform built-in, or an edited
              // routine whose template isn't discoverable right now —
              // show the id either way; the hint is custom's alone.
              <>
                <span className="font-mono text-primary">
                  {templateId ?? CUSTOM_TEMPLATE}
                </span>
                {isCustom && (
                  <>
                    {" — "}
                    {t("dialog.customHint")}
                  </>
                )}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* -m-1 p-1: the overflow-y-auto scroll box would otherwise clip the
            3px focus/invalid ring of any field flush with its edge; the
            negative-margin/padding pair reserves a 4px halo without shifting
            the content off the dialog's column. */}
        {/* overflow-x-clip: setting overflow-y-auto alone makes the browser
            compute overflow-x to `auto` too (the visible-axis pairing rule),
            so a stray sub-pixel/focus-ring/negative-margin spill surfaces a
            horizontal scrollbar. Clipping x keeps the vertical scroll while
            containing that spill. */}
        <div className="-m-1 min-h-0 flex-1 overflow-x-clip overflow-y-auto p-1">
          {/* Remount per step: the enter animation plays on the incoming
              panel only (reduced motion: it just appears). */}
          <div
            key={step}
            ref={panelRef}
            tabIndex={-1}
            className={cn(
              // minmax(0,1fr): cap the single column at the dialog's width
              // so long mono content (the promote one-liner) truncates
              // instead of widening the whole panel.
              "grid grid-cols-[minmax(0,1fr)] content-start gap-4 outline-none",
              "duration-200 animate-in fade-in motion-reduce:animate-none",
              step === "config"
                ? "slide-in-from-right-4"
                : "slide-in-from-left-4",
            )}
          >
            {step === "intent" ? (
              // Template is the step's one question (ADR-0022): the custom
              // card leads, selected by default with the prompt nested inside
              // it, so opening the dialog and typing stays the on-ramp.
              <div className="grid gap-2">
                <Label>{t("dialog.template")}</Label>
                <div className="grid gap-1.5">
                  <TemplateCard
                    id={CUSTOM_TEMPLATE}
                    icon={PenLine}
                    badge={t("dialog.sourceBuiltin")}
                    description={t("dialog.customCard")}
                    selected={isCustom}
                    onPick={() => setTemplateId(null)}
                  >
                    {isCustom && (
                      // Seamless writing area, not a boxed input: the card's
                      // own border frames the brief, so the field carries no
                      // border/fill/ring of its own (that nesting read as a
                      // box-in-a-box). The hairline above sets it apart; the
                      // caret is its focus affordance.
                      <textarea
                        id="routine-prompt"
                        // The on-ramp: open the dialog and type. Custom is
                        // preselected, so the prompt takes initial focus.
                        autoFocus
                        aria-label={t("dialog.prompt")}
                        value={instructions}
                        onChange={(event) =>
                          setInstructions(event.target.value)
                        }
                        placeholder={t("dialog.promptPlaceholder")}
                        rows={3}
                        className="field-sizing-content min-h-[4.5rem] w-full resize-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                      />
                    )}
                  </TemplateCard>
                  {templates.map((entry) => (
                    <TemplateCard
                      key={entry.id}
                      id={entry.id}
                      icon={templateIcon(entry.id)}
                      badge={t(
                        entry.source === "repo"
                          ? "dialog.sourceRepo"
                          : "dialog.sourceBuiltin",
                      )}
                      description={entry.widget.artifact}
                      selected={entry.id === templateId}
                      onPick={() => pickTemplate(entry)}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <>
                {declaredParams.length > 0 && (
                  <fieldset className="grid gap-3 rounded-lg border border-border-dim px-3 pt-1 pb-3">
                    <legend className="px-1 font-mono text-xs text-muted-foreground">
                      {template?.id}
                    </legend>
                    {declaredParams.map((param) => (
                      <ParamField
                        key={param.key}
                        param={param}
                        value={params[param.key]}
                        touched={touched[param.key] === true}
                        onChange={(value) => setParam(param.key, value)}
                        onBlur={() =>
                          setTouched((current) => ({
                            ...current,
                            [param.key]: true,
                          }))
                        }
                        suggestRepos={suggestRepos}
                      />
                    ))}
                  </fieldset>
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
                        if (!slugEdited)
                          setSlug(
                            uniqueSlug(
                              kebab(event.target.value),
                              existingSlugs,
                            ),
                          )
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
                      // The slug keys widgets and the artifact path — fixed
                      // once the routine exists (delete + re-add to rename).
                      disabled={isEdit}
                      aria-invalid={
                        slug.length > 0 && (!slugValid || slugTaken)
                      }
                      className="font-mono disabled:opacity-70"
                    />
                    {slugTaken && (
                      <p className="text-xs text-destructive">
                        {t("dialog.slugTaken")}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 sm:items-start">
                  <div className="grid gap-2">
                    <Label>{t("dialog.schedule")}</Label>
                    <Select
                      value={schedule}
                      onValueChange={(next) => {
                        if (typeof next === "string") {
                          setScheduleEdited(true)
                          setSchedule(next)
                        }
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {template?.widget.schedule && (
                          <SelectItem value={template.widget.schedule}>
                            {t("dialog.suggested", {
                              cron: template.widget.schedule,
                            })}
                          </SelectItem>
                        )}
                        {SCHEDULE_PRESETS.filter(
                          (preset) =>
                            preset.value !== template?.widget.schedule,
                        ).map((preset) => (
                          <SelectItem key={preset.value} value={preset.value}>
                            {t(preset.label)}
                          </SelectItem>
                        ))}
                        <SelectItem value={MANUAL}>
                          {t("dialog.manual")}
                        </SelectItem>
                        <SelectItem value={CUSTOM}>
                          {t("dialog.customCron")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {schedule === CUSTOM && (
                      <Input
                        value={customCron}
                        onChange={(event) => {
                          setScheduleEdited(true)
                          setCustomCron(event.target.value)
                        }}
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
                        {/* Base UI renders the raw value in the trigger; map
                            it to a short proper-case label instead of the
                            bare enum. */}
                        <SelectValue>
                          {(value) =>
                            value === "local"
                              ? t("dialog.hostLocalShort")
                              : t("dialog.hostCloudShort")
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cloud">
                          {t("dialog.hostCloud")}
                        </SelectItem>
                        <SelectItem value="local">
                          {t("dialog.hostLocal")}
                        </SelectItem>
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

                {/* Cloud-run access (ADR-0018) — cloud-only fields; a local
                    routine's stored values are preserved, just not edited
                    here. */}
                {host === "cloud" && (
                  <div className="grid justify-items-start gap-3">
                    <button
                      type="button"
                      aria-expanded={advancedOpen}
                      onClick={() => setAdvancedOpen((value) => !value)}
                      className="flex cursor-pointer items-center gap-1 rounded-sm text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <ChevronRightIcon
                        className={cn(
                          "size-4 transition-transform duration-200 motion-reduce:transition-none",
                          advancedOpen && "rotate-90",
                        )}
                      />
                      {t("dialog.advanced")}
                    </button>
                    {advancedOpen && (
                      <div className="grid w-full gap-4 duration-200 animate-in fade-in slide-in-from-top-1 motion-reduce:animate-none">
                        <div className="grid gap-2">
                          <Label htmlFor="routine-repos">
                            {t("dialog.extraRepos")}
                          </Label>
                          <TokenCombobox
                            id="routine-repos"
                            value={extraRepos}
                            onChange={setExtraRepos}
                            validate={isRepoRef}
                            suggest={suggestRepos}
                            placeholder="owner/repo"
                            emptyHint={t("dialog.repoEmpty")}
                          />
                          <p className="text-xs text-muted-foreground">
                            {t("dialog.extraReposHint")}
                          </p>
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="routine-connectors">
                            {t("dialog.connectors")}
                          </Label>
                          <TokenCombobox
                            id="routine-connectors"
                            value={connectors}
                            onChange={setConnectors}
                            validate={isConnectorName}
                            placeholder="Google_Calendar"
                            emptyHint={t("dialog.connectorEmpty")}
                          />
                          <p className="text-xs text-muted-foreground">
                            {t("dialog.connectorsHint")}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Templates are authored in Claude Code, not the app
                    (ADR-0022) — promoting a grown routine is a terminal
                    one-liner, same pattern as manual local runs. */}
                {isEdit && (
                  <div className="grid justify-items-start gap-1.5 border-t border-border-dim pt-3">
                    <span className="text-xs text-muted-foreground">
                      {t("dialog.promote")}
                    </span>
                    <CopyableCommand
                      command={`claude "Promote the steward routine \`${slug}\` into a routine template: read it in data/routines.yaml, write templates/routines/ with widget: frontmatter (declared params, size/schedule/connector hints; concrete values become params), then point the routine's template: at it."`}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t("dialog.promoteHint")}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <div
            className="flex items-center gap-1 self-center sm:mr-auto"
            aria-label={t("dialog.stepLabel", { n: stepIndex })}
          >
            <span className="sr-only">
              {t("dialog.stepLabel", { n: stepIndex })}
            </span>
            {(["intent", "config"] as const).map((mark) => (
              <span
                key={mark}
                aria-hidden
                className={cn(
                  "h-1 w-4 rounded-full transition-colors duration-200",
                  mark === step ? "bg-primary" : "bg-border",
                )}
              />
            ))}
          </div>
          {step === "intent" ? (
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  reset()
                  onOpenChange(false)
                }}
              >
                {t("dialog.cancel")}
              </Button>
              <Button disabled={!hasSource} onClick={() => setStep("config")}>
                {t("dialog.next")}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setStep("intent")}>
                {t("dialog.back")}
              </Button>
              <Button disabled={!canSubmit} onClick={submit}>
                {t(isEdit ? "dialog.save" : "dialog.add")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * One template card in the intent step: mono id + source badge + the
 * artifact line — the pick is about what the widget shows. Size, schedule,
 * and params surface where they act (the grid and the configure step),
 * never as pre-pick metadata. The `custom` built-in renders through the
 * same card, synthesized by the wizard (it has no `widget:` block to
 * discover) — its prompt nests inside the card as `children`, under a
 * hairline, so the card's one border owns both and the field never reads
 * as a sibling list item.
 */
function TemplateCard({
  id,
  icon: Icon,
  badge,
  description,
  selected,
  onPick,
  children,
}: {
  id: string
  /** Leading glyph — the row's fixed left anchor (see TEMPLATE_ICONS). */
  icon: LucideIcon
  /** Translated source label (Built-in / Team / Private). */
  badge: string
  description: string
  selected: boolean
  onPick: () => void
  /** Rendered inside the card below a hairline — the custom card's prompt. */
  children?: ReactNode
}) {
  return (
    <div
      className={cn(
        "rounded-lg border text-sm transition-colors",
        // Selection is a translucent accent wash under unchanged ink (the
        // DESIGN.md idiom, same family as the app's menu/nav highlights) —
        // theme-symmetric where a solid bg-muted fill wasn't: on the light
        // ramp bg2 sits two steps below the dialog surface and read as a
        // heavy dark block, while on dark it was a whisper. Hover lives on
        // the container: with nothing nested the header button fills it.
        selected
          ? "border-primary bg-primary/10"
          : "border-border hover:bg-primary/5",
      )}
    >
      <button
        type="button"
        aria-pressed={selected}
        onClick={onPick}
        className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Icon
          aria-hidden
          className={cn(
            "size-4 shrink-0 transition-colors",
            selected ? "text-primary" : "text-muted-foreground",
          )}
        />
        {/* min-w-0 lets the one-line description truncate instead of pushing
            the check off — every row stays the same height. */}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="font-mono text-xs text-primary">{id}</span>
            <Badge
              variant="secondary"
              className="h-[18px] px-1.5 font-mono text-xs text-ink-dim"
            >
              {badge}
            </Badge>
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {description}
          </span>
        </span>
        <CheckIcon
          aria-hidden
          className={cn(
            "size-4 shrink-0 text-primary transition-opacity duration-100",
            selected ? "opacity-100" : "opacity-0",
          )}
        />
      </button>
      {children && (
        <div className="border-t border-border-dim px-3 pt-2.5 pb-3">
          {children}
        </div>
      )}
    </div>
  )
}

/**
 * One declared template input (ADR-0020) rendered by its type: `string` → text
 * field, `select` → closed list, `repos` → repo token picker. Required-ness
 * validates on blur; the footer submit stays disabled until complete either
 * way.
 */
function ParamField({
  param,
  value,
  touched,
  onChange,
  onBlur,
  suggestRepos,
}: {
  param: WidgetParam
  value: string | string[] | undefined
  touched: boolean
  onChange: (value: string | string[]) => void
  onBlur: () => void
  suggestRepos: (query: string, signal: AbortSignal) => Promise<string[]>
}) {
  const t = useT()
  const id = `routine-param-${param.key}`
  const missing =
    param.required &&
    (param.type === "repos"
      ? paramList(value).length === 0
      : paramText(value).trim().length === 0)
  const showMissing = touched && missing
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>
        {param.label}
        {param.required && (
          <span aria-hidden className="text-destructive">
            *
          </span>
        )}
      </Label>
      {param.type === "repos" ? (
        <TokenCombobox
          id={id}
          value={paramList(value)}
          onChange={onChange}
          onBlur={onBlur}
          validate={isRepoRef}
          suggest={suggestRepos}
          placeholder={param.placeholder ?? "owner/repo"}
          emptyHint={t("dialog.repoEmpty")}
          invalid={showMissing}
        />
      ) : param.type === "select" ? (
        <Select
          value={paramText(value)}
          onValueChange={(next) => {
            if (typeof next === "string") onChange(next)
          }}
        >
          <SelectTrigger
            id={id}
            className="w-full"
            aria-required={param.required || undefined}
            aria-invalid={showMissing || undefined}
            onBlur={onBlur}
          >
            <SelectValue>
              {(current) =>
                typeof current === "string" && current.length > 0 ? (
                  current
                ) : (
                  <span className="text-muted-foreground">
                    {param.placeholder ?? ""}
                  </span>
                )
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(param.options ?? []).map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          id={id}
          value={paramText(value)}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          placeholder={param.placeholder}
          aria-required={param.required || undefined}
          aria-invalid={showMissing || undefined}
        />
      )}
      {showMissing ? (
        <p className="text-xs text-destructive">{t("dialog.required")}</p>
      ) : (
        param.hint && (
          <p className="text-xs text-muted-foreground">{param.hint}</p>
        )
      )}
    </div>
  )
}
