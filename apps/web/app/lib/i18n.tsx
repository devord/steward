/**
 * The language seam (ADR-0009). The locale is negotiated server-side
 * (cookie, then Accept-Language — locale.server.ts), threaded through the
 * root loader into this provider, and rendered as `<html lang>` — so SSR
 * output is already in the right language, no flash, no client detection.
 *
 * Dictionaries are flat typed maps (locales/en.ts is the source of truth);
 * `t("widget.ran", { ago })` interpolates `{slot}` markers. Option labels
 * for the picker are autonyms and intentionally never translated.
 */
import { createContext, useCallback, useContext, useMemo } from "react"

import { en, type MessageKey, type Messages } from "../locales/en.ts"
import { ptBR } from "../locales/pt-br.ts"

export const LOCALES = ["en", "pt-BR"] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = "en"

/** The picker's options — labels are each language's own name. */
export const LOCALE_OPTIONS: readonly { value: Locale; label: string }[] = [
  { value: "en", label: "English" },
  { value: "pt-BR", label: "Português (Brasil)" },
]

const dictionaries: Record<Locale, Messages> = { en, "pt-BR": ptBR }

export function isLocale(value: unknown): value is Locale {
  return LOCALES.some((locale) => locale === value)
}

/**
 * The locale a language tag (`pt`, `pt-PT`, `en-US`, …) selects, or
 * undefined when we don't support the language at all — the distinction
 * Accept-Language negotiation needs to keep looking down the list.
 */
export function matchLocale(
  tag: string | null | undefined,
): Locale | undefined {
  if (isLocale(tag)) return tag
  const base = tag?.toLowerCase()
  if (base?.startsWith("pt")) return "pt-BR"
  if (base?.startsWith("en")) return "en"
  return undefined
}

/** Collapse any language tag onto an option, defaulting to English. */
export function normalizeLocale(tag: string | null | undefined): Locale {
  return matchLocale(tag) ?? DEFAULT_LOCALE
}

export type Translate = (
  key: MessageKey,
  params?: Record<string, string | number>,
) => string

export function translate(
  locale: Locale,
  key: MessageKey,
  params?: Record<string, string | number>,
): string {
  const template = dictionaries[locale][key] ?? en[key]
  if (!params) return template
  return template.replaceAll(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  )
}

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE)

export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale
  children: React.ReactNode
}) {
  return <LocaleContext value={locale}>{children}</LocaleContext>
}

export function useLocale(): Locale {
  return useContext(LocaleContext)
}

/** The `t` most components want; stable per locale. */
export function useT(): Translate {
  const locale = useLocale()
  return useCallback<Translate>(
    (key, params) => translate(locale, key, params),
    [locale],
  )
}

/** `t` + locale in one hook, for components that need both. */
export function useI18n(): { locale: Locale; t: Translate } {
  const locale = useLocale()
  const t = useT()
  return useMemo(() => ({ locale, t }), [locale, t])
}
