import { Form } from "react-router"

import { Settings } from "lucide-react"

import { AppHeader } from "./app-header.tsx"
import { Wordmark } from "./logo.tsx"
import { Button, buttonVariants } from "~/components/ui/button"
import { Link } from "~/components/ui/link"
import { cn } from "~/lib/utils"
import { useT } from "../lib/i18n.tsx"

/**
 * The chrome for signed-in pages that sit *before* a board — the first-run
 * setup wizard and the team bootstrap. It carries what those dead-end pages
 * were missing: who you're signed in as, a settings escape hatch, and a
 * sign-out. So creating the private data repo never traps you (you can still
 * reach settings, sign out, or switch accounts) and you can always tell which
 * GitHub account you're acting as (ADR-0004) — the account whose repo the page
 * is asking about.
 */
export function AccountBar({
  login,
  className,
}: {
  login: string
  className?: string
}) {
  const t = useT()
  return (
    <AppHeader className={cn("gap-x-2.5", className)}>
      <Link
        to="/"
        aria-label="Bulletin"
        className="-mx-1 inline-flex items-center rounded-md px-1 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Wordmark className="text-sm" />
      </Link>

      {/* The account cluster, always visible — on phones too, since telling
          which login owns the repo is the whole point here. */}
      <div className="ml-auto flex items-center gap-1">
        <Link
          to="/settings"
          aria-label={t("header.settings")}
          title={t("header.settings")}
          className={cn(
            buttonVariants({ size: "icon-sm", variant: "ghost" }),
            "text-ink-dim hover:text-foreground",
          )}
        >
          <Settings className="size-3.5" />
        </Link>
        <span className="px-1 font-mono text-xs text-ink-faint">{login}</span>
        <Form method="post" action="/auth/logout">
          <Button
            size="sm"
            variant="ghost"
            type="submit"
            className="text-ink-dim hover:text-foreground"
          >
            {t("header.signOut")}
          </Button>
        </Form>
      </div>
    </AppHeader>
  )
}
