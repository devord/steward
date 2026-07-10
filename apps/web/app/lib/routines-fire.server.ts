/**
 * Fire a cloud routine's API trigger (ADR-0016). Research preview —
 * endpoint, version, and beta header verified against the web UI's
 * example request on 2026-07-10; ANTHROPIC_ROUTINES_BETA overrides the
 * pinned header when the surface changes. The bearer token is the
 * routine's trigger-only token from the data repo, never a server secret.
 */
const FIRE_API = "https://api.anthropic.com/v1/claude_code/routines"

const API_VERSION = "2023-06-01"

const BETA_HEADER =
  process.env.ANTHROPIC_ROUTINES_BETA ?? "experimental-cc-routine-2026-04-01"

export class RoutineFireError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export async function fireRoutine(options: {
  /** Cloud routine id from the trigger file. */
  routine: string
  /** Trigger-only scoped bearer token. */
  token: string
  /** Shown in the run's context: who asked for this run. */
  requestedBy: string
}): Promise<void> {
  const res = await fetch(
    `${FIRE_API}/${encodeURIComponent(options.routine)}/fire`,
    {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: {
        Authorization: `Bearer ${options.token}`,
        "anthropic-version": API_VERSION,
        "anthropic-beta": BETA_HEADER,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: `requested by ${options.requestedBy}` }),
    },
  )
  if (!res.ok) {
    throw new RoutineFireError(
      res.status,
      `fire ${options.routine} → ${res.status}`,
    )
  }
}
