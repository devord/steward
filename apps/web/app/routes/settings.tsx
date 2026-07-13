import { data, useFetcher } from "react-router"

import { ArrowLeft, Check } from "lucide-react"

import type { Route } from "./+types/settings"
import {
  AppearanceSettings,
  handleRadioKeydown,
} from "../components/appearance-settings.tsx"
import { NavShell } from "../components/nav-shell.tsx"
import { streamSidebar } from "../lib/dashboard.server.ts"
import {
  isLocale,
  LOCALE_OPTIONS,
  translate,
  useLocale,
  useT,
} from "../lib/i18n.tsx"
import { getLocale, localeCookie } from "../lib/locale.server.ts"
import { requireAuth } from "../lib/session.server.ts"
import { useStreamed } from "../lib/use-streamed.ts"
import { buttonVariants } from "~/components/ui/button"
import { Link } from "~/components/ui/link"
import { cn } from "~/lib/utils"

/**
 * Settings renders inside the same app frame the boards use (NavShell) so the
 * rail, account menu, and header stay put across the trip — hence the loader
 * also fetches the sibling boards the rail lists. No board is current here, so
 * the rail lights nothing (it reads as "off-board") and the header carries a
 * plain way back. Boards are best-effort: `listDashboards` already degrades to
 * null when the repo/dir is missing (pre-setup, reached via the account menu),
 * and a transient GitHub blip degrades to an empty rail rather than crashing
 * the one page that must never trap the user — never a redirect.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request)
  // Streamed, never awaited (ADR-0030): settings itself needs zero GitHub
  // data, so the page answers instantly and the rail fills in when the
  // sidebar resolves. streamSidebar already degrades any failure to an empty
  // rail rather than crashing the one page that must never trap the user.
  const sidebar = streamSidebar(auth.token, auth.login, auth.dataRepo)
  return {
    locale: getLocale(request),
    login: auth.login,
    displayName: auth.name ?? null,
    sidebar,
  }
}

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData
    ? `Steward — ${translate(loaderData.locale, "settings.title")}`
    : "Steward — Settings"
  return [{ title }]
}

/**
 * Device preferences (ADR-0009). Appearance never touches the server —
 * localStorage only. Language is the one server-visible choice (SSR renders
 * in it), persisted as a plain cookie by the action below; the root loader
 * revalidates and the whole app re-renders translated.
 */
export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData()
  const locale = form.get("locale")
  if (typeof locale !== "string" || !isLocale(locale)) {
    throw data("Unknown language", { status: 400 })
  }
  return data(null, { headers: { "Set-Cookie": localeCookie(locale) } })
}

export default function Settings({ loaderData }: Route.ComponentProps) {
  const t = useT()
  const sidebar = useStreamed(loaderData.sidebar, "sidebar")

  return (
    <NavShell
      nav={{
        // No board is current on settings, so pass an empty repo+slug — the
        // rail then lights nothing, reading as "you're off the board".
        activeRepo: "",
        dashboardSlug: "",
        sidebar,
        login: loaderData.login,
        displayName: loaderData.displayName,
      }}
      cap="max-w-3xl"
      actions={
        <Link
          to="/"
          className={cn(
            buttonVariants({ size: "sm", variant: "ghost" }),
            "text-ink-dim hover:text-foreground",
          )}
        >
          <ArrowLeft data-icon="inline-start" />
          {t("settings.back")}
        </Link>
      }
    >
      <h1 className="mb-8 font-mono text-base text-foreground">
        {t("settings.title")}
      </h1>

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
    </NavShell>
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
