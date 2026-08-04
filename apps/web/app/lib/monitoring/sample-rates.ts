/**
 * Deploy-tier-keyed Sentry sample rates (ADR-0059).
 *
 * How much signal a tier collects is a row in this table, never a branch in
 * the init. The rows are generous because Steward's audience is a handful of
 * signed-in people: full error capture and full tracing cost nothing at this
 * volume, and sampling down before there is volume to sample would only make
 * the first real incident harder to read.
 *
 * Resolution fails closed (`getSampleRates`): a tier nobody deliberately
 * configured collects NOTHING — errors included. That is the same stance as
 * the missing-DSN off switch, stated twice, so a DSN leaking into an
 * unconfigured tier still sends nothing.
 */
export interface SampleRates {
  /** Fraction of error events captured (0–1). Sentry's `sampleRate`. */
  sampleRate: number
  /** Fraction of transactions captured for tracing (0–1). */
  traces: number
  /** Fraction of ALL sessions recorded for Replay (0–1). */
  replaySessions: number
  /** Fraction of errored sessions recorded for Replay (0–1). */
  replayErrors: number
}

/**
 * Nothing collected. The inert row: unset and unrecognised tiers land here,
 * as does `preview` explicitly.
 */
const OFF: SampleRates = {
  sampleRate: 0,
  traces: 0,
  replaySessions: 0,
  replayErrors: 0,
}

/**
 * Everything except ordinary sessions.
 *
 * `replaySessions: 0` is the deliberate part. Replay records the chrome — the
 * grid drag, the dialogs, the rail — and recording *unerrored* sessions of a
 * product whose screens are full of private repo names buys nothing we
 * couldn't get by asking the person, who we know by name. On error, the
 * recording is worth its cost, so `replayErrors` is 1.
 */
const FULL: SampleRates = {
  sampleRate: 1,
  traces: 1,
  replaySessions: 0,
  replayErrors: 1,
}

/**
 * Per-tier table, keyed by `VERCEL_ENV` (`production` | `preview` |
 * `development`) — the deploy tier, which is also the Sentry `environment`
 * tag (`config.server.ts`). `preview` is listed rather than omitted so the
 * intent reads as a decision: PR previews stay inert even if a DSN reaches
 * them. `development` is here so a local run can be made to report by setting
 * `VERCEL_ENV=development` beside a DSN — two deliberate variables, never a
 * default.
 */
const RATES_BY_TIER: Record<string, SampleRates> = {
  development: FULL,
  preview: OFF,
  production: FULL,
}

/**
 * Resolve the rates for a deploy tier. Unset, or any value not in the table
 * (a mistyped tier, a tier Vercel adds later), maps to `OFF` — collection is
 * something a tier opts into, never something it falls into.
 */
export function getSampleRates(tier?: string): SampleRates {
  if (!tier) return OFF
  return RATES_BY_TIER[tier] ?? OFF
}
