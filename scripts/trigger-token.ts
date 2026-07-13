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
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

import { triggerFileSchema, triggerPath } from "@steward/schema"

/**
 * The Claude account signed into this machine (~/.claude.json), best-effort.
 * Offered as the default for the trigger's `account` field — the runner mints
 * the trigger under their own account, which on their machine is this one.
 */
function claudeAccountEmail(): string | undefined {
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
  try {
    execFileSync("git", ["-C", dataRepoDir, "add", relPath])
    execFileSync("git", [
      "-C",
      dataRepoDir,
      "commit",
      "-m",
      `config: add API trigger for ${slug}`,
    ])
    execFileSync("git", ["-C", dataRepoDir, "push"], { stdio: "pipe" })
    console.log(`  committed + pushed ${relPath}`)
  } catch {
    console.error(
      `  wrote ${relPath} but the commit/push failed — commit it by hand.`,
    )
  }
}
