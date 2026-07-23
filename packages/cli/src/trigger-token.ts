/**
 * Shared pieces of the API-trigger token flow (ADR-0016). The trigger is
 * research preview: it can only be created, and its token minted, in the
 * Claude web UI (shown once). These helpers take it from there — paste the
 * pair in a terminal and commit it to the data repo as
 * data/triggers/<slug>.json, where repo read access is exactly the
 * entitlement to fire. Used by routines-sync (manual cloud routines during
 * --apply) and routine-trigger (any cloud routine, on demand).
 *
 * Both prompts read the terminal directly through a short-lived `/bin/sh`
 * child rather than a Node readline interface. Mixing the two — a readline
 * question followed by a child that inherits stdin — leaves readline holding
 * the tty in flowing/raw mode, so the child's `read` never sees the pasted
 * bytes and the prompt appears frozen. Reading both via the shell keeps a
 * single consumer of stdin.
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

import {
  type TriggerFile,
  triggerFileSchema,
  triggerPath,
} from "@steward/schema"

import { CLI } from "./cli-name.ts"

/**
 * The Claude account signed into this machine (~/.claude.json), best-effort.
 * Offered as the default for the trigger's `account` field — the runner mints
 * the trigger under their own account, which on their machine is this one.
 */
export function claudeAccountEmail(): string | undefined {
  try {
    const config: { oauthAccount?: { emailAddress?: string } } = JSON.parse(
      readFileSync(path.join(homedir(), ".claude.json"), "utf8"),
    )
    const email = config.oauthAccount?.emailAddress?.trim()
    return email ? email : undefined
  } catch {
    return undefined
  }
}

/** Prompt on the cooked tty with echo on — for non-secret input. */
export function question(query: string): string {
  return execFileSync(
    "/bin/sh",
    [
      "-c",
      `printf '%s' "$1" >&2; read -r line; printf '%s' "$line"`,
      "sh",
      query,
    ],
    { stdio: ["inherit", "pipe", "inherit"], encoding: "utf8" },
  )
}

/** A prompt with the echo disabled (stty -echo) — the trigger token is a
    real secret (ADR-0016) and must not land in scrollback or recordings. */
export function questionMasked(query: string): string {
  return execFileSync(
    "/bin/sh",
    [
      "-c",
      `printf '%s' "$1" >&2; stty -echo; trap 'stty echo' EXIT; read -r line; printf '\\n' >&2; printf '%s' "$line"`,
      "sh",
      query,
    ],
    { stdio: ["inherit", "pipe", "inherit"], encoding: "utf8" },
  )
}

/**
 * Ask for one routine's cloud id + trigger token and commit the pair to the
 * data repo as data/triggers/<slug>.json (ADR-0016). Empty input skips.
 */
export function promptTriggerToken(slug: string, dataRepoDir: string): void {
  const id = question(`${slug} — cloud routine id: `).trim()
  if (!id) {
    console.log(`  skipped ${slug}`)
    return
  }
  const token = questionMasked(`${slug} — trigger token: `).trim()
  if (!token) {
    console.log(`  skipped ${slug}`)
    return
  }
  // The owning Claude account (ADR-0029) — enter to accept the machine's
  // signed-in account, type to override, empty with none detected to omit.
  const detected = claudeAccountEmail()
  const account =
    question(
      `${slug} — claude account${detected ? ` [${detected}]` : ""}: `,
    ).trim() || detected
  const relPath = triggerPath(slug)
  const absPath = path.join(dataRepoDir, relPath)
  mkdirSync(path.dirname(absPath), { recursive: true })
  writeFileSync(
    absPath,
    JSON.stringify(
      triggerFileSchema.parse({
        routine: id,
        token,
        ...(account ? { account } : {}),
      }),
      null,
      2,
    ) + "\n",
  )
  commitTrigger(dataRepoDir, relPath, `config: add API trigger for ${slug}`)
}

/**
 * Set (or replace) just the `account` on an existing trigger receipt
 * (ADR-0029), leaving its token untouched — the backfill path for triggers
 * minted before the account field, or an account correction. The token can't
 * be re-read from the web UI, so this never creates a trigger: returns false
 * (with a message) when there's none to stamp. Returns true when the file now
 * names `account` (including a no-op when it already did).
 */
export function setTriggerAccount(
  slug: string,
  dataRepoDir: string,
  account: string,
): boolean {
  const relPath = triggerPath(slug)
  const absPath = path.join(dataRepoDir, relPath)
  let existing: TriggerFile
  try {
    existing = triggerFileSchema.parse(
      JSON.parse(readFileSync(absPath, "utf8")),
    )
  } catch {
    console.error(
      `  no valid trigger at ${relPath} — mint one first with` +
        ` \`${CLI} trigger ${slug}\`.`,
    )
    return false
  }
  if (existing.account === account) {
    console.log(`  ${relPath} already names ${account}`)
    return true
  }
  writeFileSync(
    absPath,
    JSON.stringify(triggerFileSchema.parse({ ...existing, account }), null, 2) +
      "\n",
  )
  commitTrigger(
    dataRepoDir,
    relPath,
    `config: set Claude account for ${slug} trigger`,
  )
  return true
}

/** The Claude account a routine was enacted under, per its trigger receipt
    (ADR-0029), or undefined when there's no receipt, it's malformed, or it
    predates the account field. */
export function triggerAccount(
  slug: string,
  dataRepoDir: string,
): string | undefined {
  const absPath = path.join(dataRepoDir, triggerPath(slug))
  if (!existsSync(absPath)) return undefined
  try {
    return triggerFileSchema.parse(JSON.parse(readFileSync(absPath, "utf8")))
      .account
  } catch {
    return undefined
  }
}

/**
 * Whether `--apply` may drive the cloud reconcile from this machine
 * (ADR-0029). The reconcile runs through a headless `claude -p`, and
 * RemoteTrigger only ever sees the signed-in account's routines — so pointing
 * it at the wrong account doesn't fail loudly, it finds none of the expected
 * routines, decides they're all missing, and creates a duplicate set there
 * while the real ones keep drifting.
 *
 *  - `ok`       — every stamped receipt names the signed-in account (or none
 *                 is stamped yet, which the backfill step then fills in).
 *  - `unknown`  — ~/.claude.json gave no account, so nothing can be compared;
 *                 the caller warns and proceeds rather than blocking on a
 *                 best-effort read.
 *  - `mismatch` — at least one receipt names a different account. Refuse.
 */
export type AccountVerdict =
  | { kind: "ok" }
  | { kind: "unknown"; owners: string[] }
  | { kind: "mismatch"; owners: { account: string; slugs: string[] }[] }

export function checkOwningAccounts(
  signedIn: string | undefined,
  enacted: { slug: string; account: string | undefined }[],
): AccountVerdict {
  // Unstamped receipts say nothing about ownership — a routine enacted before
  // ADR-0029, or one whose trigger doesn't exist yet. Only stamped ones vote.
  const owners = new Map<string, string[]>()
  for (const { slug, account } of enacted) {
    if (account == null) continue
    owners.set(account, [...(owners.get(account) ?? []), slug])
  }
  if (owners.size === 0) return { kind: "ok" }
  if (signedIn == null) return { kind: "unknown", owners: [...owners.keys()] }
  const foreign = [...owners.entries()]
    .filter(([account]) => account !== signedIn)
    .map(([account, slugs]) => ({ account, slugs }))
  return foreign.length > 0
    ? { kind: "mismatch", owners: foreign }
    : { kind: "ok" }
}

/** True when a trigger receipt exists but carries no `account` (ADR-0029) —
    the backfill target. A missing or malformed file is not unstamped: there's
    no trigger there to stamp. */
export function triggerNeedsAccount(
  slug: string,
  dataRepoDir: string,
): boolean {
  const absPath = path.join(dataRepoDir, triggerPath(slug))
  if (!existsSync(absPath)) return false
  try {
    return (
      triggerFileSchema.parse(JSON.parse(readFileSync(absPath, "utf8")))
        .account == null
    )
  } catch {
    return false
  }
}

/** Stage, commit, and push one trigger file; a failed git step leaves the
    written file in place for a hand commit. Shared by the mint and
    account-backfill paths. */
function commitTrigger(
  dataRepoDir: string,
  relPath: string,
  message: string,
): void {
  try {
    execFileSync("git", ["-C", dataRepoDir, "add", relPath])
    execFileSync("git", ["-C", dataRepoDir, "commit", "-m", message])
    execFileSync("git", ["-C", dataRepoDir, "push"], { stdio: "pipe" })
    console.log(`  committed + pushed ${relPath}`)
  } catch {
    console.error(
      `  wrote ${relPath} but the commit/push failed — commit it by hand.`,
    )
  }
}
