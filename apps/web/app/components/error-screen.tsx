import { Form, isRouteErrorResponse } from "react-router"

import { AppHeader } from "./app-header.tsx"
import { Wordmark } from "./logo.tsx"
import { Button } from "~/components/ui/button"
import { Link } from "~/components/ui/link"
import { type Translate, useT } from "../lib/i18n.tsx"

/**
 * The header shell for every error screen: the wordmark home link and an
 * always-available sign-out. Deliberately loader-data-free so it renders no
 * matter which loader failed — the guarantee that an error can never strand the
 * user without a way out.
 */
export function ErrorChrome() {
  const t = useT()
  return (
    <AppHeader className="gap-x-2.5">
      <Link
        to="/"
        aria-label="Steward"
        className="-mx-1 inline-flex items-center rounded-md px-1 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Wordmark className="text-sm" />
      </Link>
      <Form method="post" action="/auth/logout" className="ml-auto">
        <Button
          size="sm"
          variant="ghost"
          type="submit"
          className="text-ink-dim hover:text-foreground"
        >
          {t("header.signOut")}
        </Button>
      </Form>
    </AppHeader>
  )
}

/**
 * The shared error page: chrome (with the sign-out escape hatch) plus a title
 * and a details line. A dead-token 401 is the one error the user recovers from
 * *here*, so `sessionExpired` surfaces sign-out as a primary action too.
 */
export function ErrorScreen({
  title,
  details,
  sessionExpired = false,
  stack,
}: {
  title: string
  details: string
  sessionExpired?: boolean
  /** Dev-only crash stack, rendered verbatim below the details. */
  stack?: string
}) {
  const t = useT()
  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6">
      <ErrorChrome />
      <main className="py-16">
        <h1 className="font-mono text-2xl font-bold text-destructive">
          {title}
        </h1>
        <p className="mt-4">{details}</p>
        {sessionExpired && (
          <Form method="post" action="/auth/logout" className="mt-6">
            <Button type="submit">{t("header.signOut")}</Button>
          </Form>
        )}
        {stack && (
          <pre className="mt-4 overflow-x-auto rounded-md border border-border-dim bg-bg1 p-4">
            <code>{stack}</code>
          </pre>
        )}
      </main>
    </div>
  )
}

/**
 * Derive the setup route's error screen from a thrown route error.
 *
 * The root boundary treats every 404 as "page not found" and shows the generic
 * not-found copy — correct for an unmatched URL. But the setup create path
 * throws 404s whose body *is* the explanation (a private or missing data-repo
 * template, {@link createDataRepoOr503}): retrying can never succeed, so the
 * user needs the message, not "the page could not be found." A genuine no-match
 * 404 never reaches this route boundary — it's caught at the root — so here the
 * thrown message is always the right thing to surface.
 */
export function describeSetupError(
  error: unknown,
  t: Translate,
): { title: string; details: string; sessionExpired: boolean } {
  if (isRouteErrorResponse(error)) {
    return {
      title: t("error.title"),
      // Loaders/actions throw data("<human message>", { status }) for expected
      // failures — surface that over the bare statusText.
      details:
        (typeof error.data === "string" && error.data) ||
        error.statusText ||
        t("error.generic"),
      sessionExpired: error.status === 401,
    }
  }
  return {
    title: t("error.title"),
    details: t("error.generic"),
    sessionExpired: false,
  }
}
