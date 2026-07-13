import { Check, Monitor, Moon, Sun } from "lucide-react"

import { handleRadioKeydown } from "./appearance-settings.tsx"
import { Wordmark } from "./logo.tsx"
import { buttonVariants } from "~/components/ui/button"
import { cn } from "~/lib/utils"
import type { AppearanceMode } from "../lib/theme.ts"
import { useAppearance } from "../lib/use-appearance.ts"
import { useT } from "../lib/i18n.tsx"

/**
 * The signed-out front door. Viewport one shows the product (pitch + live
 * demo board); the sections below argue it for a reader who has never heard
 * of Steward: the loop, ownership, what's built in. Terminal-calm per
 * PRODUCT.md — no entrance choreography; section headings stay in the chrome
 * scale, and only the hero headline shares the wordmark's display latitude.
 */
export function Landing() {
  const t = useT()
  return (
    <main className="landing-bg relative min-h-dvh">
      <LandingModeToggle />
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Viewport one: the pitch and the one action. */}
        <div className="flex min-h-dvh flex-col justify-center gap-12 py-16 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-16">
          <div className="max-w-md">
            <h1>
              <Wordmark live display className="text-4xl sm:text-5xl" />
            </h1>
            <p className="mt-7 text-2xl leading-snug text-pretty text-foreground sm:text-3xl">
              {t("landing.headline")}
            </p>
            <p className="mt-3 leading-relaxed text-pretty text-ink-dim">
              {t("landing.tagline")}
            </p>
            <p className="mt-3 font-mono text-sm text-ink-dim">
              {t("landing.sub")}
            </p>

            <SignInButton size="lg" className="mt-8" />
            <p className="mt-4 max-w-xs text-xs leading-relaxed text-ink-faint">
              {t("landing.privacy")}
            </p>
            {/* Fallback for hosts the OAuth callback can't reach — chiefly
                Vercel preview subdomains, whose URL no callback can match. */}
            <a
              href="/auth/device"
              className="mt-3 inline-block text-xs text-ink-faint underline underline-offset-2 hover:text-ink-dim"
            >
              {t("landing.deviceLink")}
            </a>

            {/* The mechanism in four tokens — the same pipeline the OG card
                carries, expanded step by step in the section below. Git words
                stay untranslated (DESIGN.md). */}
            <p className="mt-10 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-ink-faint">
              <PipeStep>cron</PipeStep>
              <PipeArrow />
              <PipeStep>skill</PipeStep>
              <PipeArrow />
              <PipeStep>git push</PipeStep>
              <PipeArrow />
              <PipeStep>widget</PipeStep>
            </p>
          </div>

          {/* Right: the product itself — a small living board. Decorative, so
              it's hidden from assistive tech; the pitch carries the meaning. */}
          <DemoBoard />
        </div>

        {/* Below the fold: the argument, for readers arriving cold. */}
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-20 pb-24">
          <LoopSection />
          <DataSection />
          <FeaturesSection />
          <ClosingCta />
        </div>
      </div>
    </main>
  )
}

/* --- Sections ------------------------------------------------------------ */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-lg font-medium text-foreground">
      <span aria-hidden className="mr-2 font-mono text-primary/70">
        ▸
      </span>
      {children}
    </h2>
  )
}

/**
 * The pipeline strip, expanded: one step per token. The token labels are
 * machine strings (mono, untranslated); the prose under each is chrome.
 * Claude Code is named here — the hero stays outcome-only.
 */
function LoopSection() {
  const t = useT()
  const steps = [
    { token: "cron", body: t("landing.loop.cron") },
    { token: "skill", body: t("landing.loop.skill") },
    { token: "git push", body: t("landing.loop.push") },
    { token: "widget", body: t("landing.loop.widget") },
  ]
  return (
    <section>
      <SectionTitle>{t("landing.loop.title")}</SectionTitle>
      <ol className="mt-6 grid gap-x-10 gap-y-6 sm:grid-cols-2">
        {steps.map((step, i) => (
          <li key={step.token} className="text-sm leading-relaxed">
            <span className="flex items-baseline gap-2 font-mono text-sm">
              <span aria-hidden className="text-ink-faint">
                {i + 1}.
              </span>
              <span className="text-foreground">{step.token}</span>
            </span>
            <p className="mt-1.5 text-ink-dim">{step.body}</p>
          </li>
        ))}
      </ol>
      <p className="mt-6 text-sm leading-relaxed text-ink-dim">
        {t("landing.loop.prereqs")}
      </p>
    </section>
  )
}

function DataSection() {
  const t = useT()
  return (
    <section>
      <SectionTitle>{t("landing.data.title")}</SectionTitle>
      <ul className="mt-6 space-y-4 text-sm leading-relaxed text-ink-dim">
        <li>{t("landing.data.repo")}</li>
        <li>{t("landing.data.stateless")}</li>
        <li>{t("landing.data.leave")}</li>
      </ul>
    </section>
  )
}

function FeaturesSection() {
  const t = useT()
  const features = [
    {
      title: t("landing.features.templates.title"),
      body: t("landing.features.templates.body"),
    },
    {
      title: t("landing.features.hosts.title"),
      body: t("landing.features.hosts.body"),
    },
    {
      title: t("landing.features.fresh.title"),
      body: t("landing.features.fresh.body"),
    },
  ] as const
  return (
    <section>
      <SectionTitle>{t("landing.features.title")}</SectionTitle>
      <div className="mt-6 grid gap-x-10 gap-y-6 sm:grid-cols-3">
        {features.map((feature) => (
          <div key={feature.title} className="text-sm leading-relaxed">
            <h3 className="font-medium text-foreground">{feature.title}</h3>
            <p className="mt-1.5 text-ink-dim">{feature.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function ClosingCta() {
  const t = useT()
  return (
    <section className="flex flex-col items-start gap-4 border-t border-border-dim pt-10">
      <p className="font-mono text-sm text-ink-dim">{t("landing.cta")}</p>
      <SignInButton />
    </section>
  )
}

function SignInButton({
  size,
  className,
}: {
  size?: "lg"
  className?: string
}) {
  const t = useT()
  return (
    <a
      href="/auth/login"
      className={cn(buttonVariants({ size }), "gap-2", className)}
    >
      <GithubMark className="size-4" />
      {t("landing.signIn")}
    </a>
  )
}

/* --- Mode toggle ---------------------------------------------------------- */

const LANDING_MODES = [
  { mode: "system", Icon: Monitor, label: "settings.modeAuto" },
  { mode: "light", Icon: Sun, label: "settings.modeLight" },
  { mode: "dark", Icon: Moon, label: "settings.modeDark" },
] as const satisfies ReadonlyArray<{
  mode: AppearanceMode
  Icon: typeof Monitor
  label: string
}>

/**
 * A compact mode switch for signed-out visitors: auto / light / dark, writing
 * the same device preference the app uses (use-appearance), so the choice
 * carries through sign-in. The wordmark, pitch, and demo board are all
 * token-based, so they re-theme the moment this changes.
 */
function LandingModeToggle() {
  const t = useT()
  const [prefs, update] = useAppearance()
  return (
    <div
      role="radiogroup"
      aria-label={t("settings.mode")}
      className="absolute top-4 right-4 z-10 flex gap-0.5 rounded-lg border border-border-dim bg-bg1 p-0.5 sm:top-6 sm:right-6"
    >
      {LANDING_MODES.map(({ mode, Icon, label }) => {
        const active = prefs.mode === mode
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={t(label)}
            title={t(label)}
            tabIndex={active ? 0 : -1}
            onClick={() => update({ mode })}
            onKeyDown={handleRadioKeydown}
            className={cn(
              "flex size-7 cursor-pointer items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              active
                ? "bg-secondary text-foreground"
                : "text-ink-dim hover:text-foreground",
            )}
          >
            <Icon aria-hidden className="size-3.5" />
          </button>
        )
      })}
    </div>
  )
}

function PipeStep({ children }: { children: React.ReactNode }) {
  return <span className="text-ink-dim">{children}</span>
}

function PipeArrow() {
  return (
    <span aria-hidden className="text-primary/70">
      ▸
    </span>
  )
}

/** The GitHub mark, currentColor so it inherits the button's ink. */
function GithubMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      fill="currentColor"
      className={className}
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  )
}

/* --- Landing demo board ----------------------------------------------------
   A faux dashboard rendered in the real widget chrome (card + title bar), so
   the landing shows the product instead of describing it. Content is
   illustrative; colors are tokens only. Widget artifacts here are plain
   markup, not iframes — this never touches a real routine. */

function DemoBoard() {
  const t = useT()
  return (
    <div
      aria-hidden
      className="flex w-full max-w-md flex-col items-stretch gap-3 max-lg:mx-auto sm:flex-row"
    >
      {/* Left column: one tall widget, stretched to match the right stack. */}
      <DemoWidget name="Daily plan" ago="Ran 2h ago" className="flex-1">
        <p className="mb-3 flex items-center justify-between font-mono text-xs text-ink-dim">
          Today
          <span className="text-ink-faint">Jul 09</span>
        </p>
        <ul className="space-y-2.5 text-xs">
          <Task done>Ship M1 acceptance</Task>
          <Task done>Review sync PR</Task>
          <Task>Draft ADR-0010</Task>
          <Task>Triage the inbox</Task>
          <Task>Merge appearance branch</Task>
          <Task>Reply to design thread</Task>
        </ul>
        <div className="mt-auto flex items-center gap-2 pt-4 font-mono text-xs text-ink-dim">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg3">
            <span
              className="block h-full rounded-full bg-green"
              style={{ width: "33%" }}
            />
          </span>
          2/6
        </div>
      </DemoWidget>

      {/* Right column: two stacked widgets, ~matching the tall one. */}
      <div className="flex flex-1 flex-col gap-3">
        <DemoWidget name="Repo pulse" ago="Ran 14m ago">
          <p className="mb-2.5 font-mono text-xs text-ink-dim">Open PRs</p>
          <div className="space-y-2">
            <PulseRow label="steward" fill="68%" n={4} />
            <PulseRow label="chat" fill="40%" n={2} />
            <PulseRow label="kb" fill="18%" n={1} />
          </div>
        </DemoWidget>

        <DemoWidget
          name="Changelog"
          ago="Ran 4d ago"
          stale
          staleLabel={t("widget.stale")}
        >
          <p className="mb-2.5 font-mono text-xs text-ink-dim">This week</p>
          <div className="space-y-2">
            <SkeletonLine w="w-full" />
            <SkeletonLine w="w-4/5" />
            <SkeletonLine w="w-11/12" />
            <SkeletonLine w="w-2/3" />
          </div>
        </DemoWidget>
      </div>
    </div>
  )
}

function DemoWidget({
  name,
  ago,
  stale = false,
  staleLabel,
  className,
  children,
}: {
  name: string
  ago: string
  stale?: boolean
  staleLabel?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border bg-card",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-border-dim px-2.5 py-1.5 text-xs">
        <span className="truncate font-medium text-foreground">{name}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5 font-mono text-ink-dim">
          {stale && (
            <span className="rounded border border-yellow/45 bg-yellow/10 px-1.5 text-xs text-ink">
              {staleLabel}
            </span>
          )}
          {ago}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-3">{children}</div>
    </div>
  )
}

function Task({
  done = false,
  children,
}: {
  done?: boolean
  children: React.ReactNode
}) {
  return (
    <li className="flex items-center gap-2">
      {done ? (
        <Check className="size-3 shrink-0 text-green" />
      ) : (
        <span className="size-3 shrink-0 rounded-full border border-border" />
      )}
      <span className={done ? "text-ink-faint line-through" : "text-ink-dim"}>
        {children}
      </span>
    </li>
  )
}

function PulseRow({
  label,
  fill,
  n,
}: {
  label: string
  fill: string
  n: number
}) {
  return (
    <div className="flex items-center gap-2 font-mono text-xs">
      <span className="w-16 shrink-0 truncate text-ink-dim">{label}</span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg3">
        <span
          className="block h-full rounded-full bg-aqua"
          style={{ width: fill }}
        />
      </span>
      <span className="w-3 shrink-0 text-right text-ink-faint">{n}</span>
    </div>
  )
}

function SkeletonLine({ w }: { w: string }) {
  return <span className={cn("block h-2 rounded-full bg-bg3", w)} />
}
