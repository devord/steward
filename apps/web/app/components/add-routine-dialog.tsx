import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { KeyboardEvent, ReactNode } from "react"

import type {
  Routine,
  RoutineHost,
  WidgetParam,
  WidgetSize,
} from "@steward/schema"
import {
  CATEGORY_NAME_MAX,
  repoRefSchema,
  resolveCategory,
  slugSchema,
  templateKind,
} from "@steward/schema"
import { CheckIcon, ChevronRightIcon, SearchIcon } from "lucide-react"

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
import { ARTIFACT_FONT_STYLE } from "../lib/artifact-font.ts"
import { CONNECTOR_CATALOG, connectorLabel } from "../lib/connectors.ts"
import { useT } from "../lib/i18n.tsx"
import type { DiscoveredTemplate } from "../lib/templates.ts"
import { frameArtifactHtml } from "../lib/theme.ts"
import { useResolvedTheme } from "../lib/use-appearance.ts"
import type { RepoSearchResult } from "../routes/repos.ts"
import { SCHEDULE_PRESETS, schedulePhraseKey } from "../lib/schedules.ts"
import { TokenCombobox } from "./token-combobox.tsx"
import { CopyableCommand } from "./widget-card.tsx"

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

/**
 * Above this many discovered templates the picker grows a filter field. Below
 * it the whole list is on screen at once and a search box is chrome that earns
 * nothing (product register: progressive disclosure over permanent furniture).
 */
const FILTER_THRESHOLD = 6

/** Marks a pick row for the list's arrow-key navigation. `custom` carries
    `data-row="custom"` so ArrowDown from the filter can skip it — the filter
    browses templates; the brief has its own field. */
const ROW_SELECTOR = "[data-row]"
const TEMPLATE_ROW_SELECTOR = "[data-row='template']"

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

/** Title-case a kebab or spaced token for a display name: `corza` →
    `Corza`, `my-repo` → `My Repo`. */
function titleCase(token: string): string {
  return token
    .split(/[-\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

/** A template's name for seeding the Name field: the declared name, or its
    title-cased form when it merely restates the id (`daily-plan` → `Daily
    Plan`) — a machine string must not ghost into the human name field while
    the slug caption below shows the real slug. */
function templateDisplayName(entry: DiscoveredTemplate): string {
  return entry.name === entry.id ? titleCase(entry.name) : entry.name
}

/**
 * The subject a template slugs its instances after (ADR-0040): the value of
 * its `subjectParam`, reduced to a bare token — a repo's name without its
 * owner (`Form-Factory/corza` → `corza`), or a string param's trimmed text.
 * "" when the template names no subject, the param isn't declared, or it's
 * unanswered — callers fall back to name-seeding.
 */
function subjectToken(
  template: DiscoveredTemplate | null,
  params: Record<string, ParamValue>,
): string {
  const key = template?.widget.subjectParam
  if (!key) return ""
  const param = template.widget.params?.find((entry) => entry.key === key)
  if (!param) return ""
  if (param.type === "repos") {
    const first = paramList(params[key])[0] ?? ""
    return first.split("/").at(-1) ?? ""
  }
  return paramText(params[key]).trim()
}

function isRepoRef(token: string): boolean {
  return repoRefSchema.safeParse(token).success
}

// The connector chips the wizard offers live in lib/connectors.ts (the
// directory catalog, ADR-0046) and are unioned with the pool's in-use names
// via `existingConnectors` — see ConnectorField.

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
  existingCategories = [],
  existingConnectors = [],
  onAdd,
  editRoutine,
  onEdit,
  runner,
  account,
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
  /** Bands already in use across this repo's pool (ADR-0044) — offered on the
      category field so a repo converges on its own vocabulary instead of
      sprouting "Eng" beside "Engineering". */
  existingCategories?: string[]
  /** Connector names already in use across this repo's pool — how a team's
      custom connector (never in the shipped catalog, ADR-0046) is offered
      on the next routine. */
  existingConnectors?: string[]
  onAdd: (routine: Routine, size: WidgetSize) => void
  /** When set, the form edits this routine in place instead of adding one. */
  editRoutine?: Routine | null
  /** Called on submit in edit mode with the updated routine (slug unchanged). */
  onEdit?: (routine: Routine) => void
  /** Set on team boards: the login whose Claude account owns the routine's
      cloud resource (ADR-0010/0016). Stamped on the routine and gates the
      sync hint. */
  runner?: string
  /** Edit mode: the Claude account the routine is currently enacted under,
      read from its trigger receipt (ADR-0029). The login can't carry this —
      one runner, several accounts — so it's surfaced verbatim, not inferred
      from `runner`. Null until the routine has been enacted. */
  account?: string | null
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
  // Narrows the template list (ADR-0015 discovery can surface dozens across
  // source repos). Not part of the draft — a filter is a view, not an answer.
  const [query, setQuery] = useState("")
  const [name, setName] = useState("")
  const [nameEdited, setNameEdited] = useState(false)
  // The widget's band (ADR-0044). Seeded from the picked template and
  // materialized on submit, so the board can band from routines.yaml alone
  // (which its loader awaits) rather than the streamed template read.
  // Blank is the deliberate "no band" — the tri-state's explicit null.
  const [category, setCategory] = useState("")
  const [categoryEdited, setCategoryEdited] = useState(false)
  // The slug is derived (see `derivedSlug`), not stored — `slugOverride` holds
  // the value only once the user takes it over (Customize) or in edit mode.
  const [slugEdited, setSlugEdited] = useState(false)
  const [slugOverride, setSlugOverride] = useState("")
  // The derived slug shows as a read-only caption; this reveals the editable
  // field for the rare deliberate override (ADR-0040).
  const [customizingSlug, setCustomizingSlug] = useState(false)
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

  // The filter matches the three strings a picker row shows or implies: the
  // id you'd type from memory, the human name, and the artifact line.
  const matched = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length === 0) return templates
    return templates.filter(
      (entry) =>
        entry.id.toLowerCase().includes(q) ||
        entry.name.toLowerCase().includes(q) ||
        entry.widget.artifact.toLowerCase().includes(q),
    )
  }, [templates, query])

  // The *selected* template stays on screen whether or not it matches — a
  // pick must never vanish behind a query typed after it, leaving Next
  // enabled with nothing visibly chosen. It rides along as the pick, though,
  // not as a hit: the no-match line and the one-hit Enter shortcut both read
  // `matched`, so neither is fooled by a query that found nothing.
  const visibleTemplates = useMemo(() => {
    const picked = templates.find(
      (entry) => entry.id === templateId && !matched.includes(entry),
    )
    return picked ? [...matched, picked] : matched
  }, [templates, matched, templateId])

  // Grouped by source instead of badged per row: with a dozen templates the
  // repeated "This repo"/"Built-in" pills were louder than the ids they sat
  // beside. The repo's own templates lead — the board's local vocabulary
  // before the shipped one (ADR-0021 shadowing has the same precedence).
  const groups = useMemo(
    () =>
      (
        [
          { key: "repo", label: t("dialog.sourceRepo") },
          { key: "builtin", label: t("dialog.sourceBuiltin") },
        ] as const
      )
        .map((group) => ({
          ...group,
          entries: visibleTemplates.filter(
            (entry) => entry.source === group.key,
          ),
        }))
        .filter((group) => group.entries.length > 0),
    [visibleTemplates, t],
  )

  const showFilter = templates.length > FILTER_THRESHOLD
  const noMatch = query.trim().length > 0 && matched.length === 0
  /** The picked template's declared inputs (ADR-0020); [] when prompt-only or
      the template isn't currently discoverable. */
  const declaredParams = template?.widget.params ?? []

  // The subject a subject-param template slugs its instance after (ADR-0040)
  // — corza, not repo-pulse. "" until the subject param is answered (or the
  // template names none), which routes seeding back to the template name.
  const subject = useMemo(
    () => subjectToken(template, params),
    [template, params],
  )
  // The wizard derives the slug, it never solicits it (ADR-0040): a subject
  // template slugs <subject>-<kind> (corza-pulse, acme-pulse — distinct by
  // construction, not counter-suffixed); every other template kebab-cases the
  // name, itself seeded from the template. Computed, not stored, so it's always
  // current with the name/subject and never a stale-or-empty field.
  const derivedSlug = useMemo(() => {
    if (template?.widget.subjectParam != null) {
      // Subject template: pending (blank) until the subject is answered.
      if (subject.length === 0) return ""
      return uniqueSlug(
        `${kebab(subject)}-${templateKind(template)}`,
        existingSlugs,
      )
    }
    const source = name.trim()
    return source ? uniqueSlug(kebab(source), existingSlugs) : ""
  }, [template, subject, name, existingSlugs])
  // The effective slug: the user's own once taken over (Customize / edit mode),
  // otherwise the live derivation.
  const slug = isEdit || slugEdited ? slugOverride : derivedSlug

  // A subject template also names its instance after the subject (Corza),
  // title-cased and still user-overridable — a display concern, unlike the slug
  // which is permanent, so it stays a real (settable) field.
  useEffect(() => {
    if (isEdit || nameEdited) return
    if (template?.widget.subjectParam != null && subject.length > 0) {
      setName(titleCase(subject))
    }
  }, [isEdit, nameEdited, template, subject])

  // The band follows the picked template until the user takes it over — the
  // same derive-don't-solicit shape as the slug and the name (ADR-0040). In
  // edit mode the seeding effect below has already resolved it, so a template
  // swap must not silently refile an existing widget.
  useEffect(() => {
    if (isEdit || categoryEdited) return
    setCategory(template?.widget.category ?? "")
  }, [isEdit, categoryEdited, template])

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
      seededConnectors.current = [...suggested]
      setAdvancedOpen(true)
    }
    // A subject template names its instance after the entered subject; seed
    // the name from the template only otherwise. The slug follows the name via
    // the derivation effect (ADR-0040).
    if (entry.widget.subjectParam == null) setName(templateDisplayName(entry))
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
    setSlugOverride(editRoutine.slug)
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
    const editTemplate = templatesRef.current.find(
      (entry) => entry.id === editRoutine.template,
    )
    // Resolve the band the way the board does (ADR-0044): the routine's own
    // value wins, an explicit null shows as blank, and only silence falls
    // through to the template. Marked as taken over so the template effect
    // can't overwrite what's already been decided for this routine.
    setCategory(
      resolveCategory(editRoutine, editTemplate?.widget.category) ?? "",
    )
    setCategoryEdited(true)
    const declared = editTemplate?.widget.params ?? []
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
    // Stored connectors are the user's own — never retracted by re-picks.
    seededConnectors.current = []
    setAdvancedOpen(
      extras.length > 0 || (editRoutine.connectors ?? []).length > 0,
    )
  }, [open, editRoutine])

  function reset() {
    setStep("intent")
    setInstructions("")
    setTemplateId(null)
    setQuery("")
    setName("")
    setNameEdited(false)
    setCategory("")
    setCategoryEdited(false)
    setSlugEdited(false)
    setSlugOverride("")
    setSchedule(DEFAULT_SCHEDULE)
    setScheduleEdited(false)
    setCustomCron("")
    setHost("cloud")
    setParams({})
    setTouched({})
    setExtraRepos([])
    setConnectors([])
    seededConnectors.current = []
    setAdvancedOpen(false)
    setCustomizingSlug(false)
  }

  // Connectors the current template pick auto-seeded (as opposed to
  // hand-toggled): they belong to the pick, so switching or deselecting the
  // template retracts them instead of silently widening the allowlist a
  // user never saw (it hides under collapsed Advanced). A manual toggle
  // claims the whole set — after that, template switches stop retracting.
  const seededConnectors = useRef<string[]>([])

  function pickTemplate(next: DiscoveredTemplate) {
    // The picker is an accelerator, not a gate — a second click deselects
    // back to a prompt-only routine, keeping whatever the user typed but
    // dropping any name and connectors this template auto-filled (the slug
    // follows via the derivation effect).
    if (next.id === templateId) {
      setTemplateId(null)
      if (!nameEdited) setName("")
      // Snapshot before clearing the ref: the updater runs on the next
      // render, after the ref has already been reassigned.
      const seeded = seededConnectors.current
      seededConnectors.current = []
      setConnectors((current) =>
        current.filter((name) => !seeded.includes(name)),
      )
      return
    }
    setTemplateId(next.id)
    // Suggested cron seeds the schedule only until the user picks their
    // own — same guard as name/slug below.
    if (!scheduleEdited && next.widget.schedule) {
      setSchedule(next.widget.schedule)
    }
    // The template's suggested connectors join the allowlist (ADR-0020) —
    // union over the hand-added set, minus the previous pick's auto-seeds.
    // Seeding also opens Advanced: an allowlist grant (ADR-0018) must be
    // visible on the configure step, never a collapsed surprise.
    const suggested = next.widget.connectors ?? []
    // Snapshot before reassigning the ref — the updater executes later.
    const seeded = seededConnectors.current
    seededConnectors.current = [...suggested]
    setConnectors((current) => [
      ...new Set([
        ...current.filter((name) => !seeded.includes(name)),
        ...suggested,
      ]),
    ])
    if (suggested.length > 0) setAdvancedOpen(true)
    // Re-seed the name from the newly picked template unless the user typed
    // their own — otherwise switching templates strands the first template's
    // name. A subject template names its instance after the subject the user
    // is about to enter (the derivation effect), not the template, so clear it
    // there. The slug follows the name/subject via that effect (ADR-0040).
    if (!nameEdited) {
      setName(next.widget.subjectParam != null ? "" : templateDisplayName(next))
    }
  }

  function setParam(key: string, value: ParamValue) {
    setParams((current) => ({ ...current, [key]: value }))
  }

  // Terminal manners: the picker is a list you drive from the keyboard, not a
  // tab-stop-per-item stack. Focus *is* the active row (no parallel "active"
  // state to drift out of sync with it), so Enter/Space pick natively and
  // screen readers announce the row they land on.
  const listRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef<HTMLInputElement>(null)

  const rowsIn = (selector: string): HTMLButtonElement[] => [
    ...(listRef.current?.querySelectorAll<HTMLButtonElement>(selector) ?? []),
  ]

  function onListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const target = event.target
    // The custom row nests a textarea: arrows there move the caret through
    // the brief, they don't leave the field.
    if (!(target instanceof HTMLElement)) return
    if (target instanceof HTMLTextAreaElement) return
    const keys = ["ArrowDown", "ArrowUp", "Home", "End"]
    if (!keys.includes(event.key)) return
    const rows = rowsIn(ROW_SELECTOR)
    if (rows.length === 0) return
    event.preventDefault()
    if (event.key === "Home") return rows[0]?.focus()
    if (event.key === "End") return rows.at(-1)?.focus()
    // -1 (focus was on the list box itself, not a row) lands on the first row
    // for ArrowDown and walks back out to the filter for ArrowUp.
    const current = target.closest(ROW_SELECTOR)
    const index = rows.findIndex((row) => row === current)
    const next = index + (event.key === "ArrowDown" ? 1 : -1)
    // Above the first row is the filter, not a wrap to the bottom — the list
    // reads top-to-bottom, so ArrowUp walks out of it the way it came in.
    if (next < 0) return filterRef.current?.focus()
    rows[Math.min(next, rows.length - 1)]?.focus()
  }

  function onFilterKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      // Into the templates, skipping the custom row: you're in the filter
      // because you're browsing, and the brief has its own field below.
      rowsIn(TEMPLATE_ROW_SELECTOR)[0]?.focus()
      return
    }
    if (event.key === "Enter" && matched.length === 1) {
      // Narrowed to one — take it. The fzf move: type enough, press Enter.
      event.preventDefault()
      const only = matched[0]
      if (only && only.id !== templateId) pickTemplate(only)
      setStep("config")
      return
    }
    if (event.key === "Escape" && query.length > 0) {
      // Clear the filter; the dialog's own Escape only applies once the
      // field is empty, so one key never does two things at once.
      event.preventDefault()
      event.stopPropagation()
      setQuery("")
    }
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
    // Materialize the band (ADR-0044) so the board never waits on the streamed
    // template read to know its bands. A chosen name is written outright; a
    // cleared field writes an explicit null *only* when the template would
    // otherwise supply one, since with nothing to inherit, absence already
    // says "no band" and a `category: null` line would be noise.
    const chosenCategory = category.trim() || null
    const inheritedCategory = template?.widget.category ?? null
    const categoryField = chosenCategory
      ? { category: chosenCategory }
      : inheritedCategory
        ? { category: null }
        : {}

    const routine: Routine = {
      slug: isEdit ? editRoutine.slug : slug,
      name: name.trim(),
      // Freeform routines name the custom built-in — every routine has a
      // template (ADR-0022).
      template: templateId ?? CUSTOM_TEMPLATE,
      ...categoryField,
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
      onOpenChange={(next, eventDetails) => {
        // Escape or a stray backdrop tap must not destroy a typed draft:
        // the brief is the product's core artifact. An accidental dismiss
        // keeps the state for the next open; Cancel, ✕, and submit reset
        // explicitly. Edit mode always resets — it re-seeds from the
        // routine on open.
        if (!next) {
          const accidental =
            eventDetails.reason === "escape-key" ||
            eventDetails.reason === "outside-press"
          const dirty =
            instructions.trim().length > 0 ||
            (nameEdited && name.trim().length > 0) ||
            slugEdited ||
            Object.keys(params).length > 0 ||
            extraRepos.length > 0 ||
            customCron.trim().length > 0
          if (!(accidental && !isEdit && dirty)) reset()
        }
        onOpenChange(next)
      }}
    >
      {/* Content tier (DESIGN.md): the picker is a list you scan, so width
          buys information. Measured across the built-in descriptions, `lg`
          gave 2/2/1/1 lines and 720px gives 1/1/1/1 — the two longest drop a
          line each, so more templates fit a screen. `line-clamp-2` below stays
          the safety net for longer strings (pt-BR), not the target.
          `sm:` (not bare `max-w-`) keeps the base mobile width cap; the height
          cap + scrollable middle keep the wizard usable on small phones with
          the keyboard open. */}
      <DialogContent className="flex max-h-[85svh] flex-col sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>
            {t(isEdit ? "dialog.editTitle" : "dialog.title")}
          </DialogTitle>
          <DialogDescription>
            {step === "intent" ? (
              t("dialog.description")
            ) : isEdit ? (
              // The template id is the one identifier that explains the
              // whole form — edit mode names it like add mode does.
              <>
                <span className="font-mono text-primary">
                  {templateId ?? CUSTOM_TEMPLATE}
                </span>
                {" — "}
                {t("dialog.editDescription")}
              </>
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
              // row leads, selected by default with the prompt nested inside
              // it, so opening the dialog and typing stays the on-ramp.
              <div className="grid gap-2">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <Label id="routine-template-label">
                    {t("dialog.template")}
                  </Label>
                  {showFilter && (
                    <div className="relative w-full sm:w-56">
                      <SearchIcon
                        aria-hidden
                        className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
                      />
                      <Input
                        ref={filterRef}
                        id="routine-template-filter"
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        onKeyDown={onFilterKeyDown}
                        placeholder={t("dialog.filterTemplates")}
                        aria-label={t("dialog.filterTemplates")}
                        aria-controls="routine-template-list"
                        // pl-8 clears the glyph; the native search decorations
                        // are suppressed in app.css — the field is ours.
                        className="pl-8"
                      />
                    </div>
                  )}
                </div>
                {/* A list, not a stack of cards: rows sit flush and only the
                    picked one draws a border, so a dozen templates read as one
                    column of ids rather than a dozen boxes. */}
                <div
                  ref={listRef}
                  id="routine-template-list"
                  role="group"
                  aria-labelledby="routine-template-label"
                  onKeyDown={onListKeyDown}
                  className="grid"
                >
                  <TemplateRow
                    kind="custom"
                    id={CUSTOM_TEMPLATE}
                    description={t("dialog.customCard")}
                    selected={isCustom}
                    onPick={() => setTemplateId(null)}
                  >
                    {isCustom && (
                      // Seamless writing area, not a boxed input: the row's
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
                        // Two rows, grown by `field-sizing-content` as the
                        // brief gets longer. A fixed three-row box pushed the
                        // first template below the fold on open — the list has
                        // to be visible for the picker to read as a picker.
                        rows={2}
                        // text-base below md, like the input/textarea
                        // primitives: iOS Safari auto-zooms any focused field
                        // under 16px, and the zoom wrecks the dialog.
                        className="field-sizing-content min-h-[2.5rem] w-full resize-none bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground md:text-sm"
                      />
                    )}
                  </TemplateRow>
                  {groups.map((group) => (
                    // A real labelled group, not a caption floating above
                    // rows: the source is what the badge used to say per row,
                    // so AT has to hear it on the way in or it's simply gone.
                    <div
                      key={group.key}
                      role="group"
                      aria-labelledby={`routine-template-group-${group.key}`}
                    >
                      {/* The rail's landmark caption tier (11px tracked caps):
                          says the source once per group instead of pinning a
                          badge to every row. */}
                      <div
                        id={`routine-template-group-${group.key}`}
                        className="mt-3 mb-1 px-2.5 text-[11px] font-semibold tracking-wider text-ink-dim uppercase"
                      >
                        {group.label}
                      </div>
                      {group.entries.map((entry) => (
                        <TemplateRow
                          key={entry.id}
                          kind="template"
                          id={entry.id}
                          description={entry.widget.artifact}
                          selected={entry.id === templateId}
                          onPick={() => pickTemplate(entry)}
                        >
                          {/* Selecting a row reveals its sample render — see
                              what the template makes before committing a
                              routine to it (ADR-0037). Nested like the custom
                              row's prompt, so only the picked one renders (one
                              iframe at a time) and a template with no sample
                              just has no panel. */}
                          {entry.id === templateId && entry.sample != null && (
                            <TemplatePreview
                              html={entry.sample}
                              name={entry.name}
                            />
                          )}
                        </TemplateRow>
                      ))}
                    </div>
                  ))}
                  {noMatch && (
                    // States the fact and the next action in one line — and
                    // the next action is the row still sitting right above it.
                    <p
                      role="status"
                      className="mt-3 px-2.5 text-xs text-muted-foreground"
                    >
                      {t("dialog.templateNoMatch", { query: query.trim() })}
                    </p>
                  )}
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

                <div className="grid gap-2">
                  <Label htmlFor="routine-name">{t("dialog.name")}</Label>
                  <Input
                    id="routine-name"
                    value={name}
                    onChange={(event) => {
                      setNameEdited(true)
                      setName(event.target.value)
                    }}
                    placeholder={t("dialog.namePlaceholder")}
                  />
                  {isEdit || customizingSlug ? (
                    // Edit mode: the slug is fixed (delete + re-add to rename).
                    // Customize: the rare deliberate override of the derived
                    // slug (ADR-0040). Either way it's a labelled field.
                    <div className="grid gap-1 pt-1">
                      <Label
                        htmlFor="routine-slug"
                        className="font-normal text-muted-foreground"
                      >
                        {t("dialog.slug")}
                      </Label>
                      <Input
                        id="routine-slug"
                        value={slug}
                        onChange={(event) => {
                          setSlugEdited(true)
                          setSlugOverride(event.target.value)
                        }}
                        // The slug keys widgets and the artifact path — fixed
                        // once the routine exists (delete + re-add to rename).
                        disabled={isEdit}
                        aria-invalid={
                          slug.length > 0 && (!slugValid || slugTaken)
                        }
                        className="font-mono disabled:opacity-70"
                      />
                      {slugTaken ? (
                        <p className="text-xs text-destructive">
                          {t("dialog.slugTaken")}
                        </p>
                      ) : slug.length > 0 && !slugValid ? (
                        // The taken case had a message; the invalid case
                        // showed only a red ring — name the rule.
                        <p className="text-xs text-destructive">
                          {t("dialog.slugInvalid")}
                        </p>
                      ) : (
                        isEdit && (
                          // The rename warning lives where it acts — on the
                          // disabled field — not in the dialog header.
                          <p className="text-xs text-muted-foreground">
                            {t("dialog.slugFixed")}
                          </p>
                        )
                      )}
                    </div>
                  ) : (
                    // The slug is derived, not solicited (ADR-0040): a caption
                    // under the name, overridable via Customize — never an
                    // empty required field.
                    <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      <span>{t("dialog.slug")}</span>
                      <code
                        id="routine-slug-display"
                        className="font-mono text-foreground"
                      >
                        {slug || t("dialog.slugPending")}
                      </code>
                      {slug.length > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <button
                            type="button"
                            // "Customize" alone is ambiguous to AT — name
                            // what it customizes.
                            aria-label={t("dialog.customizeSlugLabel")}
                            // after-inset hit extension (the widget-bar ⋯
                            // idiom): a 13px inline link is far under the
                            // touch floor, and growing its visible box would
                            // break the caption line.
                            className="relative underline underline-offset-2 hover:text-foreground pointer-coarse:after:absolute pointer-coarse:after:-inset-y-3 pointer-coarse:after:-inset-x-2"
                            onClick={() => {
                              // Carry the derived slug into the field to tweak.
                              setSlugOverride(slug)
                              setCustomizingSlug(true)
                              setSlugEdited(true)
                            }}
                          >
                            {t("dialog.customize")}
                          </button>
                        </>
                      )}
                    </p>
                  )}
                </div>

                {/* The widget's band (ADR-0044). Free text with the repo's
                    existing bands offered via a native datalist — the same
                    shape the board's section field uses, so a repo converges
                    on one vocabulary. Clearing it is the deliberate "no
                    band"; the caption says so, and says that the choice
                    follows the routine onto every board it sits on. */}
                <div className="grid gap-2">
                  <Label htmlFor="routine-category">
                    {t("dialog.category")}
                  </Label>
                  <Input
                    id="routine-category"
                    list="routine-category-options"
                    value={category}
                    maxLength={CATEGORY_NAME_MAX}
                    onChange={(event) => {
                      setCategoryEdited(true)
                      setCategory(event.target.value)
                    }}
                    placeholder={t("dialog.categoryPlaceholder")}
                    aria-describedby="routine-category-hint"
                  />
                  <datalist id="routine-category-options">
                    {existingCategories.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                  <p
                    id="routine-category-hint"
                    className="text-xs text-muted-foreground"
                  >
                    {t("dialog.categoryHint")}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 sm:items-start">
                  <div className="grid gap-2">
                    {/* htmlFor → trigger id: without it the trigger has no
                        accessible name — a screen reader hears the bare
                        value ("Daily at 8:00, button") with no field name. */}
                    <Label htmlFor="routine-schedule">
                      {t("dialog.schedule")}
                    </Label>
                    <Select
                      value={schedule}
                      onValueChange={(next) => {
                        if (typeof next === "string") {
                          setScheduleEdited(true)
                          setSchedule(next)
                        }
                      }}
                    >
                      <SelectTrigger id="routine-schedule" className="w-full">
                        {/* Base UI renders the raw value in the trigger —
                            that's `0 8 * * *` for a preset and the bare
                            `manual`/`custom` sentinels. Map presets to their
                            phrase (the shared cron vocabulary, ADR-0025);
                            an off-list cron renders verbatim in mono
                            (terminal manners: machine strings stay honest). */}
                        <SelectValue>
                          {(value) => {
                            if (typeof value !== "string") return null
                            if (value === MANUAL) {
                              return t("dialog.manualShort")
                            }
                            if (value === CUSTOM) return t("dialog.customCron")
                            const phrase = schedulePhraseKey(value)
                            return phrase ? (
                              t(phrase)
                            ) : (
                              <span className="font-mono">{value}</span>
                            )
                          }}
                        </SelectValue>
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
                    <Label htmlFor="routine-host">{t("dialog.host")}</Label>
                    <Select
                      value={host}
                      onValueChange={(next) => {
                        if (next === "cloud" || next === "local") setHost(next)
                      }}
                    >
                      <SelectTrigger id="routine-host" className="w-full">
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

                {/* The account the receipt actually names (ADR-0029) — not
                    the runner login, which can't tell one person's Claude
                    accounts apart. Shown only once a routine is enacted. */}
                {host === "cloud" && account && (
                  <p className="text-xs text-muted-foreground">
                    {t("dialog.accountHint", { account })}
                  </p>
                )}

                {host === "cloud" && runner && (
                  <p className="text-xs text-muted-foreground">
                    {t("dialog.runnerHint")}
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
                      className="relative flex cursor-pointer items-center gap-1 rounded-sm text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:after:absolute pointer-coarse:after:-inset-y-2 pointer-coarse:after:inset-x-0"
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
                          <Label id="routine-connectors-label">
                            {t("dialog.connectors")}
                          </Label>
                          <ConnectorField
                            labelledBy="routine-connectors-label"
                            value={connectors}
                            inUse={existingConnectors}
                            onChange={(next) => {
                              // A manual toggle claims the set — template
                              // switches stop retracting auto-seeds.
                              seededConnectors.current = []
                              setConnectors(next)
                            }}
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
          {/* Edit mode hides the dots — a prefilled form isn't step 2 of a
              journey the editor never took. */}
          {!isEdit && (
            // mr-auto at every width now that the footer is one wrapping row:
            // progress on the left, actions on the right, phone and desktop
            // alike. The old stacked layout had to hoist the dots above the
            // buttons or they were orphaned against the sheet's bottom edge.
            <div
              className="mr-auto flex items-center gap-1"
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
          )}
          {/* Wraps too, so the pair drops to its own line together instead of
              the second button overflowing the footer's left edge. */}
          <div className="flex flex-wrap justify-end gap-2">
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
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * One pick row in the intent step: mono id over the artifact line — the pick
 * is about what the widget shows. Size, schedule, and params surface where
 * they act (the grid and the configure step), never as pre-pick metadata.
 *
 * A row, not a card. A dozen bordered boxes read as a wall and cost a border
 * plus padding each; here rows sit flush in one column and **only the picked
 * one draws a border**, so the mono ids share a left edge you can scan like a
 * file list. The source badge moved to the group caption above (it repeated
 * verbatim on every row), and the per-template glyph went with it — the
 * discovered majority all fell back to the same generic mark, so the column of
 * identical icons was noise standing between the eye and the id.
 *
 * The `custom` built-in renders through this same row, synthesized by the
 * wizard (it has no `widget:` block to discover) — its prompt nests as
 * `children`, under a hairline, so the row's one border owns both and the
 * field never reads as a sibling list item.
 */
function TemplateRow({
  kind,
  id,
  description,
  selected,
  onPick,
  children,
}: {
  /** `custom` is the escape hatch, not a discovered template: it leads the
      list ungrouped, and the filter's ArrowDown skips past it. */
  kind: "custom" | "template"
  id: string
  description: string
  selected: boolean
  onPick: () => void
  /** Rendered inside the row below a hairline — the prompt, or the sample. */
  children?: ReactNode
}) {
  return (
    <div
      className={cn(
        // border-transparent, not border-0: the picked row's border must not
        // shift its neighbours by a pixel when it appears.
        "rounded-lg border border-transparent text-sm transition-colors",
        // Selection is a translucent accent wash under unchanged ink (the
        // DESIGN.md idiom, same family as the app's menu/nav highlights) —
        // theme-symmetric where a solid bg-muted fill wasn't: on the light
        // ramp bg2 sits two steps below the dialog surface and read as a
        // heavy dark block, while on dark it was a whisper. Hover lives on
        // the container: with nothing nested the header button fills it.
        selected ? "border-primary bg-primary/10" : "hover:bg-primary/5",
      )}
    >
      <button
        type="button"
        data-row={kind}
        aria-pressed={selected}
        onClick={onPick}
        className="flex w-full cursor-pointer items-start gap-3 rounded-lg px-2.5 py-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {/* min-w-0 keeps a long id truncating instead of pushing the check
            off the row. */}
        <span className="min-w-0 flex-1">
          {/* Body size (15px), not the 13px metadata floor: in a list you
              scan, the id is the row's label, and the size step is what
              separates it from the description under it.

              Ink, not accent, until picked. Every id was accent when this was
              a stack of three cards; at a dozen rows that made the accent the
              list's background colour and left selection with nothing of its
              own to say. Restrained means the accent marks the pick. */}
          <span
            className={cn(
              "block truncate font-mono text-sm transition-colors",
              selected ? "text-primary" : "text-foreground",
            )}
          >
            {id}
          </span>
          {/* Two lines, not one truncated: the artifact line is the whole
              basis for the pick, and "…readiness, stage, and per…" withheld
              exactly the part being decided on. */}
          <span className="mt-0.5 block text-xs text-muted-foreground">
            <span className="line-clamp-2">{description}</span>
          </span>
        </span>
        <CheckIcon
          aria-hidden
          className={cn(
            // mt-1 optically centres the check on the id line, not on the
            // two-line block — it belongs to the name it confirms.
            "mt-1 size-4 shrink-0 text-primary transition-opacity duration-100",
            selected ? "opacity-100" : "opacity-0",
          )}
        />
      </button>
      {children && (
        <div className="border-t border-border-dim px-2.5 pt-2.5 pb-2.5">
          {children}
        </div>
      )}
    </div>
  )
}

/**
 * A template's sample render in the picker (ADR-0037): the canned artifact
 * framed exactly as the board frames a live widget — same `frameArtifactHtml`
 * tile view, same sandboxed srcdoc iframe, same inlined mono — so the preview
 * is faithful to what the widget will look like, only the data is an example.
 * Nested in the selected card, so at most one iframe mounts at a time.
 */
function TemplatePreview({ html, name }: { html: string; name: string }) {
  const t = useT()
  const theme = useResolvedTheme()
  const framed = useMemo(
    () => frameArtifactHtml(html, theme, "tile", ARTIFACT_FONT_STYLE),
    [html, theme],
  )
  // Picking a row near the bottom of a long list opens the preview below the
  // fold — the reveal would be invisible, which is the whole point of it.
  // `nearest` only scrolls when it has to, and instantly: this is the list
  // catching up with the pick, not an animation the user waits through.
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest" })
  }, [])
  return (
    <figure ref={ref} className="grid gap-1.5">
      <div className="overflow-hidden rounded-md border border-border-dim">
        {/* Never `loading="lazy"` on a srcdoc iframe: Chromium defers it even
            in-viewport, leaving the preview blank until a scroll. */}
        <iframe
          srcDoc={framed}
          sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
          title={t("dialog.samplePreviewTitle", { name })}
          className="h-44 w-full border-0"
        />
      </div>
      <figcaption className="font-mono text-xs text-ink-faint">
        {t("dialog.samplePreview")}
      </figcaption>
    </figure>
  )
}

/**
 * The connector allowlist (ADR-0018) as a set of toggles: the directory
 * catalog (lib/connectors.ts, ADR-0046), then the pool's in-use names —
 * how an account-specific custom (a team's own MCP server) gets offered
 * without ever shipping in the product — then any stored name outside both
 * (hand-authored YAML, a template's suggestion), so an edit round-trips it
 * instead of dropping it. Selection follows the app's idiom: a translucent
 * accent wash and accent border under unchanged mono ink — no per-chip
 * check (a reserved leading icon left every unchecked chip with a hollow
 * gap, off-center text, and ragged left edges; the wash + border carry the
 * state, `aria-pressed` carries it for AT).
 */
function ConnectorField({
  labelledBy,
  value,
  inUse,
  onChange,
}: {
  labelledBy: string
  value: string[]
  /** Connector names already used across this repo's pool (ADR-0046). */
  inUse: string[]
  onChange: (next: string[]) => void
}) {
  const known = new Set([...CONNECTOR_CATALOG, ...inUse])
  const options = [
    ...CONNECTOR_CATALOG,
    ...inUse.filter((name) => !CONNECTOR_CATALOG.includes(name)),
    ...value.filter((name) => !known.has(name)),
  ]
  function toggle(name: string) {
    onChange(
      value.includes(name)
        ? value.filter((entry) => entry !== name)
        : [...value, name],
    )
  }
  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      className="flex flex-wrap gap-1.5"
    >
      {options.map((name) => {
        const on = value.includes(name)
        return (
          <button
            key={name}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(name)}
            className={cn(
              // pointer-coarse:h-9 — the small-control touch floor (the
              // Button sm floor): 27px chips beside 40px fields read as
              // clutter and miss the touch target on phones.
              "inline-flex cursor-pointer items-center rounded-md border px-2.5 py-1 text-xs transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:h-9 pointer-coarse:px-3",
              on
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:bg-primary/5 hover:text-foreground",
            )}
          >
            {/* Friendly display of the stored machine string: sans with
                spaces ("Google Calendar"), per the per-string mono rule —
                the label is prose; the YAML keeps `Google-Calendar`. */}
            {connectorLabel(name)}
          </button>
        )
      })}
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
