/**
 * Fire a cloud routine's API trigger (ADR-0016). Research preview: the
 * endpoint and beta header are expected to change shape — pin the dated
 * header via ANTHROPIC_ROUTINES_BETA when it lands (roadmap watch item).
 * The bearer token is the routine's trigger-only token from the data repo,
 * never a server secret.
 */
const FIRE_API = "https://api.anthropic.com/v1/claude_code/routines"

const BETA_HEADER =
  process.env.ANTHROPIC_ROUTINES_BETA ?? "experimental-cc-routines"

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
