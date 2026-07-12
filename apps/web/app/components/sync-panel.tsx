import { useEffect, useMemo, useState } from "react"
import { useFetcher } from "react-router"

import {
  dashboardPath,
  parseDashboardFile,
  parseRoutinesFile,
  serializeDashboardFile,
  serializeRoutinesFile,
} from "@bulletin/schema"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import type { Routine } from "@bulletin/schema"

import { Label } from "~/components/ui/label"
import { type DiffLine, diffLines } from "../lib/diff.ts"
import { useT } from "../lib/i18n.tsx"
import {
  type BaseShas,
  type Draft,
  type SyncKind,
  staleKinds,
} from "../lib/draft.ts"
import { setupCommands } from "../lib/routine-status.ts"
import { CopyableCommand } from "./widget-card.tsx"

interface FileChange {
  kind: SyncKind
  path: string
  yaml: string
  baseSha: string | null
  diff: DiffLine[]
}

interface SyncResult {
  ok: boolean
  prUrl?: string
  conflicts?: SyncKind[]
  /** New base SHAs a successful commit produced (ADR-0003). */
  newShas?: Partial<Record<SyncKind, string>>
  /** SHAs a partial (raced) commit did land, so a retry doesn't re-conflict. */
  committed?: Partial<Record<SyncKind, string>>
}

/**
 * The Sync panel (ADR-0003): rendered YAML diff of the draft against the
 * base it was loaded from, plus the persist actions — direct commit to main
 * (default) or a branch + PR. A base SHA that moved server-side surfaces as
 * a conflict with a re-apply option, never a silent overwrite.
 */
export function SyncPanel({
  open,
  onOpenChange,
  scope,
  dashboardSlug,
  dataRepo,
  draft,
  baseFiles,
  serverShas,
  rebasing = false,
  addedRoutines,
  onSynced,
  onDiscard,
  onRebase,
  onConflictCommitted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Which repo and layout file the sync targets (ADR-0010). */
  scope: "personal" | "team"
  dashboardSlug: string
  /** Repo slug of the data repo — makes the next-steps commands
      copy-pasteable (`--repo` instead of a --file placeholder). */
  dataRepo?: string
  draft: Draft
  baseFiles: { routines: string | null; dashboard: string | null }
  /** SHAs the server currently sees — differs from draft.baseShas when the
      repo moved under the draft. */
  serverShas: BaseShas
  /** True while a "keep my version" rebase revalidates the base. */
  rebasing?: boolean
  /** Routines this draft adds — committing them isn't enough to run them, so a
      successful commit shows their enactment steps (ADR-0016). */
  addedRoutines: Routine[]
  onSynced: (newShas: Partial<Record<SyncKind, string>>) => void
  onDiscard: () => void
  onRebase: () => void
  onConflictCommitted: (committed: Partial<Record<SyncKind, string>>) => void
}) {
  const t = useT()
  const fetcher = useFetcher<SyncResult>()
  const [asPr, setAsPr] = useState(false)

  const changes = useMemo<FileChange[]>(() => {
    // A file is "changed" only when its content differs from the base
    // after normalizing the base through the same parse→serialize cycle.
    // Otherwise a hand-written base (comments, quoting) shows a phantom
    // formatting-only diff for a file the draft never touched — and would
    // produce a pointless commit.
    function untouched(
      baseText: string | null,
      draftYaml: string,
      normalize: (text: string) => string,
    ): boolean {
      if (baseText == null) return false
      try {
        return normalize(baseText) === draftYaml
      } catch {
        return false // unparseable base: let the diff surface it
      }
    }

    const routinesYaml = serializeRoutinesFile(draft.routines)
    const dashboardYaml = serializeDashboardFile(draft.dashboard)
    const all: FileChange[] = []
    if (
      !untouched(baseFiles.routines, routinesYaml, (text) =>
        serializeRoutinesFile(parseRoutinesFile(text)),
      )
    ) {
      all.push({
        kind: "routines",
        path: "data/routines.yaml",
        yaml: routinesYaml,
        baseSha: draft.baseShas.routines,
        diff: diffLines(baseFiles.routines ?? "", routinesYaml),
      })
    }
    if (
      !untouched(baseFiles.dashboard, dashboardYaml, (text) =>
        serializeDashboardFile(parseDashboardFile(text)),
      )
    ) {
      all.push({
        kind: "dashboard",
        path: dashboardPath(dashboardSlug),
        yaml: dashboardYaml,
        baseSha: draft.baseShas.dashboard,
        diff: diffLines(baseFiles.dashboard ?? "", dashboardYaml),
      })
    }
    return all.filter((change) =>
      change.diff.some((line) => line.kind !== "same"),
    )
  }, [draft, baseFiles, dashboardSlug])

  const stale = useMemo(
    () => staleKinds(draft.baseShas, serverShas),
    [draft.baseShas, serverShas],
  )
  const conflicts = fetcher.data?.conflicts ?? stale

  const busy = fetcher.state !== "idle"
  const synced = fetcher.data?.ok === true
  // A direct commit lands on main, so the draft is obsolete. A PR leaves
  // main untouched — the draft stays until the PR merges and a reload picks
  // the new base up.
  const committed = synced && !fetcher.data?.prUrl

  // Committing new routines isn't enough to run them — hold the panel open on a
  // next-steps pane (ADR-0016). Otherwise the commit is done: reconcile + close.
  const showNextSteps = committed && addedRoutines.length > 0
  useEffect(() => {
    if (committed && addedRoutines.length === 0) {
      onSynced(fetcher.data?.newShas ?? {})
    }
  }, [committed, addedRoutines.length, fetcher.data?.newShas, onSynced])

  // A partial (raced) commit landed some files: fold their SHAs into the
  // draft's base so a retry doesn't false-conflict on what already committed.
  const raced = fetcher.data?.committed
  useEffect(() => {
    if (raced && Object.keys(raced).length > 0) onConflictCommitted(raced)
  }, [raced, onConflictCommitted])

  function submit() {
    const payload: Record<string, unknown> = {
      intent: asPr ? "pr" : "commit",
      scope,
      dashboardSlug,
    }
    for (const change of changes) {
      payload[change.kind] = { yaml: change.yaml, baseSha: change.baseSha }
    }
    void fetcher.submit(JSON.stringify(payload), {
      method: "post",
      action: "/sync",
      encType: "application/json",
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* `sm:max-w-2xl` (not `max-w-2xl`) keeps the base mobile width cap;
          svh so iOS browser chrome doesn't push the footer off screen. */}
      <DialogContent className="flex max-h-[85svh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("sync.title")}</DialogTitle>
          <DialogDescription>{t("sync.description")}</DialogDescription>
        </DialogHeader>

        {showNextSteps ? (
          <NextSteps
            addedRoutines={addedRoutines}
            dataRepo={dataRepo}
            onDone={() => onSynced(fetcher.data?.newShas ?? {})}
          />
        ) : synced && fetcher.data?.prUrl ? (
          <Alert>
            <AlertTitle>{t("sync.prOpened")}</AlertTitle>
            <AlertDescription>
              <a
                href={fetcher.data.prUrl}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                {fetcher.data.prUrl}
              </a>
            </AlertDescription>
          </Alert>
        ) : changes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("sync.nothing1")} <code className="font-mono">main</code>{" "}
            {t("sync.nothing2")}
          </p>
        ) : (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
            {conflicts.length > 0 && (
              <Alert variant="destructive">
                <AlertTitle>{t("sync.baseMoved")}</AlertTitle>
                <AlertDescription>
                  <p>
                    {t("sync.baseMovedBody", {
                      files: conflicts.join(t("sync.and")),
                    })}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={rebasing}
                      onClick={onRebase}
                    >
                      {rebasing ? t("sync.syncing") : t("sync.keepMine")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={rebasing}
                      onClick={onDiscard}
                    >
                      {t("sync.takeServer")}
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}
            {changes.map((change) => (
              <div key={change.kind}>
                <p className="mb-1 font-mono text-xs text-muted-foreground">
                  {change.path}
                </p>
                <pre className="overflow-x-auto rounded-lg border bg-bg p-3 font-mono text-xs leading-5">
                  {change.diff.map((line, index) => (
                    <div
                      key={index}
                      className={
                        line.kind === "add"
                          ? "bg-green/10 text-green"
                          : line.kind === "del"
                            ? "bg-red/10 text-red"
                            : "text-ink-dim"
                      }
                    >
                      {line.kind === "add"
                        ? "+ "
                        : line.kind === "del"
                          ? "- "
                          : "  "}
                      {line.text}
                    </div>
                  ))}
                </pre>
              </div>
            ))}
          </div>
        )}

        {!synced && (
          <DialogFooter className="flex-col gap-3 sm:flex-row sm:items-center">
            <Label className="flex shrink-0 items-center gap-2 text-sm font-normal whitespace-nowrap text-muted-foreground sm:mr-auto">
              <Checkbox
                checked={asPr}
                onCheckedChange={(checked) => setAsPr(checked === true)}
              />
              {t("sync.asPr")}
            </Label>
            <Button variant="ghost" onClick={onDiscard} disabled={busy}>
              {t("sync.discard")}
            </Button>
            <Button
              onClick={submit}
              disabled={busy || changes.length === 0 || conflicts.length > 0}
            >
              {busy
                ? t("sync.syncing")
                : asPr
                  ? t("sync.openPr")
                  : t("sync.commit")}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * Shown after a commit that added routines: the config is saved, but a routine
 * only runs once it's enacted (ADR-0016). Surfaces the exact terminal commands
 * — routines:sync to create the cloud routine / API trigger / launchd plist,
 * plus a per-routine run line for local ones — then hands back to the board.
 */
function NextSteps({
  addedRoutines,
  dataRepo,
  onDone,
}: {
  addedRoutines: Routine[]
  dataRepo?: string
  onDone: () => void
}) {
  const t = useT()
  const enactCommand = addedRoutines
    .map((routine) => setupCommands(routine, dataRepo).enact)
    .find((command): command is string => command != null)
  const runCommands = addedRoutines
    .map((routine) => setupCommands(routine, dataRepo).runOnce)
    .filter((command): command is string => command != null)

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
      <Alert>
        <AlertTitle>{t("sync.nextSteps")}</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>{t("sync.nextStepsBody")}</p>
          {enactCommand && <CopyableCommand command={enactCommand} />}
          {runCommands.map((command) => (
            <CopyableCommand key={command} command={command} />
          ))}
        </AlertDescription>
      </Alert>
      <DialogFooter>
        <Button onClick={onDone}>{t("sync.done")}</Button>
      </DialogFooter>
    </div>
  )
}
