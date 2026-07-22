/**
 * The machine-readable outcome of the cloud reconcile (ADR-0046). The
 * headless `claude -p` run ends its reply with a fenced code block tagged
 * `json steward-sync-result`; the sync driver parses it and derives the
 * exit code from it — convergence is a code-checked fact, not prose the
 * runner has to read. A missing or malformed block therefore means "not
 * converged", never "probably fine": the block is the only evidence the
 * cloud half accepts.
 */
import { z } from "zod"

/** One YAML connector name that resolved only via normalization (ADR-0046):
  attach happened, but the authored spelling should be updated by hand. */
const driftedNameSchema = z.object({
  /** The name as authored in routines.yaml. */
  from: z.string().min(1),
  /** The roster's canonical sanitized name. */
  to: z.string().min(1),
})

const routineOutcomeSchema = z.object({
  /** The cloud routine name exactly as listed in the plan (`steward-…`). */
  routine: z.string().min(1),
  /** What the reconcile did. `deleted` is absent by design: the trigger
    API cannot delete, so orphans surface as `needs-web-ui` instead. */
  action: z.enum(["created", "ok", "reconciled", "needs-web-ui"]),
  /** Connector names with zero roster matches — never guessed (ADR-0046). */
  unresolved: z.array(z.string()).default([]),
  /** Connector names with more than one roster match — never guessed. */
  ambiguous: z.array(z.string()).default([]),
  drifted: z.array(driftedNameSchema).default([]),
})

export const syncResultSchema = z.object({
  /** Where name→uuid resolution read from: the account roster (primary) or
    existing triggers' mcp_connections[] (the loudly-marked fallback). */
  roster_source: z.enum(["roster", "triggers"]),
  routines: z.array(routineOutcomeSchema),
  /** Human actions the API cannot perform (orphan deletion, manual-routine
    creation) — each one keeps the sync non-converged until done. */
  needs_web_ui: z.array(z.string()).default([]),
})

export type SyncResult = z.infer<typeof syncResultSchema>

export type ParsedSyncResult =
  | { ok: true; result: SyncResult }
  | { ok: false; error: string }

const BLOCK = /```json steward-sync-result\s*\n([\s\S]*?)\n\s*```/g

/**
 * Extract and validate the trailing result block from the headless run's
 * output. The last block wins — the reply ends with it, and anything the
 * model quoted earlier (e.g. echoing the instructions) must not shadow it.
 */
export function parseSyncResult(output: string): ParsedSyncResult {
  const matches = [...output.matchAll(BLOCK)]
  const last = matches.at(-1)?.[1]
  if (last == null) {
    return { ok: false, error: "no `json steward-sync-result` block in output" }
  }
  let json: unknown
  try {
    json = JSON.parse(last)
  } catch (error) {
    return {
      ok: false,
      error: `result block is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
  const validated = syncResultSchema.safeParse(json)
  if (!validated.success) {
    return {
      ok: false,
      error: `result block has the wrong shape: ${validated.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
    }
  }
  return { ok: true, result: validated.data }
}

/**
 * Everything keeping this sync from convergence, one line each — empty
 * means cloud state == desired state and the run may exit 0 (ADR-0046).
 * `expected` is the plan's cloud routine names: a routine the result block
 * skipped is unaccounted for, which is itself a divergence.
 */
export function syncResultProblems(
  result: SyncResult,
  expected: string[],
): string[] {
  const problems: string[] = []
  const reported = new Set(result.routines.map((entry) => entry.routine))
  for (const name of expected) {
    if (!reported.has(name)) problems.push(`${name}: not in the result block`)
  }
  for (const entry of result.routines) {
    if (entry.action === "needs-web-ui") {
      problems.push(`${entry.routine}: needs the web UI`)
    }
    for (const name of entry.unresolved) {
      problems.push(`${entry.routine}: connector \`${name}\` not on the roster`)
    }
    for (const name of entry.ambiguous) {
      problems.push(
        `${entry.routine}: connector \`${name}\` matches several roster names`,
      )
    }
  }
  for (const action of result.needs_web_ui) {
    problems.push(`web UI: ${action}`)
  }
  return problems
}
