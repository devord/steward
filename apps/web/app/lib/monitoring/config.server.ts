/**
 * Where Sentry's three runtime facts come from (ADR-0059).
 *
 * Deliberately not part of `env.server.ts`'s validated schema: that module
 * parses the whole server configuration on first use and throws when
 * anything required is missing, and `instrument.server.ts` runs as the very
 * first import of the server entry — long before we want to decide whether
 * the process is configured. Monitoring must be able to say "no DSN, stay
 * quiet" without being able to fail.
 */

/**
 * The DSN is the off switch (ADR-0059). Present ⇒ the SDK initializes and
 * the browser bundle is fetched; absent ⇒ neither happens, anywhere. It is
 * not a secret — it only identifies the ingest endpoint — which is what lets
 * the server hand it to the browser in a `<meta>` tag rather than baking it
 * into the bundle, so one build serves every tier and rotating it needs no
 * rebuild.
 */
export function sentryDsn(): string | undefined {
  return process.env.SENTRY_DSN || undefined
}

/**
 * The deploy tier: `production` | `preview` | `development`, injected by
 * Vercel. It is both the Sentry `environment` tag and the key into the
 * sample-rate table (`sample-rates.ts`) — one variable, because splitting
 * them would only create a pair that can disagree.
 *
 * Unset locally, which is why a local run that should report needs
 * `VERCEL_ENV=development` set beside its DSN. That is the intended
 * friction: the tier table fails closed, so nothing collects by accident.
 */
export function deployTier(): string | undefined {
  return process.env.VERCEL_ENV || undefined
}

/**
 * The release the source maps were uploaded under: the deploy commit SHA,
 * baked at build time by Vite `define` from `GITHUB_SHA` (see
 * `vite.config.ts`). Empty outside CI ⇒ `undefined` ⇒ events carry no
 * release, which is the honest answer for a build that was never uploaded.
 *
 * Baked rather than read from the runtime environment on purpose: the value
 * has to be the one the *maps* were uploaded under, and only the build knows
 * that.
 */
export function sentryRelease(): string | undefined {
  return process.env.SENTRY_RELEASE || undefined
}

/** What the root loader hands the browser through `<meta>` tags. */
export interface SentryBrowserConfig {
  dsn: string
  environment?: string
  release?: string
}

/**
 * The browser's copy of the three facts, or `null` when there is no DSN —
 * in which case `root.tsx` renders no meta tags and `entry.client.tsx` never
 * imports the SDK.
 */
export function sentryBrowserConfig(): SentryBrowserConfig | null {
  const dsn = sentryDsn()
  if (!dsn) return null
  return { dsn, environment: deployTier(), release: sentryRelease() }
}
