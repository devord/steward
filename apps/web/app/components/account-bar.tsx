import { AccountMenu } from "./account-menu.tsx"
import { AppHeader } from "./app-header.tsx"
import { Wordmark } from "./logo.tsx"
import { Link } from "~/components/ui/link"
import { cn } from "~/lib/utils"

/**
 * The chrome for signed-in pages that sit *before* a board — the first-run
 * setup wizard and the team bootstrap. It carries what those dead-end pages
 * were missing: who you're signed in as, a settings escape hatch, and a
 * sign-out. So creating the private data repo never traps you (you can still
 * reach settings, sign out, or switch accounts) and you can always tell which
 * GitHub account you're acting as (ADR-0004). Those account actions live in
 * the same {@link AccountMenu} the board rail uses — no data repo yet, so it
 * shows identity, settings, and sign-out without the repo link.
 */
export function AccountBar({
  login,
  className,
}: {
  login: string
  className?: string
}) {
  return (
    <AppHeader className={cn("gap-x-2.5", className)}>
      <Link
        to="/"
        aria-label="Bulletin"
        className="-mx-1 inline-flex items-center rounded-md px-1 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Wordmark className="text-sm" />
      </Link>

      <div className="ml-auto flex min-w-0 items-center">
        <AccountMenu login={login} />
      </div>
    </AppHeader>
  )
}
