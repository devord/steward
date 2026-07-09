import { z } from "zod"

/** Server configuration (ADR-0004). Validated once, lazily, at first use. */
const envSchema = z.object({
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  /** Cookie-signing secret; generate with `openssl rand -hex 32`. */
  SESSION_SECRET: z.string().min(32),
  /** `owner/name` of the shared repo (catalog + contracts). */
  BULLETIN_SHARED_REPO: z.string().regex(/^[^/]+\/[^/]+$/),
  /** `owner/name` of the data-repo template. */
  BULLETIN_DATA_REPO_TEMPLATE: z.string().regex(/^[^/]+\/[^/]+$/),
  BULLETIN_DATA_REPO_PREFIX: z.string().default("bulletin-data-"),
})

export type Env = z.infer<typeof envSchema>

let cached: Env | undefined

export function env(): Env {
  cached ??= envSchema.parse(process.env)
  return cached
}
