import { useEffect, useState } from "react"
import { useFetcher, useNavigate } from "react-router"

import { slugSchema } from "@bulletin/schema"

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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { kebab } from "./add-routine-dialog.tsx"
import { type BoardScope, boardHref } from "../lib/board.ts"
import { useT } from "../lib/i18n.tsx"

const NEW_VALUE = "::new"

/**
 * Board navigation (ADR-0010): personal boards, team boards, and the
 * new-dashboard entry in one compact select. Values encode scope + slug;
 * picking one navigates, so the select never holds transient state.
 */
export function DashboardSwitcher({
  scope,
  dashboardSlug,
  personalDashboards,
  teamDashboards,
}: {
  scope: BoardScope
  dashboardSlug: string
  personalDashboards: string[]
  /** null → no team repo configured or no access: hide the team group. */
  teamDashboards: string[] | null
}) {
  const t = useT()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)

  return (
    <>
      <Select
        value={`${scope}:${dashboardSlug}`}
        onValueChange={(value) => {
          if (typeof value !== "string") return
          if (value === NEW_VALUE) {
            setCreating(true)
            return
          }
          const [nextScope, slug] = value.split(":")
          if (!slug) return
          void navigate(
            boardHref(nextScope === "team" ? "team" : "personal", slug),
          )
        }}
      >
        <SelectTrigger
          aria-label={t("switcher.label")}
          className="h-7 gap-1.5 border-none bg-transparent px-1.5 font-mono text-xs text-ink-dim shadow-none hover:text-foreground"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>{t("switcher.personal")}</SelectLabel>
            {personalDashboards.map((slug) => (
              <SelectItem key={`personal:${slug}`} value={`personal:${slug}`}>
                {slug}
              </SelectItem>
            ))}
          </SelectGroup>
          {teamDashboards && (
            <SelectGroup>
              <SelectLabel>{t("switcher.team")}</SelectLabel>
              {teamDashboards.map((slug) => (
                <SelectItem key={`team:${slug}`} value={`team:${slug}`}>
                  {slug}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
          <SelectSeparator />
          <SelectItem value={NEW_VALUE}>{t("switcher.new")}</SelectItem>
        </SelectContent>
      </Select>

      <NewDashboardDialog
        open={creating}
        onOpenChange={setCreating}
        defaultScope={scope}
        canTeam={teamDashboards != null}
        takenSlugs={{
          personal: personalDashboards,
          team: teamDashboards ?? [],
        }}
      />
    </>
  )
}

interface CreateResult {
  ok: boolean
  slug?: string
  error?: string
}

/**
 * Creating a dashboard commits its empty layout file directly (ADR-0010) —
 * the route must exist server-side before it can render, so there is
 * nothing to draft.
 */
export function NewDashboardDialog({
  open,
  onOpenChange,
  defaultScope,
  canTeam,
  takenSlugs,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultScope: BoardScope
  canTeam: boolean
  takenSlugs: { personal: string[]; team: string[] }
}) {
  const t = useT()
  const navigate = useNavigate()
  const fetcher = useFetcher<CreateResult>()
  const [scope, setScope] = useState<BoardScope>(defaultScope)
  const [name, setName] = useState("")
  const [slugEdited, setSlugEdited] = useState(false)
  const [slug, setSlug] = useState("")

  const effectiveScope = canTeam ? scope : "personal"
  const slugValid = slugSchema.safeParse(slug).success
  const slugTaken = takenSlugs[effectiveScope].includes(slug)
  const busy = fetcher.state !== "idle"
  const canSubmit = name.trim().length > 0 && slugValid && !slugTaken && !busy

  function reset() {
    setScope(defaultScope)
    setName("")
    setSlugEdited(false)
    setSlug("")
  }

  // A successful create closes the dialog and navigates to the new board.
  const createdSlug = fetcher.data?.ok ? fetcher.data.slug : undefined
  useEffect(() => {
    if (!createdSlug || !open) return
    onOpenChange(false)
    void navigate(boardHref(effectiveScope, createdSlug))
  }, [createdSlug, open, effectiveScope, onOpenChange, navigate])

  function submit() {
    if (!canSubmit) return
    void fetcher.submit(
      JSON.stringify({
        intent: "create",
        scope: effectiveScope,
        slug,
        name: name.trim(),
      }),
      { method: "post", action: "/dashboards", encType: "application/json" },
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("newDash.title")}</DialogTitle>
          <DialogDescription>{t("newDash.description")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {canTeam && (
            <div className="grid gap-2">
              <Label>{t("newDash.scope")}</Label>
              <Select
                value={scope}
                onValueChange={(next) => {
                  if (next === "personal" || next === "team") setScope(next)
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="personal">
                    {t("newDash.scopePersonal")}
                  </SelectItem>
                  <SelectItem value="team">{t("newDash.scopeTeam")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="dashboard-name">{t("newDash.name")}</Label>
              <Input
                id="dashboard-name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value)
                  if (!slugEdited) setSlug(kebab(event.target.value))
                }}
                placeholder={t("newDash.namePlaceholder")}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="dashboard-slug">{t("newDash.slug")}</Label>
              <Input
                id="dashboard-slug"
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
                  {t("newDash.slugTaken")}
                </p>
              )}
            </div>
          </div>
          {fetcher.data?.ok === false && (
            <p className="text-xs text-destructive">
              {fetcher.data.error === "exists"
                ? t("newDash.exists")
                : t("error.generic")}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("dialog.cancel")}
          </Button>
          <Button disabled={!canSubmit} onClick={submit}>
            {busy ? t("newDash.creating") : t("newDash.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
