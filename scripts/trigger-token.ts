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
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"

import { triggerFileSchema, triggerPath } from "@bulletin/schema"

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
  const relPath = triggerPath(slug)
  const absPath = path.join(dataRepoDir, relPath)
  mkdirSync(path.dirname(absPath), { recursive: true })
  writeFileSync(
    absPath,
    JSON.stringify(triggerFileSchema.parse({ routine: id, token }), null, 2) +
      "\n",
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
