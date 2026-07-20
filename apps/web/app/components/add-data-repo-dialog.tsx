import { useCallback, useEffect, useState } from "react"
import { useFetcher, useNavigate } from "react-router"

import { ArrowUpRight } from "lucide-react"

import { Button, buttonVariants } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { Input } from "~/components/ui/input"
import { RepoCombobox } from "./repo-combobox.tsx"
import { Label } from "~/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { cn } from "~/lib/utils"
import { handleRadioKeydown } from "./appearance-settings.tsx"
import { parseRepo } from "../lib/repos.ts"
import { useT } from "../lib/i18n.tsx"
import type { DataRepoOwners, DataRepoResult } from "../routes/data-repos.ts"

type Mode = "create" | "register"

/**
 * Add a data repo to the registry (ADR-0023) — the rail's second verb.
 * Two paths, one dialog: *create* generates a private repo from the
 * template (your account, or any org you can create repos in — that's how
 * a repo shared with a different circle of people starts); *register* tags
 * an existing data repo so discovery finds it. Sharing itself stays on
 * GitHub: grant people read on the repo and it appears in their rail.
 */
export function AddDataRepoDialog({
  open,
  onOpenChange,
  known,
  onNavigate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Repos already in the rail — pre-empt registering what's present. */
  known: string[]
  /** Fired alongside navigation — lets the mobile drawer close. */
  onNavigate?: () => void
}) {
  const t = useT()
  const navigate = useNavigate()
  const owners = useFetcher<DataRepoOwners>()
  const submit = useFetcher<DataRepoResult>()
  const [mode, setMode] = useState<Mode>("create")
  const [owner, setOwner] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [nameEdited, setNameEdited] = useState(false)
  const [existing, setExisting] = useState("")

  // Owner choices load when the dialog opens — login + orgs, with the
  // conventional name pre-filled per owner until the user edits it.
  useEffect(() => {
    if (open && owners.state === "idle" && owners.data == null) {
      void owners.load("/data-repos")
    }
  }, [open, owners])

  const login = owners.data?.login
  const effectiveOwner = owner ?? login ?? ""
  const prefix = owners.data?.prefix ?? ""
  const suggestedName = `${prefix}${effectiveOwner.toLowerCase()}`
  const effectiveName = nameEdited ? name : suggestedName

  const reset = useCallback(() => {
    setMode("create")
    setOwner(null)
    setName("")
    setNameEdited(false)
    setExisting("")
  }, [])

  const busy = submit.state !== "idle"
  const created = submit.data?.ok === true ? submit.data : undefined
  useEffect(() => {
    if (!created || !open) return
    reset()
    onOpenChange(false)
    onNavigate?.()
    // Land on the repo's real first board. A registered repo may have no
    // `main` (or no boards at all) — then go home, where the new group's
    // create-first row waits, rather than 404 on a guessed slug.
    void navigate(
      created.dashboard ? `/r/${created.repo}/${created.dashboard}` : "/",
    )
  }, [created, open, onOpenChange, onNavigate, navigate, reset])

  const existingRef = parseRepo(existing.trim())
  const alreadyKnown = existingRef != null && known.includes(existingRef.full)
  const canSubmit =
    !busy &&
    (mode === "create"
      ? effectiveOwner !== "" && /^[A-Za-z0-9._-]+$/.test(effectiveName)
      : existingRef != null && !alreadyKnown)

  function send() {
    if (!canSubmit) return
    const payload =
      mode === "create"
        ? { intent: "create", owner: effectiveOwner, name: effectiveName }
        : { intent: "register", repo: existingRef?.full ?? "" }
    void submit.submit(JSON.stringify(payload), {
      method: "post",
      action: "/data-repos",
      encType: "application/json",
    })
  }

  const error = submit.data?.ok === false ? submit.data.error : null

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
          <DialogTitle>{t("addRepo.title")}</DialogTitle>
          <DialogDescription>{t("addRepo.description")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {/* Two paths, one field-set each — a radio pair, not tabs: the
              choice is part of the form, and two options never earn a tab
              strip. */}
          <div
            role="radiogroup"
            aria-label={t("addRepo.mode")}
            className="grid grid-cols-2 gap-1.5"
          >
            {(
              [
                ["create", "addRepo.modeCreate", "addRepo.modeCreateHint"],
                [
                  "register",
                  "addRepo.modeRegister",
                  "addRepo.modeRegisterHint",
                ],
              ] as const
            ).map(([value, label, hint]) => {
              const active = mode === value
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  tabIndex={active ? 0 : -1}
                  onKeyDown={handleRadioKeydown}
                  onClick={() => setMode(value)}
                  className={cn(
                    "flex cursor-pointer flex-col gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                    active
                      ? "border-primary text-foreground"
                      : "border-border-dim text-ink-dim hover:border-border hover:bg-bg2 hover:text-foreground",
                  )}
                >
                  <span className="text-sm">{t(label)}</span>
                  <span className="text-xs text-ink-dim">{t(hint)}</span>
                </button>
              )
            })}
          </div>

          {mode === "create" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>{t("addRepo.owner")}</Label>
                <Select
                  value={effectiveOwner}
                  onValueChange={(next) => {
                    if (typeof next === "string") setOwner(next)
                  }}
                >
                  <SelectTrigger className="w-full font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[login, ...(owners.data?.orgs ?? [])]
                      .filter((option): option is string => option != null)
                      .map((option) => (
                        <SelectItem
                          key={option}
                          value={option}
                          className="font-mono"
                        >
                          {option}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="data-repo-name">{t("addRepo.name")}</Label>
                <Input
                  id="data-repo-name"
                  value={effectiveName}
                  onChange={(event) => {
                    setNameEdited(true)
                    setName(event.target.value)
                  }}
                  className="font-mono"
                />
              </div>
              <p className="text-xs text-ink-dim sm:col-span-2">
                {t("addRepo.createHint")}
              </p>
            </div>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="data-repo-existing">
                {t("addRepo.existing")}
              </Label>
              <RepoCombobox
                id="data-repo-existing"
                value={existing}
                onChange={setExisting}
                placeholder="owner/repo"
                invalid={alreadyKnown}
                // Picking register answers "which repo?" next — the field
                // takes focus as it mounts.
                autoFocus
              />
              {alreadyKnown ? (
                <p className="text-xs text-destructive">
                  {t("addRepo.alreadyKnown")}
                </p>
              ) : (
                <p className="text-xs text-ink-dim">
                  {t("addRepo.registerHint")}
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="flex flex-col items-start gap-2">
              <p className="text-xs text-destructive">
                {t(
                  error === "denied"
                    ? "addRepo.errDenied"
                    : error === "template"
                      ? "addRepo.errTemplate"
                      : error === "exists"
                        ? "addRepo.errExists"
                        : error === "missing"
                          ? "addRepo.errMissing"
                          : "addRepo.errNotDataRepo",
                )}
              </p>
              {/* denied/missing on a client-org repo is most often the classic
                  OAuth app not being approved for that org (ADR-0004) — nothing
                  we can grant server-side. Jump to this app's authorization
                  page, whose per-org panel carries the Grant/Request buttons. */}
              {(error === "denied" || error === "missing") &&
                owners.data?.oauthAppUrl && (
                  <a
                    href={owners.data.oauthAppUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                    )}
                  >
                    {t("addRepo.manageAccess")}
                    <ArrowUpRight aria-hidden className="size-3.5" />
                  </a>
                )}
            </div>
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
          <Button disabled={!canSubmit} onClick={send}>
            {busy
              ? t("addRepo.working")
              : mode === "create"
                ? t("addRepo.create")
                : t("addRepo.register")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
