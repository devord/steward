import { DEFAULT_LOCALE, isLocale, type Locale, matchLocale } from "./i18n.tsx"

/**
 * Server-side locale negotiation (ADR-0009): the explicit cookie wins, the
 * browser's Accept-Language seeds the first visit, English is the floor.
 * A plain cookie, not the auth session — language is a device preference
 * and must work for anonymous visitors too.
 */
const LOCALE_COOKIE = "bulletin_locale"

/**
 * The best supported locale in an Accept-Language header, honoring
 * q-values: ranges are ranked by weight (q=0 excluded), and the first one
 * we can serve wins — so `fr, pt;q=0.8` lands on pt-BR, not the default.
 */
export function negotiateLocale(header: string | null): Locale | undefined {
  if (!header) return undefined
  const ranges = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";")
      const q = params
        .map((param) => param.trim())
        .find((param) => param.startsWith("q="))
      const weight = q ? Number.parseFloat(q.slice(2)) : 1
      return {
        tag: tag?.trim() ?? "",
        weight: Number.isFinite(weight) ? weight : 0,
      }
    })
    .filter((range) => range.tag.length > 0 && range.weight > 0)
    .sort((a, b) => b.weight - a.weight)
  for (const { tag } of ranges) {
    if (tag === "*") return DEFAULT_LOCALE
    const supported = matchLocale(tag)
    if (supported) return supported
  }
  return undefined
}

export function getLocale(request: Request): Locale {
  const cookie = request.headers.get("Cookie") ?? ""
  const match = cookie.match(
    new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]+)`),
  )?.[1]
  if (match) {
    // A malformed value (e.g. a stray `%`) must fall through to header
    // negotiation, never turn the request into a 500.
    try {
      const decoded = decodeURIComponent(match)
      if (isLocale(decoded)) return decoded
    } catch {
      // fall through
    }
  }
  return (
    negotiateLocale(request.headers.get("Accept-Language")) ?? DEFAULT_LOCALE
  )
}

/** `Set-Cookie` value persisting an explicit language choice for a year. */
export function localeCookie(locale: Locale): string {
  return `${LOCALE_COOKIE}=${encodeURIComponent(locale)}; Path=/; Max-Age=31536000; SameSite=Lax`
}
