/**
 * Shared pieces of the API-trigger token flow (ADR-0016). The trigger is
 * research preview: it can only be created, and its token minted, in the
 * Claude web UI (shown once). These helpers take it from there — paste the
 * pair in a terminal and commit it to the data repo as
 * data/triggers/<slug>.json, where repo read access is exactly the
 * entitlement to fire. Used by routines-sync (manual cloud routines during
 * --apply) and routine-trigger (any cloud routine, on demand).
 */
import { execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import type { Interface } from "node:readline/promises"

import { triggerFileSchema, triggerPath } from "@bulletin/schema"

/** A prompt with the echo disabled (stty -echo) — the trigger token is a
    real secret (ADR-0016) and must not land in scrollback or recordings.
    Reads the terminal directly so the readline interface stays usable. */
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
export async function promptTriggerToken(
  rl: Interface,
  slug: string,
  dataRepoDir: string,
): Promise<void> {
  const id = (await rl.question(`${slug} — cloud routine id: `)).trim()
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
