import { useEffect, useRef, useState } from "react"
import {
  Blocks,
  Check,
  ChevronsDown,
  Lock,
  Monitor,
  Moon,
  RefreshCw,
  Sun,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { handleRadioKeydown } from "./appearance-settings.tsx"
import { Wordmark } from "./logo.tsx"
import { buttonVariants } from "~/components/ui/button"
import { cn } from "~/lib/utils"
import { cssVars } from "../lib/css.ts"
import type { AppearanceMode } from "../lib/theme.ts"
import { useAppearance } from "../lib/use-appearance.ts"
import { useT } from "../lib/i18n.tsx"

/**
 * The signed-out front door. Viewport one shows the product (pitch + live
 * demo board) and ends on a pager-style `more` cue, since a large screen
 * makes the hero look like the whole page; the sections below argue the
 * product for a reader who has never heard of Steward: the loop, ownership,
 * what's built in. Terminal-calm per PRODUCT.md — the hero itself has no
 * entrance choreography (the caret blink is the one signature motion);
 * below the fold each section prints in once as it scrolls into view
 * (useReveal), the way terminal output arrives. Section headings stay in
 * the chrome scale; only the hero headline shares the wordmark's display
 * latitude.
 */
export function Landing() {
  const t = useT()
  return (
    <main className="landing-bg relative min-h-dvh">
      <LandingModeToggle />
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Viewport one: the pitch and the one action. */}
        <div className="relative flex min-h-dvh flex-col justify-center gap-12 py-16 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-16">
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
          </div>

          {/* Right: the product itself — a small living board. Decorative, so
              it's hidden from assistive tech; the pitch carries the meaning. */}
          <DemoBoard />

          <ScrollCue />
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

/* --- Scroll cue ----------------------------------------------------------- */

/**
 * Landing glyphs (section markers, the scroll cue) sharpen lucide's default
 * rounding to square caps and miter joins — the terminal-crisp voice the old
 * ▸/▾ characters carried. Control icons (mode toggle, demo board) keep the
 * stock rounding so they match their twins in the app chrome.
 */
const sharp = { strokeLinecap: "square", strokeLinejoin: "miter" } as const

/**
 * A pager prompt at the foot of viewport one: a double chevron cascading
 * downward (app.css pulses its two strokes in sequence), telling a reader on
 * a tall screen that the argument continues below. It anchors to the first
 * section and fades out the moment the page scrolls; a hint, not chrome.
 */
function ScrollCue() {
  const t = useT()
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])
  return (
    <a
      href="#how"
      aria-label={t("landing.moreLabel")}
      onClick={(event) => {
        event.preventDefault()
        document.getElementById("how")?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "auto"
            : "smooth",
        })
      }}
      className={cn(
        "group absolute inset-x-0 bottom-4 z-10 mx-auto flex w-fit items-center gap-2 rounded-md px-3 py-2 font-mono text-xs text-ink-faint transition-opacity duration-200 outline-none hover:text-ink-dim focus-visible:ring-3 focus-visible:ring-ring/50",
        scrolled && "pointer-events-none opacity-0",
      )}
    >
      <ChevronsDown
        aria-hidden
        {...sharp}
        className="landing-cue-glyph size-4 text-primary/70 transition-colors group-hover:text-primary"
      />
      {t("landing.more")}
    </a>
  )
}

/* --- Sections ------------------------------------------------------------ */

/**
 * Reveals an element (data-reveal="hidden" → "shown") the first time it
 * scrolls into view; app.css translates the attribute into the print-in
 * transition. Enhancement only: the hidden state is applied by this effect,
 * so with no JS (or in a headless renderer) the content ships visible — and
 * anything already on screen at mount, or above it after a scroll restore,
 * is left static rather than re-animated under the reader.
 */
function useReveal() {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = ref.current
    // Strict <: the first section's top sits exactly on the fold (the hero
    // is exactly 100dvh), and a top at innerHeight is 0px visible.
    if (!el || el.getBoundingClientRect().top < window.innerHeight) return
    el.dataset.reveal = "hidden"
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          el.dataset.reveal = "shown"
          io.disconnect()
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return ref
}

/**
 * Section headings all reveal, so the title is always cascade item 0. Each
 * marker names its section's subject in the app's own icon vocabulary:
 * RefreshCw is the widget update action (widget-card), Lock is the private
 * repo (repo-group-header), Blocks the built-in parts.
 */
function SectionTitle({
  icon: Icon,
  children,
}: {
  icon: LucideIcon
  children: React.ReactNode
}) {
  return (
    <h2 className="landing-reveal-item flex items-center gap-2.5 text-lg font-medium text-foreground">
      <Icon
        aria-hidden
        {...sharp}
        className="size-4 shrink-0 text-primary/70"
      />
      {children}
    </h2>
  )
}

/**
 * The loop in four numbered steps. Claude Code is named here — the hero
 * stays outcome-only.
 */
function LoopSection() {
  const t = useT()
  const reveal = useReveal()
  const steps = [
    t("landing.loop.cron"),
    t("landing.loop.skill"),
    t("landing.loop.push"),
    t("landing.loop.widget"),
  ]
  return (
    <section id="how" ref={reveal}>
      <SectionTitle icon={RefreshCw}>{t("landing.loop.title")}</SectionTitle>
      <ol className="mt-6 grid gap-x-10 gap-y-6 sm:grid-cols-2">
        {steps.map((body, i) => (
          <li
            key={body}
            className="landing-reveal-item flex gap-2 text-sm leading-relaxed"
            style={cssVars({ "--i": i + 1 })}
          >
            <span aria-hidden className="font-mono text-ink-faint">
              {i + 1}.
            </span>
            <p className="text-ink-dim">{body}</p>
          </li>
        ))}
      </ol>
      <p
        className="landing-reveal-item mt-6 text-sm leading-relaxed text-ink-dim"
        style={cssVars({ "--i": 5 })}
      >
        {t("landing.loop.prereqs")}
      </p>
    </section>
  )
}

function DataSection() {
  const t = useT()
  const reveal = useReveal()
  const points = [
    t("landing.data.repo"),
    t("landing.data.stateless"),
    t("landing.data.leave"),
  ]
  return (
    <section ref={reveal}>
      <SectionTitle icon={Lock}>{t("landing.data.title")}</SectionTitle>
      <ul className="mt-6 space-y-4 text-sm leading-relaxed text-ink-dim">
        {points.map((point, i) => (
          <li
            key={point}
            className="landing-reveal-item"
            style={cssVars({ "--i": i + 1 })}
          >
            {point}
          </li>
        ))}
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
  const reveal = useReveal()
  return (
    <section ref={reveal}>
      <SectionTitle icon={Blocks}>{t("landing.features.title")}</SectionTitle>
      <div className="mt-6 grid gap-x-10 gap-y-6 sm:grid-cols-3">
        {features.map((feature, i) => (
          <div
            key={feature.title}
            className="landing-reveal-item text-sm leading-relaxed"
            style={cssVars({ "--i": i + 1 })}
          >
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
  const reveal = useReveal()
  return (
    <section
      ref={reveal}
      className="flex flex-col items-start gap-4 border-t border-border-dim pt-10"
    >
      <p className="landing-reveal-item font-mono text-sm text-ink-dim">
        {t("landing.cta")}
      </p>
      <SignInButton
        className="landing-reveal-item"
        style={cssVars({ "--i": 1 })}
      />
    </section>
  )
}

function SignInButton({
  size,
  className,
  style,
}: {
  size?: "lg"
  className?: string
  style?: React.CSSProperties
}) {
  const t = useT()
  return (
    <a
      href="/auth/login"
      style={style}
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
