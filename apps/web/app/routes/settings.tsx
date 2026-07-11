import { data, useFetcher } from "react-router"

import { ArrowLeft, Check } from "lucide-react"

import type { Route } from "./+types/settings"
import { AppHeader } from "../components/app-header.tsx"
import {
  AppearanceSettings,
  handleRadioKeydown,
} from "../components/appearance-settings.tsx"
import { Wordmark } from "../components/logo.tsx"
import {
  isLocale,
  LOCALE_OPTIONS,
  translate,
  useLocale,
  useT,
} from "../lib/i18n.tsx"
import { getLocale, localeCookie } from "../lib/locale.server.ts"
import { buttonVariants } from "~/components/ui/button"
import { Link } from "~/components/ui/link"
import { cn } from "~/lib/utils"

export function loader({ request }: Route.LoaderArgs) {
  return { locale: getLocale(request) }
}

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData
    ? `Bulletin — ${translate(loaderData.locale, "settings.title")}`
    : "Bulletin — Settings"
  return [{ title }]
}

/**
 * Device preferences (ADR-0009). Appearance never touches the server —
 * localStorage only. Language is the one server-visible choice (SSR renders
 * in it), persisted as a plain cookie by the action below; the root loader
 * revalidates and the whole app re-renders translated. No auth required:
 * these are browser preferences, not data-repo state.
 */
export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData()
  const locale = form.get("locale")
  if (typeof locale !== "string" || !isLocale(locale)) {
    throw data("Unknown language", { status: 400 })
  }
  return data(null, { headers: { "Set-Cookie": localeCookie(locale) } })
}

export default function Settings(_props: Route.ComponentProps) {
  const t = useT()

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 sm:px-6">
      <AppHeader className="mb-8 gap-x-2">
        <Wordmark className="text-sm" />
        <span aria-hidden className="font-mono text-xs text-ink-dim">
          ·
        </span>
        <h1 className="font-mono text-xs text-ink-dim">
          {t("settings.title")}
        </h1>
        <Link
          to="/"
          className={cn(
            buttonVariants({ size: "sm", variant: "ghost" }),
            "ml-auto text-ink-dim hover:text-foreground",
          )}
        >
          <ArrowLeft data-icon="inline-start" />
          {t("settings.back")}
        </Link>
      </AppHeader>

      <main className="flex flex-col gap-10">
        <section aria-labelledby="settings-appearance">
          <h2
            id="settings-appearance"
            className="mb-4 font-mono text-xs text-ink-dim"
          >
            {t("settings.appearance")}
          </h2>
          <AppearanceSettings />
        </section>

        <section aria-labelledby="settings-language">
          <h2
            id="settings-language"
            className="mb-4 font-mono text-xs text-ink-dim"
          >
            {t("settings.language")}
          </h2>
          <LanguageSettings />
          <p className="mt-2 font-mono text-xs text-ink-dim">
            {t("settings.languageHint")}
          </p>
        </section>

        <p className="border-t border-border-dim pt-3 font-mono text-xs text-ink-dim">
          {t("settings.saved")}
        </p>
      </main>
    </div>
  )
}

/**
 * The language rows. Labels are autonyms, never translated. The pending
 * fetcher value renders optimistically so the check moves on click, then
 * the revalidated root loader re-renders the whole app in the new language.
 */
function LanguageSettings() {
  const locale = useLocale()
  const fetcher = useFetcher()
  const pending = fetcher.formData?.get("locale")
  const active =
    typeof pending === "string" && isLocale(pending) ? pending : locale

  return (
    <div
      role="radiogroup"
      aria-labelledby="settings-language"
      className="flex max-w-xs flex-col gap-1.5"
    >
      {LOCALE_OPTIONS.map((option) => {
        const selected = option.value === active
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onKeyDown={handleRadioKeydown}
            onClick={() =>
              void fetcher.submit({ locale: option.value }, { method: "post" })
            }
            className={cn(
              "flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
              selected
                ? "border-primary text-foreground"
                : "border-border-dim text-ink-dim hover:border-border hover:bg-bg2 hover:text-foreground",
            )}
          >
            {option.label}
            {selected && (
              <Check aria-hidden className="size-3.5 text-primary" />
            )}
          </button>
        )
      })}
    </div>
  )
}
