import { useCallback, useEffect, useState } from "react"
import { useFetcher, useNavigate } from "react-router"

import { slugSchema } from "@bulletin/schema"

import { kebab } from "./add-routine-dialog.tsx"
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
import { type BoardScope, boardHref } from "../lib/board.ts"
import { useT } from "../lib/i18n.tsx"

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

  const reset = useCallback(() => {
    setScope(defaultScope)
    setName("")
    setSlugEdited(false)
    setSlug("")
  }, [defaultScope])

  // A successful create resets + closes the dialog and navigates to the
  // new board. Every close path must reset, or the next open shows stale
  // fields — Escape/backdrop resets via the Dialog wrapper below.
  const createdSlug = fetcher.data?.ok ? fetcher.data.slug : undefined
  useEffect(() => {
    if (!createdSlug || !open) return
    reset()
    onOpenChange(false)
    void navigate(boardHref(effectiveScope, createdSlug))
  }, [createdSlug, open, effectiveScope, onOpenChange, navigate, reset])

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
            {busy ? t("newDash.creating") : t("newDash.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
