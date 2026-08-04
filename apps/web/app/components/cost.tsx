import { cn } from "~/lib/utils"

/**
 * The cost vocabulary, shared by the pool ledger, the run history and the
 * spend page so all three say the same thing the same way.
 *
 * **Magnitude is a tick, never a colour.** The row beside this one already
 * spends green on fresh, yellow on stale and red on unreachable; a green
 * "cheap" chip next to a yellow "stale" chip makes cost read as health, and
 * an expensive routine is not a sick one. Absolute thresholds would be worse
 * still — ADR-0060's figure is imputed at list prices, undercounts the
 * publishing turns, and bills against a subscription nobody was charged
 * against, so "expensive" is not a claim this number can carry. The bar is
 * therefore neutral ink, scaled against the heaviest peer on screen:
 * self-calibrating, answers "which of these is the big one" in one sweep,
 * and asserts nothing about whether that is bad.
 */

/** Dollars at the precision the figure earns: cents for a run that cost some,
    four places below a cent so a cheap run reads as cheap rather than free. */
export function usdLabel(usd: number): string {
  return usd >= 0.01 ? `$${usd.toFixed(2)}` : `$${usd.toFixed(4)}`
}

/** Tokens in the unit that fits. Runs spend millions, and "14009812" is a
    number the eye has to count digits on. */
export function tokensLabel(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`
  return String(tokens)
}

/**
 * The magnitude bar: a fixed track so every tick in a column shares a left
 * edge and a length, which is what turns a column of them into a chart the
 * eye reads without instruction.
 *
 * Decorative by construction — `aria-hidden`, because the figure beside it
 * states the same value in text. Square, since it does not float (DESIGN.md
 * gives radius only to things that do), and neutral `ink-faint`, the glyph
 * role that clears WCAG 1.4.11's 3:1 for non-text.
 *
 * A nonzero value never renders as an empty track: below the floor the fill
 * is pinned to 2px, because a bar that rounds a real cost down to invisible
 * is the same lie as printing zero.
 */
export function CostTick({
  value,
  max,
  className,
}: {
  value: number
  /** The heaviest peer on screen. ≤ 0 (nothing to compare against) draws no
      track at all rather than a full bar with no meaning. */
  max: number
  className?: string
}) {
  if (!(max > 0) || !(value > 0)) return null
  const pct = Math.min(100, (value / max) * 100)
  return (
    <span
      aria-hidden
      className={cn(TRACK_CLS, "inline-block bg-border-dim", className)}
    >
      {/* Linear, never log or sqrt: a bar whose length is not proportional to
          its value is a chart that lies about ratios, and the whole point of
          the tick is that the ratio is readable without arithmetic. Spend is
          outlier-heavy, so most bars are short — that *is* the finding. */}
      <span
        className="block h-full min-w-[3px] bg-ink-faint"
        style={{ width: `${pct}%` }}
      />
    </span>
  )
}

/** The tick's box, shared with the spacer that keeps a dash on the same left
    edge as the figures around it. */
const TRACK_CLS = "h-1.5 w-12 shrink-0"

/** The resting state of every cost slot: a receipt that carried no price, a
    routine that has not reported one yet. A dash, never a zero — absence and
    free are different facts (ADR-0060). */
export function CostDash() {
  return (
    <span aria-hidden className="text-ink-dim">
      —
    </span>
  )
}

/**
 * A cost as a ledger cell: the tick first so the bars align down the column,
 * then the figure. Approximation is marked on the figure itself (`≈`), which
 * the hint text then explains — a symbol carrying the whole caveat alone
 * would be a caveat nobody reads.
 */
export function CostCell({
  usd,
  max,
  title,
}: {
  /** null → nothing priced here: the dash, with no track. */
  usd: number | null
  max: number
  title?: string
}) {
  return (
    <span className="inline-flex items-center gap-2" title={title}>
      {/* An unpriced row still spends the track's width, so every value in
          the column — figure or dash — starts at one left edge. A ledger with
          two value edges reads as two columns crammed into one. */}
      {usd == null ? (
        <span aria-hidden className={cn(TRACK_CLS, "inline-block")} />
      ) : (
        <CostTick value={usd} max={max} />
      )}
      {usd == null ? (
        <CostDash />
      ) : (
        <span className="tabular-nums">≈{usdLabel(usd)}</span>
      )}
    </span>
  )
}
