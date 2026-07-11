import { useEffect, useState } from "react"
import { Form, data, redirect, useFetcher, useNavigation } from "react-router"

import { Check, Copy, Loader2 } from "lucide-react"

import type { Route } from "./+types/auth.device"
import { Wordmark } from "../components/logo.tsx"
import { buttonVariants } from "~/components/ui/button"
import { env } from "../lib/env.server.ts"
import {
  pollDeviceToken,
  requestDeviceCode,
} from "../lib/github-device.server.ts"
import { getAuthedUser } from "../lib/github.server.ts"
import { useT } from "../lib/i18n.tsx"
import { commitSession, getAuth, getSession } from "../lib/session.server.ts"
import { cn } from "~/lib/utils"

export function meta(_args: Route.MetaArgs) {
  return [{ title: "Bulletin — Device sign-in" }]
}

/**
 * Device flow (ADR-0011): the one sign-in path that works on Vercel previews,
 * since it needs no callback URL. The person gets a code, types it on
 * github.com, and this page polls until GitHub hands over the token.
 */
export async function loader({ request }: Route.LoaderArgs) {
  if (await getAuth(request)) throw redirect("/")
  const session = await getSession(request.headers.get("Cookie"))
  const device = session.get("device")
  if (device && device.expiresAt > Date.now()) {
    return {
      stage: "pending" as const,
      userCode: device.userCode,
      verificationUri: device.verificationUri,
      interval: device.interval,
    }
  }
  return { stage: "start" as const }
}

export async function action({ request }: Route.ActionArgs) {
  const session = await getSession(request.headers.get("Cookie"))
  const intent = (await request.formData()).get("intent")

  if (intent === "start") {
    let code
    try {
      code = await requestDeviceCode(env().GITHUB_CLIENT_ID, "repo read:user")
    } catch {
      // Device Flow disabled on the app, or GitHub flapped. Surface it inline
      // on the start screen instead of the generic route error boundary. A
      // non-redirect action revalidates the loader, so it re-renders "start".
      return data({ error: "device.error" as const })
    }
    session.set("device", {
      code: code.device_code,
      userCode: code.user_code,
      verificationUri: code.verification_uri,
      interval: code.interval,
      expiresAt: Date.now() + code.expires_in * 1000,
    })
    // Post/redirect/get, so a reload doesn't mint a second code.
    return redirect("/auth/device", {
      headers: { "Set-Cookie": await commitSession(session) },
    })
  }

  if (intent === "poll") {
    const device = session.get("device")
    if (!device || device.expiresAt <= Date.now()) {
      session.unset("device")
      return data({ status: "expired" as const }, await cookie(session))
    }

    const result = await pollDeviceToken(env().GITHUB_CLIENT_ID, device.code)
    switch (result.status) {
      case "authorized": {
        const user = await getAuthedUser(result.token)
        session.set("token", result.token)
        session.set("login", user.login)
        if (user.name) session.set("name", user.name)
        session.unset("device")
        session.unset("oauthState")
        return redirect("/", await cookie(session))
      }
      case "slow_down": {
        // GitHub asks us to back off; persist the wider interval so the next
        // poll (and a reload) both honour it.
        const interval = device.interval + 5
        session.set("device", { ...device, interval })
        return data(
          { status: "pending" as const, interval },
          await cookie(session),
        )
      }
      case "pending":
        return data({ status: "pending" as const, interval: device.interval })
      case "expired":
      case "denied":
      case "error":
        session.unset("device")
        return data({ status: result.status }, await cookie(session))
    }
  }

  throw new Response("Bad intent", { status: 400 })
}

/** Set-Cookie header init, so every session-mutating branch stays a one-liner. */
async function cookie(session: Parameters<typeof commitSession>[0]) {
  return { headers: { "Set-Cookie": await commitSession(session) } }
}

export default function DeviceAuth({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const t = useT()
  const startError =
    actionData && "error" in actionData ? actionData.error : null
  return (
    <main className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <Wordmark className="text-sm" />
      <h1 className="mt-10 font-mono text-2xl font-bold text-foreground">
        {t("device.title")}
      </h1>
      {loaderData.stage === "start" ? (
        <Start error={startError} />
      ) : (
        <Pending
          userCode={loaderData.userCode}
          verificationUri={loaderData.verificationUri}
          interval={loaderData.interval}
        />
      )}
    </main>
  )
}

function Start({ error }: { error: "device.error" | null }) {
  const t = useT()
  const navigation = useNavigation()
  const busy = navigation.state !== "idle"
  return (
    <>
      <p className="mt-4 leading-relaxed text-ink-dim">{t("device.intro")}</p>
      <Form method="post" className="mt-8">
        <input type="hidden" name="intent" value="start" />
        <button
          type="submit"
          disabled={busy}
          className={cn(buttonVariants({ size: "lg" }))}
        >
          {busy ? t("device.starting") : t("device.start")}
        </button>
      </Form>
      {error && (
        <p className="mt-4 text-sm text-destructive" role="alert">
          {t(error)}
        </p>
      )}
    </>
  )
}

function Pending({
  userCode,
  verificationUri,
  interval,
}: {
  userCode: string
  verificationUri: string
  interval: number
}) {
  const t = useT()
  const fetcher = useFetcher<typeof action>()
  const { state, submit } = fetcher
  const result = fetcher.data
  const status = result && "status" in result ? result.status : undefined
  const terminal =
    status === "expired" || status === "denied" || status === "error"
      ? status
      : null
  const pollSeconds =
    result && "interval" in result ? result.interval : interval

  // Poll every `pollSeconds`, but never while a poll is in flight. The effect
  // re-arms only when the fetcher settles, so timers never stack up.
  useEffect(() => {
    if (terminal || state !== "idle") return
    const id = setTimeout(() => {
      submit({ intent: "poll" }, { method: "post" })
    }, pollSeconds * 1000)
    return () => clearTimeout(id)
  }, [terminal, state, submit, pollSeconds])

  if (terminal) {
    return (
      // aria-live so a screen reader hears the swap from "waiting" to the
      // terminal outcome; the poll happens without any focus change.
      <div className="mt-8" aria-live="polite">
        <p className="leading-relaxed text-ink-dim">
          {t(`device.${terminal}`)}
        </p>
        <Form method="post" className="mt-6">
          <input type="hidden" name="intent" value="start" />
          <button type="submit" className={cn(buttonVariants())}>
            {t("device.newCode")}
          </button>
        </Form>
      </div>
    )
  }

  return (
    <div className="mt-8" aria-live="polite">
      <p className="leading-relaxed text-ink-dim">{t("device.enterCode")}</p>
      <p
        className="mt-4 rounded-md border border-border-dim bg-bg1 px-4 py-3 text-center font-mono text-3xl font-bold tracking-[0.3em] text-foreground"
        aria-label={userCode.split("").join(" ")}
      >
        {userCode}
      </p>
      <CopyButton value={userCode} />
      <a
        href={verificationUri}
        target="_blank"
        rel="noreferrer"
        className={cn(buttonVariants({ size: "lg" }), "mt-3 w-full")}
      >
        {t("device.openLink")}
      </a>
      <p className="mt-6 flex items-center gap-2 text-sm text-ink-dim">
        <Loader2 aria-hidden className="size-4 animate-spin" />
        {t("device.waiting")}
      </p>
    </div>
  )
}

/** Copy the user code to the clipboard, with a brief "copied" confirmation. */
function CopyButton({ value }: { value: string }) {
  const t = useT()
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked (insecure context or denied permission) — harmless,
      // the code is right there to type by hand.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        buttonVariants({ variant: "outline", size: "sm" }),
        "mt-3 w-full gap-2",
      )}
    >
      {copied ? (
        <Check aria-hidden className="size-3.5" />
      ) : (
        <Copy aria-hidden className="size-3.5" />
      )}
      {copied ? t("device.copied") : t("device.copy")}
    </button>
  )
}
